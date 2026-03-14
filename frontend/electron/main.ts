import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let mainWindow: BrowserWindow | null = null
let pythonApi: ChildProcessWithoutNullStreams | null = null
let importPythonApi: ChildProcessWithoutNullStreams | null = null

const API_PORT = Number(process.env.PT_API_PORT || '8000')
const IMPORT_API_PORT = Number(process.env.PT_IMPORT_API_PORT || '8001')
const API_HOST = '127.0.0.1'
const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)
const HTTP_TIMEOUT_MS = Number(process.env.PT_HTTP_TIMEOUT_MS || '30000')
const HTTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.PT_HTTP_MAX_ATTEMPTS || '3'))
const HTTP_RETRY_DELAY_MS = Number(process.env.PT_HTTP_RETRY_DELAY_MS || '250')
const RETRYABLE_FETCH_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])
const PRESTO_API_ERROR_PREFIX = '__PRESTO_API_ERROR__'
type FrontendApiEntry = 'import' | 'export'

type BackendRouteRule = {
  frontendEntry: FrontendApiEntry
  targetPort: number
  pathPrefixes: string[]
  exactPaths: Set<string>
}

const BACKEND_ROUTE_RULES: BackendRouteRule[] = [
  {
    frontendEntry: 'import',
    targetPort: IMPORT_API_PORT,
    pathPrefixes: ['/api/v1/import/'],
    exactPaths: new Set([
      '/api/v1/system/health',
      '/api/v1/config',
      '/api/v1/ai/key/status',
      '/api/v1/ai/key',
      '/api/v1/session/save',
    ]),
  },
  {
    frontendEntry: 'export',
    targetPort: API_PORT,
    pathPrefixes: ['/api/v1/export/', '/api/v1/session/', '/api/v1/connection/', '/api/v1/transport/', '/api/v1/files/'],
    exactPaths: new Set(['/api/v1/tracks']),
  },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const directCode = (error as { code?: unknown }).code
  if (typeof directCode === 'string') {
    return directCode
  }

  const cause = (error as { cause?: unknown }).cause
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code
    if (typeof causeCode === 'string') {
      return causeCode
    }
  }

  return null
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError',
  )
}

function isRetryableFetchError(error: unknown): boolean {
  if (isAbortError(error)) {
    return true
  }

  const errorCode = readErrorCode(error)
  if (errorCode && RETRYABLE_FETCH_CODES.has(errorCode)) {
    return true
  }

  if (error instanceof TypeError) {
    return error.message.toLowerCase().includes('fetch failed')
  }

  return false
}

function formatFetchError(url: string, error: unknown): Error {
  if (error instanceof Error && error.message.startsWith(PRESTO_API_ERROR_PREFIX)) {
    return error
  }

  if (isAbortError(error)) {
    return new Error(`Request timed out after ${HTTP_TIMEOUT_MS}ms: ${url}`)
  }

  const errorCode = readErrorCode(error)
  const message = error instanceof Error ? error.message : String(error)
  if (errorCode) {
    return new Error(`Request failed (${errorCode}) for ${url}: ${message}`)
  }
  return new Error(`Request failed for ${url}: ${message}`)
}

function parseJsonResponse(body: string, url: string): any {
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`Invalid JSON response from ${url}`)
  }
}

function parseApiErrorBody(body: string): any | null {
  if (!body) {
    return null
  }
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && (parsed as { success?: unknown }).success === false) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

function matchBackendRoute(pathname: string): BackendRouteRule | null {
  for (const rule of BACKEND_ROUTE_RULES) {
    if (rule.exactPaths.has(pathname)) {
      return rule
    }
    if (rule.pathPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return rule
    }
  }
  return null
}

function resolveRequestUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    if (port !== API_PORT) {
      return rawUrl
    }
    const matchedRoute = matchBackendRoute(parsed.pathname)
    if (!matchedRoute) {
      return rawUrl
    }
    if (matchedRoute.targetPort === API_PORT) {
      return rawUrl
    }
    parsed.hostname = API_HOST
    parsed.port = String(matchedRoute.targetPort)
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

async function performHttpRequest(url: string, init?: RequestInit): Promise<any> {
  const targetUrl = resolveRequestUrl(url)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= HTTP_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

    try {
      const res = await fetch(targetUrl, { ...init, signal: controller.signal })
      const body = await res.text()
      if (!res.ok) {
        const parsedApiError = parseApiErrorBody(body)
        if (parsedApiError) {
          throw new Error(`${PRESTO_API_ERROR_PREFIX}${JSON.stringify(parsedApiError)}`)
        }
        throw new Error(body || `HTTP ${res.status}`)
      }
      return parseJsonResponse(body, targetUrl)
    } catch (error) {
      lastError = error
      const retryable = isRetryableFetchError(error)
      if (retryable && attempt < HTTP_MAX_ATTEMPTS) {
        const retryDelay = HTTP_RETRY_DELAY_MS * attempt
        process.stderr.write(
          `[electron-main] transient HTTP error for ${targetUrl}; retrying in ${retryDelay}ms (${attempt}/${HTTP_MAX_ATTEMPTS})\n`,
        )
        await sleep(retryDelay)
        continue
      }
      throw formatFetchError(targetUrl, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw formatFetchError(targetUrl, lastError)
}

function getProjectRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.resolve(CURRENT_DIR, '..', '..')
}

function startPythonApi(): void {
  if (pythonApi && importPythonApi) {
    return
  }

  const projectRoot = getProjectRoot()
  const backendRoot = app.isPackaged ? projectRoot : path.join(projectRoot, 'backend')
  const exportBackendPath = path.join(backendRoot, 'export', 'main.py')
  const importBackendRoot = path.join(backendRoot, 'import')
  const defaultAppSupportDir = app.isPackaged ? undefined : path.join(projectRoot, '.presto')
  const python = process.env.PT_API_PYTHON || 'python3'
  const baseEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    DEBUG: process.env.DEBUG || 'false',
    ...(process.env.PRESTO_APP_SUPPORT_DIR
      ? {}
      : defaultAppSupportDir
        ? { PRESTO_APP_SUPPORT_DIR: defaultAppSupportDir }
        : {}),
  }

  if (!pythonApi) {
    const args = [exportBackendPath]
    pythonApi = spawn(python, args, {
      cwd: path.dirname(exportBackendPath),
      env: {
        ...baseEnv,
        HOST: process.env.HOST || API_HOST,
        PORT: process.env.PORT || String(API_PORT),
      },
      stdio: 'pipe',
    })

    pythonApi.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(`[python-api:export] ${chunk.toString()}`)
    })
    pythonApi.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[python-api:export] ${chunk.toString()}`)
    })
    pythonApi.on('exit', (code, signal) => {
      process.stdout.write(`[python-api:export] exited (code=${code}, signal=${signal})\n`)
      pythonApi = null
    })
  }

  if (!importPythonApi) {
    const importArgs = ['-m', 'presto.main_api', '--host', API_HOST, '--port', String(IMPORT_API_PORT)]
    importPythonApi = spawn(python, importArgs, {
      cwd: importBackendRoot,
      env: {
        ...baseEnv,
        HOST: API_HOST,
        PORT: String(IMPORT_API_PORT),
      },
      stdio: 'pipe',
    })

    importPythonApi.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(`[python-api:import] ${chunk.toString()}`)
    })
    importPythonApi.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[python-api:import] ${chunk.toString()}`)
    })
    importPythonApi.on('exit', (code, signal) => {
      process.stdout.write(`[python-api:import] exited (code=${code}, signal=${signal})\n`)
      importPythonApi = null
    })
  }
}

async function stopProcess(proc: ChildProcessWithoutNullStreams | null): Promise<void> {
  if (!proc) {
    return
  }

  if (proc.killed) {
    return
  }

  await new Promise<void>((resolve) => {
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

async function stopPythonApi(): Promise<void> {
  const exportProc = pythonApi
  const importProc = importPythonApi
  pythonApi = null
  importPythonApi = null
  await Promise.all([stopProcess(exportProc), stopProcess(importProc)])
}

function createMainWindow(): BrowserWindow {
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

  if (app.isPackaged) {
    const indexPath = path.join(CURRENT_DIR, '..', 'dist', 'index.html')
    void win.loadURL(pathToFileURL(indexPath).toString())
  } else {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
    void win.loadURL(devServerUrl)
  }

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    process.stderr.write(
      `[electron-main] renderer failed to load (code=${errorCode}) ${errorDescription} url=${validatedUrl}\n`,
    )
  })

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  return win
}

function registerIpcHandlers(): void {
  ipcMain.handle('http:get', async (_event, url: string) => {
    return performHttpRequest(url)
  })

  ipcMain.handle('http:post', async (_event, url: string, data?: unknown) => {
    return performHttpRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  })

  ipcMain.handle('http:put', async (_event, url: string, data?: unknown) => {
    return performHttpRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  })

  ipcMain.handle('http:delete', async (_event, url: string) => {
    return performHttpRequest(url, { method: 'DELETE' })
  })

  ipcMain.handle('dialog:open', async (_event, options: Electron.OpenDialogOptions) => {
    const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined
    return dialog.showOpenDialog(targetWindow, options)
  })

  ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
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

  ipcMain.handle('window:set-always-on-top', async (_event, enabled: boolean) => {
    if (!mainWindow) {
      return false
    }
    mainWindow.setAlwaysOnTop(Boolean(enabled))
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle('app:get-version', async () => app.getVersion())

  ipcMain.handle('backend:get-status', async () => ({
    running: Boolean(pythonApi && !pythonApi.killed && importPythonApi && !importPythonApi.killed),
    pid: pythonApi?.pid ?? null,
    importPid: importPythonApi?.pid ?? null,
    baseUrl: `http://${API_HOST}:${API_PORT}`,
    importBaseUrl: `http://${API_HOST}:${IMPORT_API_PORT}`,
  }))

  ipcMain.handle('backend:restart', async () => {
    await stopPythonApi()
    startPythonApi()
    return { ok: true }
  })

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('fs:ensure-dir', async (_event, dirPath: string) => {
    await fs.mkdir(dirPath, { recursive: true })
    return true
  })

  ipcMain.handle('fs:get-home-path', async () => app.getPath('home'))

  ipcMain.handle('fs:exists', async (_event, targetPath: string) => {
    try {
      await fs.access(targetPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:stat', async (_event, targetPath: string) => {
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

  ipcMain.handle('fs:readdir', async (_event, targetPath: string) => {
    try {
      return await fs.readdir(targetPath)
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:mkdir', async (_event, targetPath: string) => {
    await fs.mkdir(targetPath, { recursive: true })
    return true
  })

  ipcMain.handle('fs:unlink', async (_event, targetPath: string) => {
    try {
      await fs.unlink(targetPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:rmdir', async (_event, targetPath: string) => {
    try {
      await fs.rmdir(targetPath, { recursive: true })
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:delete-file', async (_event, targetPath: string) => {
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
