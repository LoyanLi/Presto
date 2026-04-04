export const manifest = {
  pluginId: 'official.batch-ara-backup-automation',
  extensionType: 'automation',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: ['pro_tools'],
  uiRuntime: 'react18',
  displayName: 'Batch Backup Rename',
  description:
    'Duplicate the selected tracks as backups, rename the duplicates to .bak, then hide and inactivate them.',
  entry: 'dist/entry.mjs',
  pages: [],
  automationItems: [
    {
      itemId: 'batch-ara-backup-render.card',
      title: 'Batch Backup Rename',
      automationType: 'batchAraBackupRender',
      description:
        'Back up the selected tracks, rename the duplicates to .bak, then hide/inactivate them.',
      order: 20,
      runnerExport: 'runBatchAraBackupAutomation',
      optionsSchema: [
        {
          optionId: 'hideBackupTracks',
          kind: 'boolean',
          label: 'Hide backup tracks',
          defaultValue: true,
        },
        {
          optionId: 'makeBackupTracksInactive',
          kind: 'boolean',
          label: 'Make backup tracks inactive',
          defaultValue: true,
        },
      ],
    },
  ],
  requiredCapabilities: ['track.selection.get', 'track.rename', 'track.hidden.set', 'track.inactive.set'],
  adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
  capabilityRequirements: [
    { capabilityId: 'track.selection.get', minVersion: '2025.10.0' },
    { capabilityId: 'track.rename', minVersion: '2025.10.0' },
    { capabilityId: 'track.hidden.set', minVersion: '2025.10.0' },
    { capabilityId: 'track.inactive.set', minVersion: '2025.10.0' },
  ],
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Batch backup rename automation plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

function toBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback
}

function ensureTrustedAccessibility(result) {
  if (!result?.ok) {
    throw new Error(`macAccessibility preflight failed: ${result?.error ?? 'unknown error'}`)
  }
  if (!result.trusted) {
    throw new Error('macAccessibility access is not trusted.')
  }
}

async function runMacScript(macAccessibility, script, args = []) {
  const result = await macAccessibility.runScript(script, args)
  if (!result?.ok) {
    throw new Error(result?.error?.message ?? 'macAccessibility script execution failed.')
  }
  return result
}

function buildDuplicateTracksScript() {
  return `
on run argv
  tell application "Pro Tools" to activate
  delay 0.1
  tell application "System Events"
    tell process "Pro Tools"
      set frontmost to true
      delay 0.1
      click menu bar item "Track" of menu bar 1
      delay 0.1
      click menu item "Duplicate..." of menu 1 of menu bar item "Track" of menu bar 1
      repeat 50 times
        if exists (button "OK" of window 1) then
          click button "OK" of window 1
          exit repeat
        end if
        delay 0.1
      end repeat
      delay 0.1
      key code 53
    end tell
  end tell
  return "duplicated"
end run
`.trim()
}

function buildBackupTrackNames(sourceTrackNames) {
  return sourceTrackNames.map((trackName) => `${trackName}.bak`)
}

async function renameBackupTracks(context, backupTrackNames, renamedBackupTrackNames) {
  for (let index = 0; index < backupTrackNames.length; index += 1) {
    await context.presto.track.rename({
      currentName: backupTrackNames[index],
      newName: renamedBackupTrackNames[index],
    })
  }
}

async function applyBackupTrackState(context, backupTrackNames, hideBackupTracks, makeBackupTracksInactive) {
  if (hideBackupTracks) {
    await context.presto.track.hidden.set({
      trackNames: backupTrackNames,
      enabled: true,
    })
  }

  if (makeBackupTracksInactive) {
    await context.presto.track.inactive.set({
      trackNames: backupTrackNames,
      enabled: true,
    })
  }
}

export async function runBatchAraBackupAutomation(context, input = {}) {
  const hideBackupTracks = toBoolean(input.hideBackupTracks, true)
  const makeBackupTracksInactive = toBoolean(input.makeBackupTracksInactive, true)

  ensureTrustedAccessibility(await context.macAccessibility.preflight())

  const selection = await context.presto.track.selection.get()
  const sourceTrackNames = Array.isArray(selection?.trackNames) ? selection.trackNames.filter(Boolean) : []
  if (sourceTrackNames.length === 0) {
    throw new Error('No source tracks are selected.')
  }

  await runMacScript(context.macAccessibility, buildDuplicateTracksScript())
  const backupSelection = await context.presto.track.selection.get()
  const backupTrackNames = Array.isArray(backupSelection?.trackNames) ? backupSelection.trackNames.filter(Boolean) : []
  if (backupTrackNames.length === 0) {
    throw new Error('No duplicated backup tracks are selected after duplication.')
  }
  if (backupTrackNames.length !== sourceTrackNames.length) {
    throw new Error('Duplicated backup track count does not match the source selection.')
  }

  const renamedBackupTrackNames = buildBackupTrackNames(sourceTrackNames)
  await renameBackupTracks(context, backupTrackNames, renamedBackupTrackNames)
  await applyBackupTrackState(context, renamedBackupTrackNames, hideBackupTracks, makeBackupTracksInactive)

  return {
    steps: [
      { id: 'selection.read', status: 'succeeded', message: `Selected ${sourceTrackNames.length} source tracks.` },
      { id: 'track.duplicate', status: 'succeeded', message: 'Duplicated the current track selection.' },
      {
        id: 'backup.resolve',
        status: 'succeeded',
        message: `Resolved ${backupTrackNames.length} duplicated backup tracks from the current selection.`,
      },
      {
        id: 'backup.rename',
        status: 'succeeded',
        message: `Renamed ${renamedBackupTrackNames.length} duplicated backup tracks to .bak names.`,
      },
      {
        id: 'backup.hideInactive',
        status: 'succeeded',
        message: 'Applied backup-track visibility and activation changes.',
      },
    ],
    summary: `Backed up ${sourceTrackNames.length} selected tracks, renamed the duplicated backup tracks to .bak, then hid and inactivated them.`,
  }
}

export function getActivePluginId() {
  return activePluginId
}
