import type { PublicCapabilityId } from '../capabilities/ids'
import type { PrestoErrorPayload } from '../errors/error'
import type { DawTarget } from '../daw/targets'
import type { JobProgress } from './progress'

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type JobCapabilityId = PublicCapabilityId | 'tool.run'

export interface JobRecord<TResult = unknown> {
  jobId: string
  capability: JobCapabilityId
  targetDaw: DawTarget
  state: JobState
  progress: JobProgress
  metadata?: Record<string, unknown>
  result?: TResult
  error?: PrestoErrorPayload
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export interface JobAcceptedResponse {
  jobId: string
  capability: JobCapabilityId
  state: 'queued' | 'running'
}

export interface JobsGetRequest {
  jobId: string
}

export interface JobsGetResponse {
  job: JobRecord
}

export interface JobsCreateRequest {
  capability: JobCapabilityId
  targetDaw: DawTarget
  state?: JobState
  progress?: Partial<JobProgress>
  metadata?: Record<string, unknown>
  result?: unknown
  error?: PrestoErrorPayload
  startedAt?: string
  finishedAt?: string
}

export interface JobsCreateResponse {
  job: JobRecord
}

export interface JobsListRequest {
  states?: JobState[]
  capabilities?: JobCapabilityId[]
  limit?: number
}

export interface JobsListResponse {
  jobs: JobRecord[]
  totalCount: number
}

export interface JobsCancelRequest {
  jobId: string
}

export interface JobsCancelResponse {
  cancelled: true
  jobId: string
}

export interface JobsDeleteRequest {
  jobId: string
}

export interface JobsDeleteResponse {
  deleted: true
  jobId: string
}

export interface JobsUpdateRequest {
  jobId: string
  state?: JobState
  progress?: Partial<JobProgress>
  metadata?: Record<string, unknown>
  result?: unknown
  error?: PrestoErrorPayload
  startedAt?: string
  finishedAt?: string
}

export interface JobsUpdateResponse {
  job: JobRecord
}

export interface JobsClient {
  create(request: JobsCreateRequest): Promise<JobsCreateResponse>
  update(request: JobsUpdateRequest): Promise<JobsUpdateResponse>
  get(jobId: string): Promise<JobRecord>
  list(filter?: JobsListRequest): Promise<JobsListResponse>
  cancel(jobId: string): Promise<JobsCancelResponse>
  delete(jobId: string): Promise<JobsDeleteResponse>
}

export interface JobManagerContract {
  create(request: JobsCreateRequest): Promise<JobsCreateResponse>
  update(request: JobsUpdateRequest): Promise<JobsUpdateResponse>
  get(jobId: string): Promise<JobRecord>
  list(filter?: JobsListRequest): Promise<JobsListResponse>
  cancel(jobId: string): Promise<JobsCancelResponse>
  delete(jobId: string): Promise<JobsDeleteResponse>
}
