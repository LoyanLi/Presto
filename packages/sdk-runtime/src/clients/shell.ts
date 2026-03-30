export interface ShellRuntimeClient {
  openPath(path: string): Promise<string>
  openExternal(url: string): Promise<boolean>
}
