import type { DawTarget } from '../daw/targets'
import type { PrestoErrorPayload } from '../errors/error'
import type { PrestoEventName } from '../events/event'
import type { JobAcceptedResponse, JobManagerContract } from '../jobs/job'
import type {
  CapabilityDependency,
  CapabilityDomain,
  CapabilityId,
  CapabilityKind,
  CapabilityVisibility,
  PublicCapabilityId,
} from './ids'

export interface SchemaRef<T = unknown> {
  name: string
  package: '@presto/contracts'
  version: 1
  example?: T
}

export interface CapabilityFieldSupport {
  requestFields: readonly string[]
  responseFields: readonly string[]
}

export interface CapabilityDefinition<TRequest = unknown, TResponse = unknown> {
  id: CapabilityId
  version: 1
  kind: CapabilityKind
  domain: CapabilityDomain
  visibility: CapabilityVisibility
  description: string
  requestSchema: SchemaRef<TRequest>
  responseSchema: SchemaRef<TResponse>
  dependsOn: readonly CapabilityDependency[]
  supportedDaws: readonly DawTarget[]
  canonicalSource: DawTarget
  fieldSupport: Partial<Record<DawTarget, CapabilityFieldSupport>>
  handler: string
  emitsEvents?: readonly PrestoEventName[]
}

export interface CapabilityRegistry {
  listPublic(): CapabilityDefinition[]
  listAll(): CapabilityDefinition[]
  get(id: CapabilityId): CapabilityDefinition | undefined
  require(id: CapabilityId): CapabilityDefinition
  has(id: CapabilityId): boolean
}

export interface MutableCapabilityRegistry extends CapabilityRegistry {
  register(definition: CapabilityDefinition): void
}

export interface ConfigStorePort {}

export interface KeychainStorePort {}

export interface AiServicePort {}

export interface DawAdapterPort {}

export interface MacAutomationPort {}

export interface DawUiProfilePort {}

export interface LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface CapabilityExecutionContext {
  requestId: string
  targetDaw: DawTarget
  registry: CapabilityRegistry
  jobs: JobManagerContract
  configStore: ConfigStorePort
  keychainStore: KeychainStorePort
  aiService?: AiServicePort
  daw?: DawAdapterPort
  macAutomation?: MacAutomationPort
  dawUiProfile?: DawUiProfilePort
  logger: LoggerPort
  now(): string
}

export interface QueryHandler<TRequest, TResponse> {
  execute(ctx: CapabilityExecutionContext, request: TRequest): Promise<TResponse>
}

export interface CommandHandler<TRequest, TResponse> {
  execute(ctx: CapabilityExecutionContext, request: TRequest): Promise<TResponse>
}

export interface JobHandler<TRequest> {
  start(ctx: CapabilityExecutionContext, request: TRequest): Promise<JobAcceptedResponse>
}

export interface CapabilityRequestEnvelope<TRequest = unknown> {
  requestId: string
  capability: PublicCapabilityId
  payload: TRequest
  meta?: {
    clientName?: string
    clientVersion?: string
    locale?: string
    platform?: string
    sdkVersion?: string
  }
}

export interface CapabilitySuccessEnvelope<TResponse = unknown> {
  success: true
  requestId: string
  capability: PublicCapabilityId
  data: TResponse
}

export interface CapabilityFailureEnvelope {
  success: false
  requestId: string
  capability: PublicCapabilityId
  error: PrestoErrorPayload
}

export type CapabilityResponseEnvelope<TResponse = unknown> =
  | CapabilitySuccessEnvelope<TResponse>
  | CapabilityFailureEnvelope

export { CAPABILITY_REGISTRY } from '../generated/capabilityRegistry'
