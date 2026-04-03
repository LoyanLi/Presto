import type {
  AutomationSplitStereoToMonoExecuteResponse,
  ClipSelectAllOnTrackResponse,
  ExportDirectStartResponse,
  ExportMixWithSourceResponse,
  ExportRangeSetResponse,
  ExportRunStartResponse,
  ExportStartResponse,
  ConfigGetResponse,
  ConfigUpdateResponse,
  DawAdapterGetSnapshotResponse,
  DawConnectionConnectResponse,
  DawConnectionDisconnectResponse,
  DawConnectionGetStatusResponse,
  ImportAnalyzeResponse,
  ImportCacheSaveResponse,
  ImportRunStartResponse,
  SessionApplySnapshotResponse,
  SessionGetInfoResponse,
  SessionGetLengthResponse,
  SessionGetSnapshotInfoResponse,
  SessionSaveResponse,
  StripSilenceExecuteResponse,
  StripSilenceOpenResponse,
  SystemHealthResponse,
  TrackColorApplyResponse,
  TrackListNamesResponse,
  TrackListResponse,
  TrackSelectionGetResponse,
  TrackMuteSetResponse,
  TrackPanSetResponse,
  TrackRenameResponse,
  TrackSelectResponse,
  TrackSoloSetResponse,
  TransportGetStatusResponse,
  TransportPlayResponse,
  TransportRecordResponse,
  TransportStopResponse,
  WorkflowRunStartResponse,
} from './responses'
import type {
  AutomationSplitStereoToMonoExecuteRequest,
  ClipSelectAllOnTrackRequest,
  ExportDirectStartRequest,
  ExportMixWithSourceRequest,
  ExportRangeSetRequest,
  ExportRunStartRequest,
  ExportStartRequest,
  ConfigUpdateRequest,
  DawAdapterGetSnapshotRequest,
  DawConnectionConnectRequest,
  ImportAnalyzeRequest,
  ImportCacheSaveRequest,
  ImportRunStartRequest,
  SessionApplySnapshotRequest,
  SessionGetSnapshotInfoRequest,
  StripSilenceExecuteRequest,
  TrackColorApplyRequest,
  TrackMuteSetRequest,
  TrackPanSetRequest,
  TrackRenameRequest,
  TrackSelectRequest,
  TrackSoloSetRequest,
  WorkflowRunStartRequest,
} from './requests'
import type { JobsClient } from '../jobs/job'
import type { DawTarget } from '../daw/targets'
import type { CapabilityRequestEnvelope, CapabilityResponseEnvelope } from './registry'

export interface PrestoTransport {
  invoke<TRequest, TResponse>(
    request: CapabilityRequestEnvelope<TRequest>
  ): Promise<CapabilityResponseEnvelope<TResponse>>
}

export interface PrestoClientOptions {
  transport: PrestoTransport
  targetDaw?: DawTarget
  clientName?: string
  clientVersion?: string
}

export interface SystemClient {
  health(): Promise<SystemHealthResponse>
}

export interface ConfigClient {
  get(): Promise<ConfigGetResponse>
  update(request: ConfigUpdateRequest): Promise<ConfigUpdateResponse>
}

export interface DawClient {
  adapter: {
    getSnapshot(): Promise<DawAdapterGetSnapshotResponse>
  }
  connection: {
    connect(request?: DawConnectionConnectRequest): Promise<DawConnectionConnectResponse>
    disconnect(): Promise<DawConnectionDisconnectResponse>
    getStatus(): Promise<DawConnectionGetStatusResponse>
  }
}

export interface AutomationClient {
  splitStereoToMono: {
    execute(
      request?: AutomationSplitStereoToMonoExecuteRequest
    ): Promise<AutomationSplitStereoToMonoExecuteResponse>
  }
}

export interface SessionClient {
  getInfo(): Promise<SessionGetInfoResponse>
  getLength(): Promise<SessionGetLengthResponse>
  save(): Promise<SessionSaveResponse>
  applySnapshot(request: SessionApplySnapshotRequest): Promise<SessionApplySnapshotResponse>
  getSnapshotInfo(request: SessionGetSnapshotInfoRequest): Promise<SessionGetSnapshotInfoResponse>
}

export interface TrackClient {
  list(): Promise<TrackListResponse>
  listNames(): Promise<TrackListNamesResponse>
  selection: {
    get(): Promise<TrackSelectionGetResponse>
  }
  rename(request: TrackRenameRequest): Promise<TrackRenameResponse>
  select(request: TrackSelectRequest): Promise<TrackSelectResponse>
  color: {
    apply(request: TrackColorApplyRequest): Promise<TrackColorApplyResponse>
  }
  pan: {
    set(request: TrackPanSetRequest): Promise<TrackPanSetResponse>
  }
  mute: {
    set(request: TrackMuteSetRequest): Promise<TrackMuteSetResponse>
  }
  solo: {
    set(request: TrackSoloSetRequest): Promise<TrackSoloSetResponse>
  }
}

export interface ClipClient {
  selectAllOnTrack(request: ClipSelectAllOnTrackRequest): Promise<ClipSelectAllOnTrackResponse>
}

export interface TransportClient {
  play(): Promise<TransportPlayResponse>
  stop(): Promise<TransportStopResponse>
  record(): Promise<TransportRecordResponse>
  getStatus(): Promise<TransportGetStatusResponse>
}

export interface WorkflowClient {
  run: {
    start(request: WorkflowRunStartRequest): Promise<WorkflowRunStartResponse>
  }
}

export interface ImportClient {
  analyze(request: ImportAnalyzeRequest): Promise<ImportAnalyzeResponse>
  cache: {
    save(request: ImportCacheSaveRequest): Promise<ImportCacheSaveResponse>
  }
  run: {
    start(request: ImportRunStartRequest): Promise<ImportRunStartResponse>
  }
}

export interface ExportClient {
  range: {
    set(request: ExportRangeSetRequest): Promise<ExportRangeSetResponse>
  }
  start(request: ExportStartRequest): Promise<ExportStartResponse>
  direct: {
    start(request: ExportDirectStartRequest): Promise<ExportDirectStartResponse>
  }
  mixSource: {
    list(request: ExportMixWithSourceRequest): Promise<ExportMixWithSourceResponse>
  }
  run: {
    start(request: ExportRunStartRequest): Promise<ExportRunStartResponse>
  }
}

export interface StripSilenceClient {
  open(): Promise<StripSilenceOpenResponse>
  execute(request: StripSilenceExecuteRequest): Promise<StripSilenceExecuteResponse>
}

export interface PrestoClient {
  system: SystemClient
  config: ConfigClient
  daw: DawClient
  automation: AutomationClient
  session: SessionClient
  track: TrackClient
  clip: ClipClient
  transport: TransportClient
  workflow: WorkflowClient
  import: ImportClient
  export: ExportClient
  stripSilence: StripSilenceClient
  jobs: JobsClient
}
