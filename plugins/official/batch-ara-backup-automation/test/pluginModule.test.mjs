import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

let pluginModulePromise = null

async function loadPluginModule() {
  if (!pluginModulePromise) {
    const entryUrl = new URL('../dist/entry.mjs', import.meta.url)
    entryUrl.searchParams.set('test', String(Date.now()))
    pluginModulePromise = import(entryUrl.href)
  }

  return pluginModulePromise
}

function createRunnerContext(overrides = {}) {
  const calls = []
  const context = {
    pluginId: 'official.batch-ara-backup-automation',
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    presto: {
      track: {
        selection: {
          async get() {
            calls.push({ type: 'track.selection.get' })
            const selectionResponses = [
              { trackNames: ['Lead Vox', 'Lead Vox Double'] },
              { trackNames: ['Lead Vox Backup', 'Lead Vox Double Backup'] },
            ]
            return selectionResponses[Math.min(calls.filter((call) => call.type === 'track.selection.get').length - 1, 1)]
          },
        },
        hidden: {
          async set(request) {
            calls.push({ type: 'track.hidden.set', request })
            return { updated: true, ...request }
          },
        },
        inactive: {
          async set(request) {
            calls.push({ type: 'track.inactive.set', request })
            return { updated: true, ...request }
          },
        },
      },
    },
    macAccessibility: {
      async preflight() {
        calls.push({ type: 'mac.preflight' })
        return { ok: true, trusted: true }
      },
      async runScript(script, args) {
        calls.push({ type: 'mac.runScript', script, args })
        return { ok: true, stdout: 'ok' }
      },
    },
    ...overrides,
  }

  return { context, calls }
}

test('batch ara backup automation manifest stays aligned with dist entry essentials', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.deepEqual(fileManifest.requiredCapabilities, pluginModule.manifest.requiredCapabilities)
  assert.deepEqual(fileManifest.adapterModuleRequirements, pluginModule.manifest.adapterModuleRequirements)
  assert.deepEqual(fileManifest.capabilityRequirements, pluginModule.manifest.capabilityRequirements)
  assert.deepEqual(fileManifest.automationItems, pluginModule.manifest.automationItems)
})

test('batch ara backup automation requires track hidden and inactive core capabilities', async () => {
  const pluginModule = await loadPluginModule()

  assert.deepEqual(pluginModule.manifest.requiredCapabilities, [
    'track.selection.get',
    'track.hidden.set',
    'track.inactive.set',
  ])
  assert.deepEqual(pluginModule.manifest.capabilityRequirements, [
    { capabilityId: 'track.selection.get', minVersion: '2025.10.0' },
    { capabilityId: 'track.hidden.set', minVersion: '2025.10.0' },
    { capabilityId: 'track.inactive.set', minVersion: '2025.10.0' },
  ])
})

test('batch ara backup automation runner uses core hidden and inactive track capabilities', async () => {
  const pluginModule = await loadPluginModule()
  const { context, calls } = createRunnerContext()

  const result = await pluginModule.runBatchAraBackupAutomation(context, {
    hideBackupTracks: true,
    makeBackupTracksInactive: true,
  })

  assert.deepEqual(calls.map((call) => call.type), [
    'mac.preflight',
    'track.selection.get',
    'mac.runScript',
    'track.selection.get',
    'track.hidden.set',
    'track.inactive.set',
    'mac.runScript',
    'mac.runScript',
  ])

  assert.deepEqual(calls[4].request, {
    trackNames: ['Lead Vox Backup', 'Lead Vox Double Backup'],
    enabled: true,
  })
  assert.deepEqual(calls[5].request, {
    trackNames: ['Lead Vox Backup', 'Lead Vox Double Backup'],
    enabled: true,
  })
  assert.deepEqual(result.steps, [
    { id: 'selection.read', status: 'succeeded', message: 'Selected 2 source tracks.' },
    { id: 'track.duplicate', status: 'succeeded', message: 'Duplicated the current track selection.' },
    { id: 'backup.resolve', status: 'succeeded', message: 'Resolved 2 duplicated backup tracks from the current selection.' },
    { id: 'backup.hideInactive', status: 'succeeded', message: 'Applied backup-track visibility and activation changes.' },
    { id: 'source.restoreSelection', status: 'succeeded', message: 'Re-selected the original source tracks.' },
    { id: 'ara.disable', status: 'succeeded', message: 'Batch-set Elastic Audio or ARA Plugin selector to None.' },
    { id: 'ara.commit', status: 'succeeded', message: 'Committed the ARA processing dialog.' },
  ])
  assert.equal(
    result.summary,
    'Backed up 2 selected tracks, hid/inactivated the duplicates, and committed ARA render on the source tracks.',
  )

  const duplicateScript = calls[2].script
  const restoreSelectionScript = calls[6].script
  const disableAraScript = calls[7].script

  assert.match(duplicateScript, /click menu item "Duplicate\.\.\." of menu "Track"/)
  assert.match(duplicateScript, /click button "OK"/)
  assert.match(restoreSelectionScript, /argv/)
  assert.match(restoreSelectionScript, /click/)
  assert.match(disableAraScript, /Elastic Audio or ARA Plugin selector/)
  assert.match(
    disableAraScript,
    /click pop up button "Elastic Audio or ARA Plugin selector" of group 1 of window 1 using \{option down, shift down\}/,
  )
  assert.match(disableAraScript, /click menu item "None"/)
  assert.match(disableAraScript, /click button "Commit"/)
})

test('batch ara backup automation respects backup hide and inactive toggles independently', async () => {
  const pluginModule = await loadPluginModule()
  const { context, calls } = createRunnerContext()

  await pluginModule.runBatchAraBackupAutomation(context, {
    hideBackupTracks: false,
    makeBackupTracksInactive: true,
  })

  assert.deepEqual(
    calls.filter((call) => call.type === 'track.hidden.set'),
    [],
  )
  assert.deepEqual(
    calls.filter((call) => call.type === 'track.inactive.set').map((call) => call.request),
    [{ trackNames: ['Lead Vox Backup', 'Lead Vox Double Backup'], enabled: true }],
  )
})
