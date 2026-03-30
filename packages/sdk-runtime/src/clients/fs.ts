export interface FsStat {
  isFile: boolean
  isDirectory: boolean
}

export interface FsRuntimeClient {
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<boolean>
  ensureDir(path: string): Promise<boolean>
  getHomePath(): Promise<string>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<FsStat | null>
  readdir(path: string): Promise<string[]>
  mkdir(path: string): Promise<boolean>
  unlink(path: string): Promise<boolean>
  rmdir(path: string): Promise<boolean>
  deleteFile(path: string): Promise<boolean>
}
