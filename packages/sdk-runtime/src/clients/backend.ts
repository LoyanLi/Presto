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

export interface DawAdapterSnapshot {
  targetDaw: string
  adapterVersion: string
  hostVersion: string
  modules: DawAdapterModuleSnapshot[]
  capabilities: DawAdapterCapabilitySnapshot[]
}

export interface BackendRuntimeClient {
  getStatus(): Promise<BackendStatus>
  getDawAdapterSnapshot(): Promise<DawAdapterSnapshot>
  restart(): Promise<{ ok: true }>
  setDawTarget(target: string): Promise<{ ok: true; target: string }>
  setDeveloperMode(enabled: boolean): Promise<{ ok: true; enabled: boolean }>
}
