export interface WindowRuntimeClient {
  toggleAlwaysOnTop(): Promise<boolean>
  getAlwaysOnTop(): Promise<boolean>
  setAlwaysOnTop(enabled: boolean): Promise<boolean>
}
