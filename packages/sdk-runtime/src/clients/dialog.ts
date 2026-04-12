export interface DialogOpenResult {
  canceled: boolean
  paths: string[]
}

export type DialogOpenFolderResult = DialogOpenResult
export type DialogOpenFileResult = DialogOpenResult
export type DialogOpenDirectoryResult = DialogOpenResult

export interface DialogRuntimeClient {
  openFolder(): Promise<DialogOpenFolderResult>
  openFile(): Promise<DialogOpenFileResult>
  openDirectory(): Promise<DialogOpenDirectoryResult>
}
