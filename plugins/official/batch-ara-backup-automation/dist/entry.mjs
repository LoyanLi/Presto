function isZhCnLocale(locale) {
  const candidates = [locale?.resolved, locale?.requested, locale?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
}

function t(locale, key, replacements = {}) {
  const messages = {
    en: {
      displayName: 'Batch Backup Rename',
      description: 'Duplicate the selected tracks as backups, rename the duplicates to .bak, then hide and inactivate them.',
      itemTitle: 'Batch Backup Rename',
      itemDescription: 'Back up the selected tracks, rename the duplicates to .bak, then hide/inactivate them.',
      hideBackupTracks: 'Hide backup tracks',
      makeBackupTracksInactive: 'Make backup tracks inactive',
      macNotTrusted: 'macAccessibility access is not trusted.',
      noSourceTracks: 'No source tracks are selected.',
      noDuplicatedTracks: 'No duplicated backup tracks are selected after duplication.',
      mismatchCount: 'Duplicated backup track count does not match the source selection.',
      selectedTracks: 'Selected {count} source tracks.',
      duplicatedSelection: 'Duplicated the current track selection.',
      resolvedBackups: 'Resolved {count} duplicated backup tracks from the current selection.',
      renamedBackups: 'Renamed {count} duplicated backup tracks to .bak names.',
      appliedState: 'Applied backup-track visibility and activation changes.',
      summary: 'Backed up {count} selected tracks, renamed the duplicated backup tracks to .bak, then hid and inactivated them.',
    },
    'zh-CN': {
      displayName: '批量备份重命名',
      description: '把所选轨道复制成备份，将复制结果重命名为 .bak，然后隐藏并设为非激活。',
      itemTitle: '批量备份重命名',
      itemDescription: '备份所选轨道，把复制结果重命名为 .bak，然后隐藏并设为非激活。',
      hideBackupTracks: '隐藏备份轨道',
      makeBackupTracksInactive: '将备份轨道设为非激活',
      macNotTrusted: 'macAccessibility 权限未被信任。',
      noSourceTracks: '当前没有选中源轨道。',
      noDuplicatedTracks: '复制完成后没有选中任何备份轨道。',
      mismatchCount: '复制出来的备份轨道数量与源轨道选择不一致。',
      selectedTracks: '已读取 {count} 条源轨道。',
      duplicatedSelection: '已复制当前轨道选择。',
      resolvedBackups: '已从当前选择中解析出 {count} 条复制的备份轨道。',
      renamedBackups: '已将 {count} 条复制出来的备份轨道重命名为 .bak。',
      appliedState: '已完成备份轨道的可见性和激活状态设置。',
      summary: '已备份 {count} 条所选轨道，将复制出来的备份轨道重命名为 .bak，并执行隐藏和非激活。',
    },
  }
  const localeKey = isZhCnLocale(locale) ? 'zh-CN' : 'en'
  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value)),
    messages[localeKey][key] ?? messages.en[key] ?? key,
  )
}

const baseManifest = {
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
  requiredCapabilities: ['daw.track.selection.get', 'daw.track.rename', 'daw.track.hidden.set', 'daw.track.inactive.set'],
  adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
}

export const manifest = baseManifest

export function resolveManifest(locale) {
  if (!isZhCnLocale(locale)) {
    return baseManifest
  }

  return {
    ...baseManifest,
    displayName: t(locale, 'displayName'),
    description: t(locale, 'description'),
    automationItems: [
      {
        ...baseManifest.automationItems[0],
        title: t(locale, 'itemTitle'),
        description: t(locale, 'itemDescription'),
        optionsSchema: [
          {
            ...baseManifest.automationItems[0].optionsSchema[0],
            label: t(locale, 'hideBackupTracks'),
          },
          {
            ...baseManifest.automationItems[0].optionsSchema[1],
            label: t(locale, 'makeBackupTracksInactive'),
          },
        ],
      },
    ],
  }
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

function ensureTrustedAccessibility(result, locale) {
  if (!result?.ok) {
    throw new Error(`macAccessibility preflight failed: ${result?.error ?? 'unknown error'}`)
  }
  if (!result.trusted) {
    throw new Error(t(locale, 'macNotTrusted'))
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

  ensureTrustedAccessibility(await context.macAccessibility.preflight(), context?.locale)

  const selection = await context.presto.track.selection.get()
  const sourceTrackNames = Array.isArray(selection?.trackNames) ? selection.trackNames.filter(Boolean) : []
  if (sourceTrackNames.length === 0) {
    throw new Error(t(context?.locale, 'noSourceTracks'))
  }

  await runMacScript(context.macAccessibility, buildDuplicateTracksScript())
  const backupSelection = await context.presto.track.selection.get()
  const backupTrackNames = Array.isArray(backupSelection?.trackNames) ? backupSelection.trackNames.filter(Boolean) : []
  if (backupTrackNames.length === 0) {
    throw new Error(t(context?.locale, 'noDuplicatedTracks'))
  }
  if (backupTrackNames.length !== sourceTrackNames.length) {
    throw new Error(t(context?.locale, 'mismatchCount'))
  }

  const renamedBackupTrackNames = buildBackupTrackNames(sourceTrackNames)
  await renameBackupTracks(context, backupTrackNames, renamedBackupTrackNames)
  await applyBackupTrackState(context, renamedBackupTrackNames, hideBackupTracks, makeBackupTracksInactive)

  return {
    steps: [
      { id: 'selection.read', status: 'succeeded', message: t(context?.locale, 'selectedTracks', { count: sourceTrackNames.length }) },
      { id: 'track.duplicate', status: 'succeeded', message: t(context?.locale, 'duplicatedSelection') },
      {
        id: 'backup.resolve',
        status: 'succeeded',
        message: t(context?.locale, 'resolvedBackups', { count: backupTrackNames.length }),
      },
      {
        id: 'backup.rename',
        status: 'succeeded',
        message: t(context?.locale, 'renamedBackups', { count: renamedBackupTrackNames.length }),
      },
      {
        id: 'backup.hideInactive',
        status: 'succeeded',
        message: t(context?.locale, 'appliedState'),
      },
    ],
    summary: t(context?.locale, 'summary', { count: sourceTrackNames.length }),
  }
}

export function getActivePluginId() {
  return activePluginId
}
