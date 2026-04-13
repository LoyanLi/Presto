export interface DialogOpenResult {
  canceled: boolean
  paths: string[]
}

export interface DialogOpenFileFilter {
  name: string
  extensions: string[]
}

export interface DialogOpenFileOptions {
  filters?: DialogOpenFileFilter[]
}

export type DialogOpenFolderResult = DialogOpenResult
export type DialogOpenFileResult = DialogOpenResult
export type DialogOpenDirectoryResult = DialogOpenResult

export interface DialogRuntimeClient {
  openFolder(): Promise<DialogOpenFolderResult>
  openFile(options?: DialogOpenFileOptions): Promise<DialogOpenFileResult>
  openDirectory(): Promise<DialogOpenDirectoryResult>
}
