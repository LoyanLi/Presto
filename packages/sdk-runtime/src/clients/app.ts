export interface AppLatestReleaseInfo {
  repo: string
  tagName: string
  name: string
  htmlUrl: string
  publishedAt: string
  prerelease: boolean
  draft: boolean
}

export interface AppReleaseCheckRequest {
  currentVersion: string
  includePrerelease: boolean
}

export interface AppReleaseCheckResult {
  currentVersion: string
  hasUpdate: boolean
  latestRelease: AppLatestReleaseInfo | null
}

export interface AppViewLogResult {
  ok: true
  filePath: string
}

export interface AppWriteExecutionLogRequest {
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  event: string
  message: string
  sessionId?: string
  jobId?: string
  requestId?: string
  pluginId?: string
  workflowId?: string
  capability?: string
  stepId?: string
  data?: Record<string, unknown>
}

export interface AppWriteExecutionLogResult {
  ok: true
}

export interface AppRuntimeClient {
  getVersion(): Promise<string>
  checkForUpdates(request: AppReleaseCheckRequest): Promise<AppReleaseCheckResult>
  viewLog(): Promise<AppViewLogResult>
  writeExecutionLog(request: AppWriteExecutionLogRequest): Promise<AppWriteExecutionLogResult>
}
