import type {
  AppConfig,
  SilenceProfile,
  Snapshot,
} from './responses'
import { PTSL_SEMANTIC_CAPABILITY_IDS } from '../generated/capabilityIds'
import type { JobsCancelRequest, JobsCreateRequest, JobsDeleteRequest, JobsGetRequest, JobsListRequest, JobsUpdateRequest } from '../jobs/job'

export interface SystemHealthRequest {}

export interface ConfigGetRequest {}

export interface ConfigUpdateRequest {
  config: AppConfig
  apiKey?: string
}

export interface DawConnectionConnectRequest {
  host?: string
  port?: number
  timeoutSeconds?: number
}

export interface DawConnectionDisconnectRequest {}

export interface DawConnectionGetStatusRequest {}

export interface DawAdapterGetSnapshotRequest {}

export interface DawPtslCatalogListRequest {
  category?: string
  onlyWithPyPtslOp?: boolean
}

export interface DawPtslCommandDescribeRequest {
  commandName: string
}

export interface DawPtslCommandExecuteRequest {
  commandName: string
  payload?: Record<string, unknown>
  minimumHostVersion?: string
}

export interface DawPtslSemanticRequest {
  minimumHostVersion?: string
  [key: string]: unknown
}

export interface AutomationSplitStereoToMonoExecuteRequest {
  keepChannel?: 'left' | 'right'
}

export interface SessionGetInfoRequest {}

export interface SessionGetLengthRequest {}

export interface SessionSaveRequest {}

export interface TrackListRequest {}

export interface TrackListNamesRequest {}

export interface TrackSelectionGetRequest {}

export interface TrackRenameRequest {
  currentName: string
  newName: string
}

export interface TrackSelectRequest {
  trackName?: string
  trackNames?: string[]
}

export interface TrackColorApplyRequest {
  trackName: string
  colorSlot: number
}

export interface TrackPanSetRequest {
  trackName: string
  value: number
}

export interface TrackMuteSetRequest {
  trackNames: string[]
  enabled: boolean
}

export interface TrackSoloSetRequest {
  trackNames: string[]
  enabled: boolean
}

export interface TrackHiddenSetRequest {
  trackNames: string[]
  enabled: boolean
}

export interface TrackInactiveSetRequest {
  trackNames: string[]
  enabled: boolean
}

export type TrackRecordEnableSetRequest = TrackMuteSetRequest

export type TrackRecordSafeSetRequest = TrackMuteSetRequest

export type TrackInputMonitorSetRequest = TrackMuteSetRequest

export type TrackOnlineSetRequest = TrackMuteSetRequest

export type TrackFrozenSetRequest = TrackMuteSetRequest

export type TrackOpenSetRequest = TrackMuteSetRequest

export interface ClipSelectAllOnTrackRequest {
  trackName: string
}

export interface TransportPlayRequest {}

export interface TransportStopRequest {}

export interface TransportRecordRequest {}

export interface TransportGetStatusRequest {}

export interface WorkflowRunStartRequest {
  pluginId: string
  workflowId: string
  input?: Record<string, unknown>
  host?: string
  port?: number
  timeoutSeconds?: number
}

export interface ImportAnalyzeRequest {
  sourceFolders: string[]
  categories?: Array<{ id: string; name?: string }>
  analyzeCacheEnabled?: boolean
}

export interface ImportCacheSaveRequest {
  sourceFolders: string[]
  rows: Array<{
    filePath: string
    categoryId: string
    aiName?: string | null
    finalName?: string | null
    status: string
    errorMessage?: string | null
  }>
}

export interface ImportPlanRunItemsRequest {
  rows: Array<{
    filePath: string
    categoryId: string
    finalName?: string | null
    status: string
    errorMessage?: string | null
  }>
  categories?: Array<{
    id: string
    colorSlot?: number
  }>
  importedTrackNames: string[]
  stripAfterImport?: boolean
}

export interface ImportRunStartRequest {
  folderPaths: string[]
  orderedFilePaths?: string[]
  host?: string
  port?: number
  timeoutSeconds?: number
}

export interface StripSilenceOpenRequest {}

export interface StripSilenceExecuteRequest {
  trackName: string
  profile: SilenceProfile
}

export interface ExportRangeSetRequest {
  inTime: string
  outTime: string
}

export interface ExportAudioRequest {
  format?: string
  bitDepth?: number
  sampleRate?: number
}

export interface ExportSourceRequest {
  type?: string
  name?: string
}

export interface ExportVideoRequest {
  includeVideo?: boolean
}

export interface ExportStartRequest {
  outputPath: string
  fileName: string
  fileType: string
  offline?: boolean
  audio?: ExportAudioRequest
  source?: ExportSourceRequest
  video?: ExportVideoRequest
  importAfterBounce?: boolean
}

export type ExportDirectStartRequest = ExportStartRequest

export interface ExportRunSnapshotTrackState {
  trackId?: string
  trackName: string
  isMuted?: boolean
  isSoloed?: boolean
  is_muted?: boolean
  is_soloed?: boolean
  type?: string
  color?: string
}

export interface ExportRunSnapshot {
  id?: string
  name: string
  trackStates: ExportRunSnapshotTrackState[]
  createdAt?: string
  updatedAt?: string
}

export interface ExportRunSettings {
  outputPath?: string
  output_path?: string
  filePrefix?: string
  file_prefix?: string
  fileFormat?: 'wav' | 'aiff' | 'mp3' | string
  file_format?: 'wav' | 'aiff' | 'mp3' | string
  mixSources?: Array<{
    name: string
    type?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
  }>
  mix_sources?: Array<{
    name?: string
    type?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
    mixSourceName?: string
    mix_source_name?: string
    mixSourceType?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
    mix_source_type?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
  }>
  mixSourceName?: string
  mix_source_name?: string
  mixSourceType?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
  mix_source_type?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
  onlineExport?: boolean
  online_export?: boolean
}

export interface ExportRunStartRequest {
  snapshots: ExportRunSnapshot[]
  exportSettings?: ExportRunSettings
  export_settings?: ExportRunSettings
  startTime?: number
  endTime?: number
  start_time?: number
  end_time?: number
  host?: string
  port?: number
  timeoutSeconds?: number
}

export interface ExportMixWithSourceRequest {
  sourceType: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
  source_type?: 'bus' | 'output' | 'physicalOut' | 'renderer' | 'physical_out' | 'PhysicalOut' | 'Bus' | 'Output' | 'Renderer' | string
}

export interface SessionApplySnapshotRequest {
  snapshot: Snapshot
}

export interface SessionGetSnapshotInfoRequest {
  snapshot: Snapshot
}

type CoreCapabilityRequestMap = {
  'system.health': SystemHealthRequest
  'config.get': ConfigGetRequest
  'config.update': ConfigUpdateRequest
  'daw.connection.connect': DawConnectionConnectRequest
  'daw.connection.disconnect': DawConnectionDisconnectRequest
  'daw.connection.getStatus': DawConnectionGetStatusRequest
  'daw.adapter.getSnapshot': DawAdapterGetSnapshotRequest
  'daw.ptsl.catalog.list': DawPtslCatalogListRequest
  'daw.ptsl.command.describe': DawPtslCommandDescribeRequest
  'daw.ptsl.command.execute': DawPtslCommandExecuteRequest
  'daw.automation.splitStereoToMono.execute': AutomationSplitStereoToMonoExecuteRequest
  'daw.session.getInfo': SessionGetInfoRequest
  'daw.session.getLength': SessionGetLengthRequest
  'daw.session.save': SessionSaveRequest
  'daw.session.applySnapshot': SessionApplySnapshotRequest
  'daw.session.getSnapshotInfo': SessionGetSnapshotInfoRequest
  'daw.track.list': TrackListRequest
  'daw.track.listNames': TrackListNamesRequest
  'daw.track.selection.get': TrackSelectionGetRequest
  'daw.track.rename': TrackRenameRequest
  'daw.track.select': TrackSelectRequest
  'daw.track.color.apply': TrackColorApplyRequest
  'daw.track.pan.set': TrackPanSetRequest
  'daw.track.mute.set': TrackMuteSetRequest
  'daw.track.solo.set': TrackSoloSetRequest
  'daw.track.hidden.set': TrackHiddenSetRequest
  'daw.track.inactive.set': TrackInactiveSetRequest
  'daw.track.recordEnable.set': TrackRecordEnableSetRequest
  'daw.track.recordSafe.set': TrackRecordSafeSetRequest
  'daw.track.inputMonitor.set': TrackInputMonitorSetRequest
  'daw.track.online.set': TrackOnlineSetRequest
  'daw.track.frozen.set': TrackFrozenSetRequest
  'daw.track.open.set': TrackOpenSetRequest
  'daw.clip.selectAllOnTrack': ClipSelectAllOnTrackRequest
  'daw.transport.play': TransportPlayRequest
  'daw.transport.stop': TransportStopRequest
  'daw.transport.record': TransportRecordRequest
  'daw.transport.getStatus': TransportGetStatusRequest
  'workflow.run.start': WorkflowRunStartRequest
  'daw.import.analyze': ImportAnalyzeRequest
  'daw.import.cache.save': ImportCacheSaveRequest
  'daw.import.planRunItems': ImportPlanRunItemsRequest
  'daw.import.run.start': ImportRunStartRequest
  'daw.stripSilence.open': StripSilenceOpenRequest
  'daw.stripSilence.execute': StripSilenceExecuteRequest
  'daw.export.range.set': ExportRangeSetRequest
  'daw.export.start': ExportStartRequest
  'daw.export.direct.start': ExportDirectStartRequest
  'daw.export.run.start': ExportRunStartRequest
  'daw.export.mixWithSource': ExportMixWithSourceRequest
  'jobs.create': JobsCreateRequest
  'jobs.update': JobsUpdateRequest
  'jobs.get': JobsGetRequest
  'jobs.list': JobsListRequest
  'jobs.cancel': JobsCancelRequest
  'jobs.delete': JobsDeleteRequest
}

type PtslSemanticCapabilityId = (typeof PTSL_SEMANTIC_CAPABILITY_IDS)[number]

export type CapabilityRequestMap = CoreCapabilityRequestMap & {
  [K in PtslSemanticCapabilityId]: DawPtslSemanticRequest
}
