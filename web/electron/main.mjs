import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let mainWindow = null
let pythonApi = null

const API_PORT = Number(process.env.PT_API_PORT || '8000')
const API_HOST = '127.0.0.1'
const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)

function getProjectRoot() {
  return path.resolve(CURRENT_DIR, '..', '..')
}

function startPythonApi() {
  if (pythonApi) {
    return
  }

  const projectRoot = getProjectRoot()
  const python = process.env.PT_API_PYTHON || 'python3'
  const args = ['-m', 'presto.main_api', '--host', API_HOST, '--port', String(API_PORT)]

  pythonApi = spawn(python, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
    stdio: 'pipe',
  })

  pythonApi.stdout.on('data', (chunk) => {
    process.stdout.write(`[python-api] ${chunk.toString()}`)
  })
  pythonApi.stderr.on('data', (chunk) => {
    process.stderr.write(`[python-api] ${chunk.toString()}`)
  })
  pythonApi.on('exit', (code, signal) => {
    process.stdout.write(`[python-api] exited (code=${code}, signal=${signal})\n`)
    pythonApi = null
  })
}

async function stopPythonApi() {
  if (!pythonApi) {
    return
  }
  const proc = pythonApi
  pythonApi = null

  if (proc.killed) {
    return
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        // Ignore forced-kill failures.
      }
      resolve()
    }, 3000)

    proc.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })

    try {
      proc.kill('SIGTERM')
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

function createMainWindow() {
  const preloadPath = path.join(CURRENT_DIR, 'preload.cjs')
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    title: 'Presto',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
  void win.loadURL(devServerUrl)

  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  return win
}

function registerIpcHandlers() {
  ipcMain.handle('http:get', async (_event, url) => {
    const res = await fetch(url)
    const body = await res.text()
    if (!res.ok) {
      throw new Error(body || `HTTP ${res.status}`)
    }
    return body ? JSON.parse(body) : null
  })

  ipcMain.handle('http:post', async (_event, url, data) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(body || `HTTP ${res.status}`)
    }
    return body ? JSON.parse(body) : null
  })

  ipcMain.handle('http:put', async (_event, url, data) => {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(body || `HTTP ${res.status}`)
    }
    return body ? JSON.parse(body) : null
  })

  ipcMain.handle('http:delete', async (_event, url) => {
    const res = await fetch(url, { method: 'DELETE' })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(body || `HTTP ${res.status}`)
    }
    return body ? JSON.parse(body) : null
  })

  ipcMain.handle('dialog:open', async (_event, options) => {
    const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined
    return dialog.showOpenDialog(targetWindow, options)
  })

  ipcMain.handle('shell:open-path', async (_event, targetPath) => {
    return shell.openPath(targetPath)
  })

  ipcMain.handle('window:toggle-always-on-top', async () => {
    if (!mainWindow) {
      return false
    }
    const next = !mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(next)
    return next
  })

  ipcMain.handle('window:get-always-on-top', async () => {
    if (!mainWindow) {
      return false
    }
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle('window:set-always-on-top', async (_event, enabled) => {
    if (!mainWindow) {
      return false
    }
    mainWindow.setAlwaysOnTop(Boolean(enabled))
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle('app:get-version', async () => app.getVersion())

  ipcMain.handle('backend:get-status', async () => ({
    running: Boolean(pythonApi && !pythonApi.killed),
    pid: pythonApi?.pid ?? null,
    baseUrl: `http://${API_HOST}:${API_PORT}`,
  }))

  ipcMain.handle('backend:restart', async () => {
    await stopPythonApi()
    startPythonApi()
    return { ok: true }
  })

  ipcMain.handle('fs:read-file', async (_event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:write-file', async (_event, filePath, content) => {
    await fs.writeFile(filePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('fs:ensure-dir', async (_event, dirPath) => {
    await fs.mkdir(dirPath, { recursive: true })
    return true
  })

  ipcMain.handle('fs:get-home-path', async () => app.getPath('home'))

  ipcMain.handle('fs:exists', async (_event, targetPath) => {
    try {
      await fs.access(targetPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:stat', async (_event, targetPath) => {
    try {
      const stat = await fs.stat(targetPath)
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:readdir', async (_event, targetPath) => {
    try {
      return await fs.readdir(targetPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:mkdir', async (_event, targetPath) => {
    await fs.mkdir(targetPath, { recursive: true })
    return true
  })

  ipcMain.handle('fs:unlink', async (_event, targetPath) => {
    try {
      await fs.unlink(targetPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:rmdir', async (_event, targetPath) => {
    try {
      await fs.rmdir(targetPath, { recursive: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:delete-file', async (_event, targetPath) => {
    try {
      await fs.unlink(targetPath)
      return true
    } catch {
      return false
    }
  })
}

void app
  .whenReady()
  .then(() => {
    startPythonApi()
    registerIpcHandlers()
    mainWindow = createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })
  .catch((error) => {
    process.stderr.write(`[electron-main] failed to initialize: ${String(error)}\n`)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void stopPythonApi()
})
