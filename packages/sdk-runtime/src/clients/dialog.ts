export interface DialogOpenFolderResult {
  canceled: boolean
  paths: string[]
}

export interface DialogRuntimeClient {
  openFolder(): Promise<DialogOpenFolderResult>
}
