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

export interface AppRuntimeClient {
  getVersion(): Promise<string>
  checkForUpdates(request: AppReleaseCheckRequest): Promise<AppReleaseCheckResult>
  viewLog(): Promise<AppViewLogResult>
}
