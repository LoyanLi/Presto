export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>
  }
  backend: {
    getStatus: () => Promise<{
      running: boolean
      ready: boolean
      mode: 'import' | 'export'
      pid: number | null
      requestedPort: number
      port: number
      status: string
      heartbeatFailures: number
      restarts: number
      lastError: string | null
      lastExit: {
        code: number | null
        signal: string | null
        timestamp: string
        mode: 'import' | 'export'
      } | null
      warnings: string[]
      logsCount: number
      baseUrl: string
      importBaseUrl: string
    }>
    activateMode: (mode: 'import' | 'export') => Promise<{ ok: boolean; status: unknown }>
    restart: () => Promise<{ ok: boolean; status: unknown }>
    updatePorts: (config: { port?: number; exportPort?: number; importPort?: number }) => Promise<{ ok: boolean; status: unknown }>
    getLogs: (limit?: number) => Promise<Array<{ id: number; timestamp: string; source: string; level: string; message: string }>>
    exportLogs: () => Promise<{ ok: boolean; filePath: string; count: number }>
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
