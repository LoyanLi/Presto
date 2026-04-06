export interface BackendLogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  source: string
  message: string
  details: Record<string, unknown> | null
}

export interface BackendStatus {
  running: boolean
  ready: boolean
  pid: number | null
  port: number
  status: string
  lastError: string | null
  logsCount: number
  warnings: string[]
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

export interface BackendCapabilityFieldSupport {
  requestFields: string[]
  responseFields: string[]
}

export interface BackendCapabilityDefinition {
  id: string
  version: number
  kind: string
  domain: string
  visibility: string
  description: string
  requestSchema: string
  responseSchema: string
  dependsOn: string[]
  supportedDaws: string[]
  canonicalSource: string
  fieldSupport: Record<string, BackendCapabilityFieldSupport>
  handler: string
  emitsEvents: string[]
}

export interface DawAdapterSnapshot {
  targetDaw: string
  adapterVersion: string
  hostVersion: string
  modules: DawAdapterModuleSnapshot[]
  capabilities: DawAdapterCapabilitySnapshot[]
}

export interface BackendRuntimeClient {
  getStatus(): Promise<BackendStatus>
  listCapabilities(): Promise<BackendCapabilityDefinition[]>
  getDawAdapterSnapshot(): Promise<DawAdapterSnapshot>
  restart(): Promise<{ ok: true }>
  setDawTarget(target: string): Promise<{ ok: true; target: string }>
  setDeveloperMode(enabled: boolean): Promise<{ ok: true; enabled: boolean }>
}
