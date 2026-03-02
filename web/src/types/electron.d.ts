export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>
  }
  backend: {
    getStatus: () => Promise<{ running: boolean; pid: number | null; baseUrl: string }>
    restart: () => Promise<{ ok: boolean }>
  }
  window: {
    toggleAlwaysOnTop: () => Promise<boolean>
    getAlwaysOnTop: () => Promise<boolean>
    setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
  }
  shell: {
    openPath: (path: string) => Promise<string>
  }
  showOpenDialog: (options: {
    properties: string[]
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ canceled: boolean; filePaths: string[] }>
  http: {
    get: (url: string) => Promise<any>
    post: (url: string, data?: unknown) => Promise<any>
    put: (url: string, data?: unknown) => Promise<any>
    delete: (url: string) => Promise<any>
  }
  fs: {
    readFile: (path: string) => Promise<string | null>
    writeFile: (path: string, content: string) => Promise<boolean>
    ensureDir: (path: string) => Promise<boolean>
    getHomePath: () => Promise<string>
    exists: (path: string) => Promise<boolean>
    stat: (path: string) => Promise<{ isFile: boolean; isDirectory: boolean } | null>
    readdir: (path: string) => Promise<string[]>
    mkdir: (path: string) => Promise<boolean>
    unlink: (path: string) => Promise<boolean>
    rmdir: (path: string) => Promise<boolean>
    deleteFile: (path: string) => Promise<boolean>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
