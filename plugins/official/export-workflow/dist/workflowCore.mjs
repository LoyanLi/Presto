const SNAPSHOT_FILE_NAME = 'snapshots.json'
const SNAPSHOT_FOLDER_NAME = 'snapshots'
const PRESET_FILE_NAME = 'presets.json'
const PRESET_FOLDER_NAME = 'Tracktodo'
const EXPORT_WORKFLOW_SETTINGS_KEY = 'settings.v1'

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function joinPath(...parts) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .join('/')
}

function dirnameOf(filePath) {
  const normalized = normalizePath(filePath)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : ''
}

function basenameOf(filePath) {
  const normalized = normalizePath(filePath)
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

function bareSessionName(sessionInfo) {
  const raw =
    String(sessionInfo?.sessionName ?? sessionInfo?.session_name ?? basenameOf(sessionInfo?.sessionPath ?? sessionInfo?.session_path ?? ''))
      .trim()
      .replace(/\.[^.]+$/, '')
  return raw || 'Project'
}

function randomFragment() {
  return Math.random().toString(36).slice(2, 11)
}

export function createDefaultExportSettings(sessionInfo) {
  return {
    file_format: 'wav',
    mix_sources: [],
    online_export: false,
    file_prefix: `${bareSessionName(sessionInfo)}_`,
    output_path: '',
  }
}

export function createDefaultExportWorkflowSettings() {
  return {
    defaultSnapshotSelection: 'all',
    mobileProgressEnabled: false,
  }
}

export function mergeExportWorkflowSettings(raw) {
  const defaults = createDefaultExportWorkflowSettings()
  const defaultSnapshotSelection =
    raw?.defaultSnapshotSelection === 'none'
      ? 'none'
      : defaults.defaultSnapshotSelection

  return {
    defaultSnapshotSelection,
    mobileProgressEnabled: Boolean(raw?.mobileProgressEnabled),
  }
}

export async function loadExportWorkflowSettings(storage) {
  const stored = storage && typeof storage.get === 'function'
    ? await storage.get(EXPORT_WORKFLOW_SETTINGS_KEY)
    : null
  return mergeExportWorkflowSettings(stored)
}

export async function saveExportWorkflowSettings(storage, settings) {
  const normalized = mergeExportWorkflowSettings(settings)
  if (storage && typeof storage.set === 'function') {
    await storage.set(EXPORT_WORKFLOW_SETTINGS_KEY, normalized)
  }
  return normalized
}

export function normalizeSnapshot(rawSnapshot) {
  const now = new Date().toISOString()
  const trackStates = Array.isArray(rawSnapshot?.trackStates)
    ? rawSnapshot.trackStates
        .filter((trackState) => trackState && typeof trackState === 'object')
        .map((trackState) => ({
          trackId: String(trackState.trackId ?? ''),
          trackName: String(trackState.trackName ?? '').trim(),
          is_soloed: Boolean(trackState.is_soloed ?? trackState.isSoloed),
          is_muted: Boolean(trackState.is_muted ?? trackState.isMuted),
          type: String(trackState.type ?? 'audio') || 'audio',
          color: typeof trackState.color === 'string' ? trackState.color : undefined,
        }))
        .filter((trackState) => trackState.trackName)
    : []

  return {
    id: String(rawSnapshot?.id ?? `snapshot_${Date.now()}_${randomFragment()}`),
    name: String(rawSnapshot?.name ?? '').trim() || 'Untitled Snapshot',
    trackStates,
    createdAt: String(rawSnapshot?.createdAt ?? now),
    updatedAt: String(rawSnapshot?.updatedAt ?? rawSnapshot?.createdAt ?? now),
  }
}

export function createSnapshotFromTracks(name, tracks) {
  const now = new Date().toISOString()
  return normalizeSnapshot({
    id: `snapshot_${Date.now()}_${randomFragment()}`,
    name,
    createdAt: now,
    updatedAt: now,
    trackStates: (Array.isArray(tracks) ? tracks : []).map((track) => ({
      trackId: String(track?.id ?? ''),
      trackName: String(track?.name ?? '').trim(),
      is_soloed: Boolean(track?.is_soloed ?? track?.isSoloed),
      is_muted: Boolean(track?.is_muted ?? track?.isMuted),
      type: String(track?.type ?? 'audio') || 'audio',
      color: typeof track?.color === 'string' ? track.color : undefined,
    })),
  })
}

export function summarizeSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot)
  const mutedTracks = normalized.trackStates.filter((track) => track.is_muted).length
  const soloedTracks = normalized.trackStates.filter((track) => track.is_soloed).length
  return {
    totalTracks: normalized.trackStates.length,
    mutedTracks,
    soloedTracks,
  }
}

export function validateSnapshotName(name, snapshots, excludeId = '') {
  const normalized = String(name ?? '').trim()
  if (!normalized) {
    return 'Snapshot name is required.'
  }
  const hasDuplicate = (Array.isArray(snapshots) ? snapshots : []).some((snapshot) => {
    const current = normalizeSnapshot(snapshot)
    return current.id !== excludeId && current.name.toLowerCase() === normalized.toLowerCase()
  })
  return hasDuplicate ? `Snapshot name "${normalized}" already exists.` : ''
}

export function getSnapshotStorageInfo(sessionInfo) {
  const sessionPath = normalizePath(sessionInfo?.sessionPath ?? sessionInfo?.session_path ?? '')
  const projectPath = dirnameOf(sessionPath)
  const storageDir = projectPath ? joinPath(projectPath, SNAPSHOT_FOLDER_NAME) : ''
  return {
    sessionPath,
    projectPath,
    storageDir,
    snapshotPath: storageDir ? joinPath(storageDir, SNAPSHOT_FILE_NAME) : '',
  }
}

export async function loadSnapshotsFromSession(fsRuntime, sessionInfo) {
  if (!fsRuntime || typeof fsRuntime.readFile !== 'function') {
    return []
  }
  const storageInfo = getSnapshotStorageInfo(sessionInfo)
  if (!storageInfo.snapshotPath) {
    return []
  }
  const content = await fsRuntime.readFile(storageInfo.snapshotPath)
  if (!content) {
    return []
  }
  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed.map(normalizeSnapshot) : []
  } catch {
    return []
  }
}

export async function saveSnapshotsToSession(fsRuntime, sessionInfo, snapshots) {
  if (
    !fsRuntime ||
    typeof fsRuntime.ensureDir !== 'function' ||
    typeof fsRuntime.writeFile !== 'function'
  ) {
    return false
  }
  const storageInfo = getSnapshotStorageInfo(sessionInfo)
  if (!storageInfo.storageDir || !storageInfo.snapshotPath) {
    return false
  }
  await fsRuntime.ensureDir(storageInfo.storageDir)
  await fsRuntime.writeFile(
    storageInfo.snapshotPath,
    JSON.stringify((Array.isArray(snapshots) ? snapshots : []).map(normalizeSnapshot), null, 2),
  )
  return true
}

export async function getPresetStorageInfo(fsRuntime) {
  if (!fsRuntime || typeof fsRuntime.getHomePath !== 'function') {
    return {
      storageDir: '',
      presetPath: '',
    }
  }
  const homePath = normalizePath(await fsRuntime.getHomePath())
  const storageDir = homePath ? joinPath(homePath, 'Documents', PRESET_FOLDER_NAME) : ''
  return {
    storageDir,
    presetPath: storageDir ? joinPath(storageDir, PRESET_FILE_NAME) : '',
  }
}

export function normalizePreset(rawPreset) {
  return {
    id: String(rawPreset?.id ?? `preset_${Date.now()}_${randomFragment()}`),
    name: String(rawPreset?.name ?? '').trim() || 'Untitled Preset',
    file_format: String(rawPreset?.file_format ?? 'wav').trim().toLowerCase() || 'wav',
    mix_source_name: String(rawPreset?.mix_source_name ?? '').trim(),
    mix_source_type: String(rawPreset?.mix_source_type ?? 'PhysicalOut').trim() || 'PhysicalOut',
    createdAt: String(rawPreset?.createdAt ?? new Date().toISOString()),
    updatedAt: rawPreset?.updatedAt ? String(rawPreset.updatedAt) : undefined,
  }
}

export async function loadPresets(fsRuntime) {
  if (!fsRuntime || typeof fsRuntime.readFile !== 'function') {
    return []
  }
  const storageInfo = await getPresetStorageInfo(fsRuntime)
  if (!storageInfo.presetPath) {
    return []
  }
  const content = await fsRuntime.readFile(storageInfo.presetPath)
  if (!content) {
    return []
  }
  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed.map(normalizePreset) : []
  } catch {
    return []
  }
}

export async function savePresets(fsRuntime, presets) {
  if (
    !fsRuntime ||
    typeof fsRuntime.ensureDir !== 'function' ||
    typeof fsRuntime.writeFile !== 'function'
  ) {
    return false
  }
  const storageInfo = await getPresetStorageInfo(fsRuntime)
  if (!storageInfo.storageDir || !storageInfo.presetPath) {
    return false
  }
  await fsRuntime.ensureDir(storageInfo.storageDir)
  await fsRuntime.writeFile(
    storageInfo.presetPath,
    JSON.stringify((Array.isArray(presets) ? presets : []).map(normalizePreset), null, 2),
  )
  return true
}

export function validatePresetName(name, presets, excludeId = '') {
  const normalized = String(name ?? '').trim()
  if (!normalized) {
    return 'Preset name is required.'
  }
  const hasDuplicate = (Array.isArray(presets) ? presets : []).some((preset) => {
    const current = normalizePreset(preset)
    return current.id !== excludeId && current.name.toLowerCase() === normalized.toLowerCase()
  })
  return hasDuplicate ? `Preset name "${normalized}" already exists.` : ''
}

export function buildExportRunPayload({ snapshots, settings }) {
  const normalizedMixSources = Array.isArray(settings?.mix_sources)
    ? settings.mix_sources
        .map((mixSource) => ({
          name: String(mixSource?.name ?? '').trim(),
          type: String(mixSource?.type ?? 'physicalOut').trim() || 'physicalOut',
        }))
        .filter((mixSource) => mixSource.name)
    : []

  const normalizedSettings = {
    file_format: String(settings?.file_format ?? 'wav').trim().toLowerCase() || 'wav',
    mix_sources: normalizedMixSources,
    mix_source_name: normalizedMixSources[0]?.name ?? String(settings?.mix_source_name ?? '').trim(),
    mix_source_type: normalizedMixSources[0]?.type ?? (String(settings?.mix_source_type ?? 'PhysicalOut').trim() || 'PhysicalOut'),
    online_export: Boolean(settings?.online_export),
    file_prefix: String(settings?.file_prefix ?? ''),
    output_path: String(settings?.output_path ?? '').trim(),
  }

  return {
    snapshots: (Array.isArray(snapshots) ? snapshots : []).map((snapshot) => {
      const normalized = normalizeSnapshot(snapshot)
      return {
        id: normalized.id,
        name: normalized.name,
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
        trackStates: normalized.trackStates.map((trackState) => ({
          trackId: trackState.trackId,
          trackName: trackState.trackName,
          is_soloed: trackState.is_soloed,
          is_muted: trackState.is_muted,
          type: trackState.type,
          color: trackState.color,
        })),
      }
    }),
    export_settings: normalizedSettings,
  }
}

export function deriveExportJobView(job) {
  const progress = job?.progress ?? {}
  const metadata = job?.metadata ?? {}
  const result = job?.result ?? {}
  const terminalStatus =
    typeof result.status === 'string'
      ? result.status
      : job?.state === 'succeeded'
        ? 'completed'
        : job?.state ?? 'queued'
  const progressPercent = Number(progress.percent ?? 0)
  const currentFileProgressPercent = Number(
    metadata.currentFileProgressPercent ?? progressPercent,
  )
  const overallProgressPercent = Number(
    metadata.overallProgressPercent ?? progressPercent,
  )

  return {
    jobId: String(job?.jobId ?? ''),
    state: String(job?.state ?? 'queued'),
    terminalStatus,
    progressPercent,
    currentFileProgressPercent,
    overallProgressPercent,
    message: String(progress.message ?? ''),
    currentSnapshot: Number(metadata.currentSnapshot ?? progress.current ?? 0),
    totalSnapshots: Number(metadata.totalSnapshots ?? progress.total ?? 0),
    currentSnapshotName: String(metadata.currentSnapshotName ?? ''),
    currentMixSourceName: String(metadata.currentMixSourceName ?? ''),
    currentMixSourceIndex: Number(metadata.currentMixSourceIndex ?? 0),
    totalMixSources: Number(metadata.totalMixSources ?? 0),
    etaSeconds:
      metadata.etaSeconds === null || metadata.etaSeconds === undefined
        ? null
        : Number(metadata.etaSeconds),
    exportedCount: Number(metadata.exportedCount ?? (Array.isArray(result.exportedFiles) ? result.exportedFiles.length : 0)),
    lastExportedFile:
      typeof metadata.lastExportedFile === 'string' ? metadata.lastExportedFile : '',
    exportedFiles: Array.isArray(result.exportedFiles) ? result.exportedFiles.map((value) => String(value)) : [],
    failedSnapshots: Array.isArray(result.failedSnapshots) ? result.failedSnapshots.map((value) => String(value)) : [],
    failedSnapshotDetails: Array.isArray(result.failedSnapshotDetails)
      ? result.failedSnapshotDetails
          .filter((value) => value && typeof value === 'object')
          .map((value) => ({
            snapshotName: String(value.snapshotName ?? ''),
            error: String(value.error ?? ''),
          }))
          .filter((value) => value.snapshotName)
      : [],
    success: Boolean(result.success),
    errorMessage: typeof result.errorMessage === 'string' && result.errorMessage
      ? result.errorMessage
      : typeof job?.error?.message === 'string'
        ? job.error.message
        : '',
    isTerminal: ['succeeded', 'failed', 'cancelled'].includes(String(job?.state ?? '')),
  }
}
