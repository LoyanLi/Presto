import type { DawTarget } from '../daw/targets'
import type { JobAcceptedResponse, JobsCancelResponse, JobsCreateResponse, JobsDeleteResponse, JobsGetResponse, JobsListResponse, JobsUpdateResponse } from '../jobs/job'

export interface HealthStatus {
  backendReady: boolean
  dawConnected: boolean
  activeDaw: DawTarget
}

export interface CategoryTemplate {
  id: string
  name: string
  colorSlot: number
  previewHex: string
}

export interface SilenceProfile {
  thresholdDb: number
  minStripMs: number
  minSilenceMs: number
  startPadMs: number
  endPadMs: number
}

export interface AiNamingConfig {
  enabled: boolean
  baseUrl: string
  model: string
  timeoutSeconds: number
  keychainService: string
  keychainAccount: string
}

export interface UiPreferences {
  logsCollapsedByDefault: boolean
  followSystemTheme: boolean
  developerModeEnabled: boolean
}

export interface HostPreferences {
  language: 'system' | 'zh-CN' | 'en'
  dawTarget: DawTarget
  includePrereleaseUpdates: boolean
}

export interface AppConfig {
  categories: CategoryTemplate[]
  silenceProfile: SilenceProfile
  aiNaming: AiNamingConfig
  uiPreferences: UiPreferences
  hostPreferences: HostPreferences
}

export interface SessionInfo {
  sessionName: string
  sessionPath: string
  sampleRate: number
  bitDepth: number
  isPlaying: boolean
  isRecording: boolean
}

export interface TrackInfo {
  id: string
  name: string
  type: string
  format: string
  isMuted: boolean
  isSoloed: boolean
  isRecordEnabled: boolean
  color?: string
  comments?: string
}

export interface TransportStatus {
  state: 'stopped' | 'playing' | 'recording'
  position?: number
  isPlaying: boolean
  isRecording: boolean
}

export interface SnapshotTrackState {
  trackName: string
  isMuted: boolean
  isSoloed: boolean
}

export interface Snapshot {
  name: string
  trackStates: SnapshotTrackState[]
}

export interface ExportSettings {
  outputPath: string
  filePrefix: string
  fileFormat: 'wav' | 'aiff'
  mixSourceName: string
  mixSourceType: 'bus' | 'output' | 'physicalOut' | 'renderer'
  onlineExport: boolean
}

export interface ExportMixWithSourceResponse {
  sourceType: 'bus' | 'output' | 'physicalOut' | 'renderer' | string
  sourceList: string[]
}

export interface SystemHealthResponse extends HealthStatus {}

export interface ConfigGetResponse {
  config: AppConfig
}

export interface ConfigUpdateResponse {
  saved: true
}

export interface DawConnectionConnectResponse {
  connected: boolean
  host: string
  port: number
}

export interface DawConnectionDisconnectResponse {
  disconnected: true
}

export interface DawConnectionGetStatusResponse {
  connected: boolean
  targetDaw: DawTarget
  host?: string
  port?: number
}

export interface DawAdapterModuleSnapshot {
  moduleId: string
  version: string
}

export interface DawAdapterCapabilitySnapshot {
  capabilityId: string
  moduleId: string
  version: string
}

export interface DawAdapterGetSnapshotResponse {
  targetDaw: DawTarget
  adapterVersion: string
  hostVersion: string
  modules: DawAdapterModuleSnapshot[]
  capabilities: DawAdapterCapabilitySnapshot[]
}

export interface AutomationSplitStereoToMonoExecuteItem {
  sourceTrackName: string
  keptTrackName: string
  deletedTrackNames: string[]
}

export interface AutomationSplitStereoToMonoExecuteResponse {
  completed: true
  items: AutomationSplitStereoToMonoExecuteItem[]
}

export interface SessionGetInfoResponse {
  session: SessionInfo
}

export interface SessionGetLengthResponse {
  seconds: number
}

export interface SessionSaveResponse {
  saved: true
}

export interface TrackListResponse {
  tracks: TrackInfo[]
}

export interface TrackListNamesResponse {
  names: string[]
}

export interface TrackSelectionGetResponse {
  trackNames: string[]
}

export interface TrackRenameResponse {
  renamed: true
  trackName: string
}

export interface TrackSelectResponse {
  selected: true
}

export interface TrackColorApplyResponse {
  applied: true
  trackName: string
  colorSlot: number
}

export interface TrackPanSetResponse {
  updated: true
  trackName: string
  value: number
}

export interface TrackMuteSetResponse {
  updated: true
  trackNames: string[]
  enabled: boolean
}

export interface TrackSoloSetResponse {
  updated: true
  trackNames: string[]
  enabled: boolean
}

export interface TrackHiddenSetResponse {
  updated: true
  trackNames: string[]
  enabled: boolean
}

export interface TrackInactiveSetResponse {
  updated: true
  trackNames: string[]
  enabled: boolean
}

export type TrackRecordEnableSetResponse = TrackMuteSetResponse

export type TrackRecordSafeSetResponse = TrackMuteSetResponse

export type TrackInputMonitorSetResponse = TrackMuteSetResponse

export type TrackOnlineSetResponse = TrackMuteSetResponse

export type TrackFrozenSetResponse = TrackMuteSetResponse

export type TrackOpenSetResponse = TrackMuteSetResponse

export interface ClipSelectAllOnTrackResponse {
  selected: true
}

export interface TransportPlayResponse {
  started: true
}

export interface TransportStopResponse {
  stopped: true
}

export interface TransportRecordResponse {
  recording: true
}

export interface TransportGetStatusResponse {
  transport: TransportStatus
}

export interface WorkflowRunStartResponse {
  jobId: JobAcceptedResponse['jobId']
  capability: 'workflow.run.start'
  state: JobAcceptedResponse['state']
}

export interface ImportAnalyzeRow {
  filePath: string
  categoryId: string
  aiName: string
  finalName: string
  status: string
  errorMessage: string | null
}

export interface ImportAnalyzeResponse {
  folderPaths: string[]
  orderedFilePaths: string[]
  rows: ImportAnalyzeRow[]
  cache: {
    files: number
    hits: number
  }
}

export interface ImportCacheSaveResponse {
  saved: true
  cacheFiles: number
}

export interface ImportPlanRunItemsResponse {
  items: Array<{
    currentTrackName: string
    finalTrackName: string
    colorSlot: number | null
    shouldApplyColor: boolean
    stripAfterImport: boolean
  }>
}

export interface ImportRunStartResponse {
  jobId: JobAcceptedResponse['jobId']
  capability: 'import.run.start'
  state: JobAcceptedResponse['state']
}

export interface ExportRangeSetResponse {
  selection: {
    inTime: string
    outTime: string
  }
}

export interface ExportStartResponse {
  jobId: JobAcceptedResponse['jobId']
  capability: 'export.start'
  state: JobAcceptedResponse['state']
}

export interface ExportDirectStartResponse {
  jobId: JobAcceptedResponse['jobId']
  capability: 'export.direct.start'
  state: JobAcceptedResponse['state']
}

export interface ExportRunStartResponse {
  jobId: JobAcceptedResponse['jobId']
  capability: 'export.run.start'
  state: JobAcceptedResponse['state']
}

export interface StripSilenceOpenResponse {
  opened: true
}

export interface StripSilenceExecuteResponse {
  completed: true
}

export interface SessionApplySnapshotResponse {
  applied: true
  successCount: number
  errorCount: number
  skippedCount: number
}

export interface SessionGetSnapshotInfoResponse {
  snapshot: Snapshot
  statistics: {
    totalTracks: number
    mutedTracks: number
    soloedTracks: number
    normalTracks: number
  }
}

export interface CapabilityResponseMap {
  'system.health': SystemHealthResponse
  'config.get': ConfigGetResponse
  'config.update': ConfigUpdateResponse
  'daw.connection.connect': DawConnectionConnectResponse
  'daw.connection.disconnect': DawConnectionDisconnectResponse
  'daw.connection.getStatus': DawConnectionGetStatusResponse
  'daw.adapter.getSnapshot': DawAdapterGetSnapshotResponse
  'automation.splitStereoToMono.execute': AutomationSplitStereoToMonoExecuteResponse
  'session.getInfo': SessionGetInfoResponse
  'session.getLength': SessionGetLengthResponse
  'session.save': SessionSaveResponse
  'session.applySnapshot': SessionApplySnapshotResponse
  'session.getSnapshotInfo': SessionGetSnapshotInfoResponse
  'track.list': TrackListResponse
  'track.listNames': TrackListNamesResponse
  'track.selection.get': TrackSelectionGetResponse
  'track.rename': TrackRenameResponse
  'track.select': TrackSelectResponse
  'track.color.apply': TrackColorApplyResponse
  'track.pan.set': TrackPanSetResponse
  'track.mute.set': TrackMuteSetResponse
  'track.solo.set': TrackSoloSetResponse
  'track.hidden.set': TrackHiddenSetResponse
  'track.inactive.set': TrackInactiveSetResponse
  'track.recordEnable.set': TrackRecordEnableSetResponse
  'track.recordSafe.set': TrackRecordSafeSetResponse
  'track.inputMonitor.set': TrackInputMonitorSetResponse
  'track.online.set': TrackOnlineSetResponse
  'track.frozen.set': TrackFrozenSetResponse
  'track.open.set': TrackOpenSetResponse
  'clip.selectAllOnTrack': ClipSelectAllOnTrackResponse
  'transport.play': TransportPlayResponse
  'transport.stop': TransportStopResponse
  'transport.record': TransportRecordResponse
  'transport.getStatus': TransportGetStatusResponse
  'workflow.run.start': WorkflowRunStartResponse
  'import.analyze': ImportAnalyzeResponse
  'import.cache.save': ImportCacheSaveResponse
  'import.planRunItems': ImportPlanRunItemsResponse
  'import.run.start': ImportRunStartResponse
  'stripSilence.open': StripSilenceOpenResponse
  'stripSilence.execute': StripSilenceExecuteResponse
  'export.range.set': ExportRangeSetResponse
  'export.start': ExportStartResponse
  'export.direct.start': ExportDirectStartResponse
  'export.run.start': ExportRunStartResponse
  'jobs.create': JobsCreateResponse
  'jobs.update': JobsUpdateResponse
  'jobs.get': JobsGetResponse
  'jobs.list': JobsListResponse
  'jobs.cancel': JobsCancelResponse
  'jobs.delete': JobsDeleteResponse
}
