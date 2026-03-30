export interface AppLatestReleaseInfo {
  repo: string
  tagName: string
  name: string
  htmlUrl: string
  publishedAt: string
  prerelease: boolean
  draft: boolean
}

export interface AppViewLogResult {
  ok: true
  filePath: string
}

export interface AppRuntimeClient {
  getVersion(): Promise<string>
  getLatestRelease(): Promise<AppLatestReleaseInfo>
  viewLog(): Promise<AppViewLogResult>
}
