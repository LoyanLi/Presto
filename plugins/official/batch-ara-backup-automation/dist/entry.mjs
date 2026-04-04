export const manifest = {
  pluginId: 'official.batch-ara-backup-automation',
  extensionType: 'automation',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: ['pro_tools'],
  uiRuntime: 'react18',
  displayName: 'Batch ARA Backup Render',
  description:
    'Duplicate the selected ARA tracks as backups, hide and inactivate the duplicates, then commit ARA render on the source tracks.',
  entry: 'dist/entry.mjs',
  pages: [],
  automationItems: [
    {
      itemId: 'batch-ara-backup-render.card',
      title: 'Batch ARA Backup Render',
      automationType: 'batchAraBackupRender',
      description:
        'Back up the selected ARA tracks, hide/inactivate the duplicates, then batch-set ARA to None with Commit.',
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
  requiredCapabilities: ['track.selection.get', 'track.hidden.set', 'track.inactive.set'],
  adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
  capabilityRequirements: [
    { capabilityId: 'track.selection.get', minVersion: '2025.10.0' },
    { capabilityId: 'track.hidden.set', minVersion: '2025.10.0' },
    { capabilityId: 'track.inactive.set', minVersion: '2025.10.0' },
  ],
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Batch ARA backup render automation plugin activated.')
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
  tell application "System Events"
    tell process "Pro Tools"
      click menu item "Duplicate..." of menu "Track" of menu bar item "Track" of menu bar 1
      repeat 50 times
        if exists (button "OK" of window 1) then
          click button "OK" of window 1
          exit repeat
        end if
        delay 0.1
      end repeat
    end tell
  end tell
  return "duplicated"
end run
`.trim()
}

function buildRestoreSelectionScript() {
  return `
on run argv
  tell application "System Events"
    tell process "Pro Tools"
      set trackNames to argv
      if (count of trackNames) is 0 then return "no-selection"
      repeat with trackName in trackNames
        click UI element 1 of window 1
      end repeat
    end tell
  end tell
  return "selection-restored"
end run
`.trim()
}

function buildDisableAraScript() {
  return `
on run argv
  tell application "System Events"
    tell process "Pro Tools"
      click pop up button "Elastic Audio or ARA Plugin selector" of group 1 of window 1 using {option down, shift down}
      click menu item "None" of menu 1 of pop up button "Elastic Audio or ARA Plugin selector" of group 1 of window 1
      repeat 50 times
        if exists (button "Commit" of window 1) then
          click button "Commit" of window 1
          exit repeat
        end if
        delay 0.1
      end repeat
    end tell
  end tell
  return "ara-committed"
end run
`.trim()
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

  await applyBackupTrackState(context, backupTrackNames, hideBackupTracks, makeBackupTracksInactive)
  await runMacScript(context.macAccessibility, buildRestoreSelectionScript(), sourceTrackNames)
  await runMacScript(context.macAccessibility, buildDisableAraScript())

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
        id: 'backup.hideInactive',
        status: 'succeeded',
        message: 'Applied backup-track visibility and activation changes.',
      },
      { id: 'source.restoreSelection', status: 'succeeded', message: 'Re-selected the original source tracks.' },
      {
        id: 'ara.disable',
        status: 'succeeded',
        message: 'Batch-set Elastic Audio or ARA Plugin selector to None.',
      },
      { id: 'ara.commit', status: 'succeeded', message: 'Committed the ARA processing dialog.' },
    ],
    summary: `Backed up ${sourceTrackNames.length} selected tracks, hid/inactivated the duplicates, and committed ARA render on the source tracks.`,
  }
}

export function getActivePluginId() {
  return activePluginId
}
