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
  let selectionIndex = 0
  const selectionResponses = overrides.selectionResponses ?? [
    { trackNames: ['Lead Vox', 'Lead Vox Double'] },
    { trackNames: ['Lead Vox.dup1', 'Lead Vox Double.dup1'] },
  ]
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
            calls.push({ type: 'daw.track.selection.get' })
            const response = selectionResponses[Math.min(selectionIndex, selectionResponses.length - 1)]
            selectionIndex += 1
            return response
          },
        },
        async rename(request) {
          calls.push({ type: 'daw.track.rename', request })
          return { trackName: request.newName }
        },
        hidden: {
          async set(request) {
            calls.push({ type: 'daw.track.hidden.set', request })
            return { updated: true, ...request }
          },
        },
        inactive: {
          async set(request) {
            calls.push({ type: 'daw.track.inactive.set', request })
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
    'daw.track.selection.get',
    'daw.track.rename',
    'daw.track.hidden.set',
    'daw.track.inactive.set',
  ])
  assert.deepEqual(pluginModule.manifest.capabilityRequirements, [
    { capabilityId: 'daw.track.selection.get', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.rename', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.hidden.set', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.inactive.set', minVersion: '2025.10.0' },
  ])
})

test('batch ara backup automation resolves zh-CN manifest and runner messages inside the plugin', async () => {
  const pluginModule = await loadPluginModule()
  const localizedManifest = pluginModule.resolveManifest({
    requested: 'zh-CN',
    resolved: 'zh-CN',
  })

  assert.equal(localizedManifest.displayName, '批量备份重命名')
  assert.equal(localizedManifest.automationItems[0]?.title, '批量备份重命名')
  assert.equal(localizedManifest.automationItems[0]?.optionsSchema[0]?.label, '隐藏备份轨道')
  assert.equal(localizedManifest.automationItems[0]?.optionsSchema[1]?.label, '将备份轨道设为非激活')

  const { context } = createRunnerContext({
    locale: {
      requested: 'zh-CN',
      resolved: 'zh-CN',
    },
  })
  const result = await pluginModule.runBatchAraBackupAutomation(context, {
    hideBackupTracks: true,
    makeBackupTracksInactive: true,
  })

  assert.equal(result.steps[0]?.message, '已读取 2 条源轨道。')
  assert.equal(result.steps[1]?.message, '已复制当前轨道选择。')
  assert.equal(result.summary, '已备份 2 条所选轨道，将复制出来的备份轨道重命名为 .bak，并执行隐藏和非激活。')
})

test('batch ara backup automation runner renames duplicated tracks to .bak before hiding and inactivating them', async () => {
  const pluginModule = await loadPluginModule()
  const { context, calls } = createRunnerContext()

  const result = await pluginModule.runBatchAraBackupAutomation(context, {
    hideBackupTracks: true,
    makeBackupTracksInactive: true,
  })

  assert.deepEqual(calls.map((call) => call.type), [
    'mac.preflight',
    'daw.track.selection.get',
    'mac.runScript',
    'daw.track.selection.get',
    'daw.track.rename',
    'daw.track.rename',
    'daw.track.hidden.set',
    'daw.track.inactive.set',
  ])

  assert.deepEqual(
    calls.filter((call) => call.type === 'daw.track.rename').map((call) => call.request),
    [
      { currentName: 'Lead Vox.dup1', newName: 'Lead Vox.bak' },
      { currentName: 'Lead Vox Double.dup1', newName: 'Lead Vox Double.bak' },
    ],
  )
  assert.deepEqual(calls[6].request, {
    trackNames: ['Lead Vox.bak', 'Lead Vox Double.bak'],
    enabled: true,
  })
  assert.deepEqual(calls[7].request, {
    trackNames: ['Lead Vox.bak', 'Lead Vox Double.bak'],
    enabled: true,
  })
  assert.deepEqual(result.steps, [
    { id: 'selection.read', status: 'succeeded', message: 'Selected 2 source tracks.' },
    { id: 'track.duplicate', status: 'succeeded', message: 'Duplicated the current track selection.' },
    {
      id: 'backup.resolve',
      status: 'succeeded',
      message: 'Resolved 2 duplicated backup tracks from the current selection.',
    },
    {
      id: 'backup.rename',
      status: 'succeeded',
      message: 'Renamed 2 duplicated backup tracks to .bak names.',
    },
    {
      id: 'backup.hideInactive',
      status: 'succeeded',
      message: 'Applied backup-track visibility and activation changes.',
    },
  ])
  assert.equal(
    result.summary,
    'Backed up 2 selected tracks, renamed the duplicated backup tracks to .bak, then hid and inactivated them.',
  )

  const duplicateScript = calls[2].script

  assert.match(duplicateScript, /tell application "Pro Tools" to activate/)
  assert.match(duplicateScript, /set frontmost to true/)
  assert.match(duplicateScript, /click menu bar item "Track" of menu bar 1/)
  assert.match(duplicateScript, /click menu item "Duplicate\.\.\." of menu 1 of menu bar item "Track" of menu bar 1/)
  assert.match(duplicateScript, /click button "OK"/)
  assert.match(duplicateScript, /key code 53/)
})

test('batch ara backup automation fails when duplicated selection count does not match the source selection', async () => {
  const pluginModule = await loadPluginModule()
  const { context } = createRunnerContext({
    selectionResponses: [
      { trackNames: ['Lead Vox', 'Lead Vox Double'] },
      { trackNames: ['Lead Vox.dup1'] },
    ],
  })

  await assert.rejects(
    pluginModule.runBatchAraBackupAutomation(context, {
      hideBackupTracks: true,
      makeBackupTracksInactive: true,
    }),
    /Duplicated backup track count does not match the source selection\./,
  )
})

test('batch ara backup automation respects backup hide and inactive toggles independently', async () => {
  const pluginModule = await loadPluginModule()
  const { context, calls } = createRunnerContext()

  await pluginModule.runBatchAraBackupAutomation(context, {
    hideBackupTracks: false,
    makeBackupTracksInactive: true,
  })

  assert.deepEqual(
    calls.filter((call) => call.type === 'daw.track.hidden.set'),
    [],
  )
  assert.deepEqual(
    calls.filter((call) => call.type === 'daw.track.rename').map((call) => call.request),
    [
      { currentName: 'Lead Vox.dup1', newName: 'Lead Vox.bak' },
      { currentName: 'Lead Vox Double.dup1', newName: 'Lead Vox Double.bak' },
    ],
  )
  assert.deepEqual(
    calls.filter((call) => call.type === 'daw.track.inactive.set').map((call) => call.request),
    [{ trackNames: ['Lead Vox.bak', 'Lead Vox Double.bak'], enabled: true }],
  )
})
