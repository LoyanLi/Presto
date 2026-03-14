import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  },
  backend: {
    getStatus: (): Promise<{
      running: boolean
      ready: boolean
      mode: 'import' | 'export'
      pid: number | null
      requestedPort: number
      port: number
      status: string
      lastError: string | null
      warnings: string[]
      logsCount: number
      baseUrl: string
      importBaseUrl: string
    }> =>
      ipcRenderer.invoke('backend:get-status'),
    activateMode: (mode: 'import' | 'export'): Promise<{ ok: boolean; status: unknown }> =>
      ipcRenderer.invoke('backend:activate-mode', mode),
    restart: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('backend:restart'),
    updatePorts: (config: { port?: number; exportPort?: number; importPort?: number }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('backend:update-ports', config),
    getLogs: (limit?: number): Promise<
      Array<{ id: number; timestamp: string; source: string; level: string; message: string }>
    > => ipcRenderer.invoke('backend:get-logs', limit),
    exportLogs: (): Promise<{ ok: boolean; filePath: string; count: number }> => ipcRenderer.invoke('backend:export-logs'),
  },
  window: {
    toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-always-on-top'),
    getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:get-always-on-top'),
    setAlwaysOnTop: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('window:set-always-on-top', enabled),
  },
  shell: {
    openPath: (targetPath: string): Promise<string> => ipcRenderer.invoke('shell:open-path', targetPath),
  },
  showOpenDialog: (options: {
    properties: string[]
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<{ canceled: boolean; filePaths: string[] }> => ipcRenderer.invoke('dialog:open', options),
  http: {
    get: (url: string): Promise<any> => ipcRenderer.invoke('http:get', url),
    post: (url: string, data?: unknown): Promise<any> => ipcRenderer.invoke('http:post', url, data),
    put: (url: string, data?: unknown): Promise<any> => ipcRenderer.invoke('http:put', url, data),
    delete: (url: string): Promise<any> => ipcRenderer.invoke('http:delete', url),
  },
  exportMobile: {
    createSession: (taskId: string): Promise<{ ok: boolean; sessionId?: string; url?: string; error?: string }> =>
      ipcRenderer.invoke('export-mobile:create-session', taskId),
    closeSession: (sessionId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('export-mobile:close-session', sessionId),
    getViewUrl: (sessionId: string): Promise<{ ok: boolean; sessionId?: string; url?: string; error?: string }> =>
      ipcRenderer.invoke('export-mobile:get-view-url', sessionId),
  },
  fs: {
    readFile: (targetPath: string): Promise<string | null> => ipcRenderer.invoke('fs:read-file', targetPath),
    writeFile: (targetPath: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('fs:write-file', targetPath, content),
    ensureDir: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:ensure-dir', targetPath),
    getHomePath: (): Promise<string> => ipcRenderer.invoke('fs:get-home-path'),
    exists: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', targetPath),
    stat: (targetPath: string): Promise<{ isFile: boolean; isDirectory: boolean } | null> =>
      ipcRenderer.invoke('fs:stat', targetPath),
    readdir: (targetPath: string): Promise<string[]> => ipcRenderer.invoke('fs:readdir', targetPath),
    mkdir: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:mkdir', targetPath),
    unlink: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:unlink', targetPath),
    rmdir: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:rmdir', targetPath),
    deleteFile: (targetPath: string): Promise<boolean> => ipcRenderer.invoke('fs:delete-file', targetPath),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
