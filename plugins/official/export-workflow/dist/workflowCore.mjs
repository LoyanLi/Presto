const EXPORT_WORKFLOW_SETTINGS_KEY = 'settings.v1'
const DEFAULT_EXPORT_FILE_NAME_TEMPLATE = '{session}_{snapshot}{source_suffix}'
const SUPPORTED_EXPORT_FILE_NAME_TOKENS = new Set([
  'session',
  'sample_rate',
  'bit_depth',
  'date',
  'time',
  'datetime',
  'year',
  'month',
  'day',
  'snapshot',
  'source',
  'snapshot_index',
  'snapshot_count',
  'source_index',
  'source_count',
  'source_type',
  'source_suffix',
  'file_format',
])

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

function normalizeFileNameSourceType(value) {
  const normalized = String(value ?? 'physicalOut').trim()
  const compact = normalized.replace(/[-_\s]+/g, '').toLowerCase()
  if (compact === 'bus') {
    return 'bus'
  }
  if (compact === 'output') {
    return 'output'
  }
  if (compact === 'renderer') {
    return 'renderer'
  }
  return 'physical_out'
}

function resolveTemplateTimestamp(renderedAt) {
  if (renderedAt instanceof Date && !Number.isNaN(renderedAt.valueOf())) {
    return renderedAt
  }
  if (typeof renderedAt === 'string' || typeof renderedAt === 'number') {
    const parsed = new Date(renderedAt)
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed
    }
  }
  return new Date()
}

function padTemplateNumber(value) {
  return String(value).padStart(2, '0')
}

function buildTemplateDateParts(renderedAt) {
  const timestamp = resolveTemplateTimestamp(renderedAt)
  const year = String(timestamp.getUTCFullYear())
  const month = padTemplateNumber(timestamp.getUTCMonth() + 1)
  const day = padTemplateNumber(timestamp.getUTCDate())
  const hour = padTemplateNumber(timestamp.getUTCHours())
  const minute = padTemplateNumber(timestamp.getUTCMinutes())
  const second = padTemplateNumber(timestamp.getUTCSeconds())

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}-${minute}-${second}`,
    datetime: `${year}-${month}-${day}_${hour}-${minute}-${second}`,
    year,
    month,
    day,
  }
}

function randomFragment() {
  return Math.random().toString(36).slice(2, 11)
}

export function sanitizeExportFileNameComponent(value) {
  return [...String(value ?? '').trim()].filter((char) => /[A-Za-z0-9 _-]/.test(char)).join('').trimEnd()
}

export function createDefaultExportSettings(sessionInfo) {
  return {
    file_format: 'wav',
    mix_sources: [],
    online_export: false,
    file_name_template: DEFAULT_EXPORT_FILE_NAME_TEMPLATE,
    output_path: '',
  }
}

export function createDefaultExportWorkflowSettings() {
  return {
    defaultSnapshotSelection: 'all',
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

export function getSnapshotStorageKey(sessionInfo) {
  const sessionPath = normalizePath(sessionInfo?.sessionPath ?? sessionInfo?.session_path ?? '')
  if (!sessionPath) {
    return ''
  }
  return `sessionSnapshots:${sessionPath}`
}

export async function loadSnapshotsFromStorage(storage, sessionInfo) {
  if (!storage || typeof storage.get !== 'function') {
    return []
  }
  const storageKey = getSnapshotStorageKey(sessionInfo)
  if (!storageKey) {
    return []
  }
  const content = await storage.get(storageKey)
  if (!content) {
    return []
  }
  try {
    const parsed = Array.isArray(content) ? content : JSON.parse(content)
    return Array.isArray(parsed) ? parsed.map(normalizeSnapshot) : []
  } catch {
    return []
  }
}

export async function saveSnapshotsToStorage(storage, sessionInfo, snapshots) {
  if (!storage || typeof storage.set !== 'function') {
    return false
  }
  const storageKey = getSnapshotStorageKey(sessionInfo)
  if (!storageKey) {
    return false
  }
  await storage.set(storageKey, (Array.isArray(snapshots) ? snapshots : []).map(normalizeSnapshot))
  return true
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
    file_name_template: String(settings?.file_name_template ?? '').trim(),
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
    exportSettings: normalizedSettings,
    startTime: null,
    endTime: null,
  }
}

function collectExportFileNameTokens(template) {
  const matches = String(template ?? '').matchAll(/\{([a-z_]+)\}/g)
  return [...matches].map((match) => match[1])
}

function buildExportFileNameTemplateValues({
  sessionInfo,
  snapshotName,
  mixSourceName,
  mixSourceType,
  snapshotIndex,
  snapshotCount,
  sourceIndex,
  sourceCount,
  totalMixSources,
  fileFormat,
  renderedAt,
}) {
  const source = String(mixSourceName ?? '').trim()
  const dateParts = buildTemplateDateParts(renderedAt)
  return {
    session: bareSessionName(sessionInfo),
    sample_rate: String(sessionInfo?.sampleRate ?? sessionInfo?.sample_rate ?? '').trim(),
    bit_depth: String(sessionInfo?.bitDepth ?? sessionInfo?.bit_depth ?? '').trim(),
    date: dateParts.date,
    time: dateParts.time,
    datetime: dateParts.datetime,
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    snapshot: String(snapshotName ?? '').trim(),
    source,
    snapshot_index: String(snapshotIndex),
    snapshot_count: String(snapshotCount),
    source_index: String(sourceIndex),
    source_count: String(sourceCount),
    source_type: normalizeFileNameSourceType(mixSourceType),
    source_suffix: totalMixSources > 1 && source ? `_${source}` : '',
    file_format: String(fileFormat ?? '').trim().toLowerCase(),
  }
}

export function renderExportFileNameTemplate({
  template,
  sessionInfo,
  snapshotName,
  mixSourceName,
  mixSourceType,
  snapshotIndex,
  snapshotCount,
  sourceIndex,
  sourceCount,
  totalMixSources,
  fileFormat,
  renderedAt,
}) {
  const values = buildExportFileNameTemplateValues({
    sessionInfo,
    snapshotName,
    mixSourceName,
    mixSourceType,
    snapshotIndex,
    snapshotCount,
    sourceIndex,
    sourceCount,
    totalMixSources,
    fileFormat,
    renderedAt,
  })
  return String(template ?? '').replace(/\{([a-z_]+)\}/g, (_, token) => String(values[token] ?? ''))
}

export function validateExportFileNameTemplate({ template, sessionInfo, snapshots, mixSources, fileFormat, renderedAt }) {
  const normalizedTemplate = String(template ?? '').trim()
  if (!normalizedTemplate) {
    return 'File name template is required.'
  }

  const unsupportedToken = collectExportFileNameTokens(normalizedTemplate).find((token) => !SUPPORTED_EXPORT_FILE_NAME_TOKENS.has(token))
  if (unsupportedToken) {
    return `Unsupported file name token: {${unsupportedToken}}.`
  }

  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : []
  const normalizedMixSources = Array.isArray(mixSources) && mixSources.length > 0 ? mixSources : [{ name: '', type: 'physicalOut' }]
  const renderedNames = new Set()

  for (const [snapshotOffset, snapshot] of normalizedSnapshots.entries()) {
    const snapshotName = String(snapshot?.name ?? '').trim()
    for (const [sourceOffset, mixSource] of normalizedMixSources.entries()) {
      const rendered = renderExportFileNameTemplate({
        template: normalizedTemplate,
        sessionInfo,
        snapshotName,
        mixSourceName: mixSource?.name,
        mixSourceType: mixSource?.type,
        snapshotIndex: snapshotOffset + 1,
        snapshotCount: normalizedSnapshots.length,
        sourceIndex: sourceOffset + 1,
        sourceCount: normalizedMixSources.length,
        totalMixSources: normalizedMixSources.length,
        fileFormat,
        renderedAt,
      })
      const safeName = sanitizeExportFileNameComponent(rendered)
      if (!safeName) {
        return 'File name template must render at least one character.'
      }
      const dedupeKey = safeName.toLowerCase()
      if (renderedNames.has(dedupeKey)) {
        return 'File name template produces duplicate names. Add {snapshot}, {source}, or an index token.'
      }
      renderedNames.add(dedupeKey)
    }
  }

  return ''
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
