const { contextBridge, ipcRenderer } = require('electron')

const electronAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
  },
  backend: {
    getStatus: () => ipcRenderer.invoke('backend:get-status'),
    activateMode: (mode) => ipcRenderer.invoke('backend:activate-mode', mode),
    restart: () => ipcRenderer.invoke('backend:restart'),
    updatePorts: (config) => ipcRenderer.invoke('backend:update-ports', config),
    getLogs: (limit) => ipcRenderer.invoke('backend:get-logs', limit),
    exportLogs: () => ipcRenderer.invoke('backend:export-logs'),
  },
  window: {
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
    getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
    setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:set-always-on-top', enabled),
  },
  shell: {
    openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  },
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  http: {
    get: (url) => ipcRenderer.invoke('http:get', url),
    post: (url, data) => ipcRenderer.invoke('http:post', url, data),
    put: (url, data) => ipcRenderer.invoke('http:put', url, data),
    delete: (url) => ipcRenderer.invoke('http:delete', url),
  },
  exportMobile: {
    createSession: (taskId) => ipcRenderer.invoke('export-mobile:create-session', taskId),
    closeSession: (sessionId) => ipcRenderer.invoke('export-mobile:close-session', sessionId),
    getViewUrl: (sessionId) => ipcRenderer.invoke('export-mobile:get-view-url', sessionId),
  },
  fs: {
    readFile: (targetPath) => ipcRenderer.invoke('fs:read-file', targetPath),
    writeFile: (targetPath, content) => ipcRenderer.invoke('fs:write-file', targetPath, content),
    ensureDir: (targetPath) => ipcRenderer.invoke('fs:ensure-dir', targetPath),
    getHomePath: () => ipcRenderer.invoke('fs:get-home-path'),
    exists: (targetPath) => ipcRenderer.invoke('fs:exists', targetPath),
    stat: (targetPath) => ipcRenderer.invoke('fs:stat', targetPath),
    readdir: (targetPath) => ipcRenderer.invoke('fs:readdir', targetPath),
    mkdir: (targetPath) => ipcRenderer.invoke('fs:mkdir', targetPath),
    unlink: (targetPath) => ipcRenderer.invoke('fs:unlink', targetPath),
    rmdir: (targetPath) => ipcRenderer.invoke('fs:rmdir', targetPath),
    deleteFile: (targetPath) => ipcRenderer.invoke('fs:delete-file', targetPath),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
