import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let mainWindow = null
let pythonApi = null
let importPythonApi = null

const API_HOST = '127.0.0.1'
const API_GATEWAY_PORT = Number(process.env.PT_API_PORT || '8000')
const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = path.dirname(CURRENT_FILE)

const HTTP_TIMEOUT_MS = Number(process.env.PT_HTTP_TIMEOUT_MS || '30000')
const HTTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.PT_HTTP_MAX_ATTEMPTS || '3'))
const HTTP_RETRY_DELAY_MS = Number(process.env.PT_HTTP_RETRY_DELAY_MS || '250')

const BACKEND_STARTUP_TIMEOUT_MS = Number(process.env.PT_BACKEND_STARTUP_TIMEOUT_MS || '20000')
const BACKEND_REQUEST_READY_TIMEOUT_MS = Number(process.env.PT_BACKEND_REQUEST_READY_TIMEOUT_MS || '10000')
const BACKEND_HEARTBEAT_INTERVAL_MS = Number(process.env.PT_BACKEND_HEARTBEAT_INTERVAL_MS || '5000')
const BACKEND_HEARTBEAT_TIMEOUT_MS = Number(process.env.PT_BACKEND_HEARTBEAT_TIMEOUT_MS || '1500')
const BACKEND_HEARTBEAT_FAILURE_THRESHOLD = Math.max(1, Number(process.env.PT_BACKEND_HEARTBEAT_FAILURE_THRESHOLD || '3'))
const BACKEND_AUTO_RESTART_DELAY_MS = Number(process.env.PT_BACKEND_AUTO_RESTART_DELAY_MS || '2000')
const BACKEND_AUTO_RESTART_WINDOW_MS = Number(process.env.PT_BACKEND_AUTO_RESTART_WINDOW_MS || '60000')
const BACKEND_AUTO_RESTART_MAX_IN_WINDOW = Math.max(1, Number(process.env.PT_BACKEND_AUTO_RESTART_MAX_IN_WINDOW || '5'))
const BACKEND_PORT_SCAN_RANGE = Math.max(1, Number(process.env.PT_BACKEND_PORT_SCAN_RANGE || '50'))

const MAX_BACKEND_LOG_ENTRIES = Math.max(100, Number(process.env.PT_MAX_BACKEND_LOG_ENTRIES || '2000'))
const MAX_BACKEND_WARNINGS = 100

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

const IMPORT_ROUTE_RULE = {
  pathPrefixes: ['/api/v1/import/'],
  exactPaths: new Set([
    '/api/v1/system/health',
    '/api/v1/config',
    '/api/v1/ai/key/status',
    '/api/v1/ai/key',
    '/api/v1/session/save',
  ]),
}

const EXPORT_ROUTE_RULE = {
  pathPrefixes: ['/api/v1/export/', '/api/v1/session/', '/api/v1/connection/', '/api/v1/transport/', '/api/v1/files/'],
  exactPaths: new Set(['/api/v1/tracks']),
}

const backendLogs = []
const backendWarnings = []

let logSequence = 0
let heartbeatTimer = null
let activatePromise = null
let restartTimer = null
let shuttingDown = false
let plannedStopInProgress = false
let autoRestartWindowStart = 0
let autoRestartCount = 0

let requestedPort = normalizePort(process.env.PT_API_PORT, API_GATEWAY_PORT)
let runtimePort = requestedPort
let activeMode = process.env.PT_BACKEND_MODE === 'import' ? 'import' : 'export'
let activeProcess = null
let activePid = null
let activeReady = false
let activeStatus = 'stopped'
let activeHeartbeatFailures = 0
let lastError = null
let lastExit = null
let restartCount = 0

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function localLog(source, level, message) {
  const lines = String(message)
    .split(/\r?\n/g)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const entry = {
      id: ++logSequence,
      timestamp: nowIso(),
      source,
      level,
      message: line,
    }
    backendLogs.push(entry)
    if (backendLogs.length > MAX_BACKEND_LOG_ENTRIES) {
      backendLogs.splice(0, backendLogs.length - MAX_BACKEND_LOG_ENTRIES)
    }

    const rendered = `[${source}] ${line}\n`
    if (level === 'error') {
      process.stderr.write(rendered)
    } else {
      process.stdout.write(rendered)
    }
  }
}

function pushWarning(message) {
  const record = `${nowIso()} ${message}`
  backendWarnings.unshift(record)
  if (backendWarnings.length > MAX_BACKEND_WARNINGS) {
    backendWarnings.splice(MAX_BACKEND_WARNINGS)
  }
  localLog('backend-manager', 'warn', message)
}

function getProjectRoot() {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.resolve(CURRENT_DIR, '..', '..')
}

function normalizePort(value, fallback) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 65535) {
    return fallback
  }
  return numeric
}

function isAbortError(error) {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
}

function readErrorCode(error) {
  if (!error || typeof error !== 'object') {
    return null
  }

  const directCode = error.code
  if (typeof directCode === 'string') {
    return directCode
  }

  const cause = error.cause
  if (cause && typeof cause === 'object') {
    const causeCode = cause.code
    if (typeof causeCode === 'string') {
      return causeCode
    }
  }

  return null
}

function isRetryableFetchError(error) {
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

function formatFetchError(url, error) {
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

function parseJsonResponse(body, url) {
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`Invalid JSON response from ${url}`)
  }
}

function isLocalTarget(hostname) {
  return hostname === API_HOST || hostname === 'localhost'
}

function inferModeFromPath(pathname) {
  if (IMPORT_ROUTE_RULE.exactPaths.has(pathname) || IMPORT_ROUTE_RULE.pathPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return 'import'
  }
  if (EXPORT_ROUTE_RULE.exactPaths.has(pathname) || EXPORT_ROUTE_RULE.pathPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return 'export'
  }
  return activeMode
}

function resolveRequestUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    if (!isLocalTarget(parsed.hostname)) {
      return rawUrl
    }

    const parsedPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    if (parsedPort === API_GATEWAY_PORT && runtimePort !== API_GATEWAY_PORT) {
      parsed.hostname = API_HOST
      parsed.port = String(runtimePort)
      return parsed.toString()
    }

    return rawUrl
  } catch {
    return rawUrl
  }
}

function healthPathForMode(mode) {
  return mode === 'import' ? '/api/v1/system/health' : '/health'
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen({ host: API_HOST, port, exclusive: true })
  })
}

async function pickRuntimePort(preferredPort) {
  if (await isPortAvailable(preferredPort)) {
    return preferredPort
  }

  for (let offset = 1; offset <= BACKEND_PORT_SCAN_RANGE; offset += 1) {
    const candidate = preferredPort + offset
    if (candidate > 65535) {
      continue
    }
    if (await isPortAvailable(candidate)) {
      pushWarning(`Preferred port ${preferredPort} unavailable, using ${candidate}`)
      return candidate
    }
  }

  throw new Error(`No available port found near ${preferredPort}`)
}

function clearHeartbeatMonitor() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

async function stopProcess(proc) {
  if (!proc || proc.killed) {
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

async function stopActiveBackend() {
  clearHeartbeatMonitor()
  plannedStopInProgress = true
  activeStatus = 'stopping'
  activeReady = false

  const proc = activeProcess
  await stopProcess(proc)

  activeProcess = null
  activePid = null
  activeReady = false
  activeStatus = 'stopped'
  activeHeartbeatFailures = 0
  pythonApi = null
  importPythonApi = null

  plannedStopInProgress = false
}

function updateLegacyProcessPointers(mode, proc) {
  if (mode === 'export') {
    pythonApi = proc
    importPythonApi = null
  } else {
    importPythonApi = proc
    pythonApi = null
  }
}

function attachActiveProcessHandlers(mode, proc) {
  const source = `python-api:${mode}`
  activeProcess = proc
  activePid = proc.pid ?? null
  activeReady = false
  activeStatus = 'starting'
  activeHeartbeatFailures = 0
  lastError = null
  updateLegacyProcessPointers(mode, proc)

  proc.stdout.on('data', (chunk) => {
    localLog(source, 'info', chunk.toString())
  })

  proc.stderr.on('data', (chunk) => {
    localLog(source, 'error', chunk.toString())
  })

  proc.on('error', (error) => {
    lastError = error instanceof Error ? error.message : String(error)
    localLog(source, 'error', `spawn error: ${lastError}`)
  })

  proc.on('exit', (code, signal) => {
    lastExit = {
      code: code ?? null,
      signal: signal ?? null,
      timestamp: nowIso(),
      mode,
    }
    localLog(source, 'warn', `exited (code=${code}, signal=${signal})`)

    activeProcess = null
    activePid = null
    activeReady = false
    updateLegacyProcessPointers(mode, null)

    if (shuttingDown || plannedStopInProgress) {
      activeStatus = 'stopped'
      return
    }

    activeStatus = 'crashed'
    lastError = `Process exited (code=${code}, signal=${signal})`
    scheduleAutoRestart(`${mode} backend exited unexpectedly`)
  })
}

function resetAutoRestartWindowIfNeeded() {
  const now = Date.now()
  if (autoRestartWindowStart === 0 || now - autoRestartWindowStart > BACKEND_AUTO_RESTART_WINDOW_MS) {
    autoRestartWindowStart = now
    autoRestartCount = 0
  }
}

function scheduleAutoRestart(reason) {
  if (shuttingDown || plannedStopInProgress) {
    return
  }

  resetAutoRestartWindowIfNeeded()

  if (autoRestartCount >= BACKEND_AUTO_RESTART_MAX_IN_WINDOW) {
    pushWarning(`Auto-restart limit reached. Last reason: ${reason}`)
    return
  }

  if (restartTimer) {
    localLog('backend-manager', 'warn', `Auto-restart already scheduled. Reason: ${reason}`)
    return
  }

  autoRestartCount += 1
  localLog('backend-manager', 'warn', `Scheduling auto-restart #${autoRestartCount}: ${reason}`)

  restartTimer = setTimeout(() => {
    restartTimer = null
    void activateMode(activeMode, `auto-restart: ${reason}`, { forceRestart: true, countRestart: true })
  }, BACKEND_AUTO_RESTART_DELAY_MS)
}

async function checkActiveHealth(timeoutMs = BACKEND_HEARTBEAT_TIMEOUT_MS) {
  if (!activeProcess || activeProcess.killed) {
    return false
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const url = `http://${API_HOST}:${runtimePort}${healthPathForMode(activeMode)}`

  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function waitForActiveReady(timeoutMs = BACKEND_STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (shuttingDown) {
      return false
    }

    const healthy = await checkActiveHealth()
    if (healthy) {
      activeReady = true
      activeStatus = 'ready'
      activeHeartbeatFailures = 0
      lastError = null
      return true
    }

    if (!activeProcess || activeProcess.killed) {
      activeReady = false
      activeStatus = 'crashed'
      lastError = lastError || 'Process is not running'
      return false
    }

    await sleep(300)
  }

  activeReady = false
  activeStatus = 'degraded'
  lastError = `Health check timed out after ${timeoutMs}ms`
  return false
}

function startHeartbeatMonitor() {
  clearHeartbeatMonitor()

  heartbeatTimer = setInterval(() => {
    void (async () => {
      if (!activeProcess || activeProcess.killed) {
        return
      }

      const healthy = await checkActiveHealth()
      if (healthy) {
        if (!activeReady || activeStatus !== 'ready') {
          localLog('backend-manager', 'info', `${activeMode} backend is healthy`)
        }
        activeReady = true
        activeStatus = 'ready'
        activeHeartbeatFailures = 0
        return
      }

      activeReady = false
      activeStatus = activeStatus === 'crashed' ? 'crashed' : 'degraded'
      activeHeartbeatFailures += 1
      lastError = `Heartbeat failed (${activeHeartbeatFailures}/${BACKEND_HEARTBEAT_FAILURE_THRESHOLD})`

      if (activeHeartbeatFailures >= BACKEND_HEARTBEAT_FAILURE_THRESHOLD) {
        pushWarning(`${activeMode} backend heartbeat failed repeatedly; scheduling restart`)
        activeHeartbeatFailures = 0
        scheduleAutoRestart(`${activeMode} heartbeat failures`)
      }
    })()
  }, BACKEND_HEARTBEAT_INTERVAL_MS)

  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref()
  }
}

async function spawnBackendForMode(mode) {
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

  let proc

  if (mode === 'export') {
    proc = spawn(python, [exportBackendPath], {
      cwd: path.dirname(exportBackendPath),
      env: {
        ...baseEnv,
        HOST: API_HOST,
        PORT: String(runtimePort),
      },
      stdio: 'pipe',
    })
  } else {
    proc = spawn(python, ['-m', 'presto.main_api', '--host', API_HOST, '--port', String(runtimePort)], {
      cwd: importBackendRoot,
      env: {
        ...baseEnv,
        HOST: API_HOST,
        PORT: String(runtimePort),
      },
      stdio: 'pipe',
    })
  }

  attachActiveProcessHandlers(mode, proc)
}

async function activateMode(nextMode, reason = 'manual', options = {}) {
  const targetMode = nextMode === 'import' ? 'import' : 'export'

  if (activatePromise) {
    await activatePromise
  }

  activatePromise = (async () => {
    const forceRestart = Boolean(options.forceRestart)
    const countRestart = Boolean(options.countRestart)

    const shouldRestart =
      forceRestart ||
      !activeProcess ||
      activeProcess.killed ||
      activeMode !== targetMode

    if (!shouldRestart && activeReady) {
      return getBackendStatusPayload()
    }

    localLog('backend-manager', 'info', `Activating mode '${targetMode}' (${reason})`)

    if (activeProcess) {
      await stopActiveBackend()
    }

    requestedPort = normalizePort(requestedPort, API_GATEWAY_PORT)
    runtimePort = await pickRuntimePort(requestedPort)

    activeMode = targetMode
    activeStatus = 'starting'

    if (countRestart) {
      restartCount += 1
    }

    await spawnBackendForMode(targetMode)

    const ready = await waitForActiveReady(BACKEND_STARTUP_TIMEOUT_MS)
    if (!ready) {
      pushWarning(`Mode '${targetMode}' startup incomplete on port ${runtimePort}`)
    }

    startHeartbeatMonitor()

    return getBackendStatusPayload()
  })()

  try {
    return await activatePromise
  } finally {
    activatePromise = null
  }
}

async function ensureModeAndReadinessForRequest(rawUrl) {
  const parsed = new URL(rawUrl)
  const expectedMode = inferModeFromPath(parsed.pathname)

  if (expectedMode !== activeMode || !activeProcess || activeProcess.killed) {
    await activateMode(expectedMode, 'request routing')
  }

  if (activeReady) {
    return
  }

  const ready = await waitForActiveReady(BACKEND_REQUEST_READY_TIMEOUT_MS)
  if (!ready) {
    const details = lastError ? ` ${lastError}` : ''
    throw new Error(`Backend '${activeMode}' is not ready.${details} Open Home -> Backend Diagnostics to inspect logs and restart services.`)
  }
}

async function performHttpRequest(url, init = undefined) {
  const targetUrl = resolveRequestUrl(url)
  await ensureModeAndReadinessForRequest(targetUrl)

  let lastRequestError = null

  for (let attempt = 1; attempt <= HTTP_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

    try {
      const res = await fetch(targetUrl, { ...init, signal: controller.signal })
      const body = await res.text()
      if (!res.ok) {
        throw new Error(body || `HTTP ${res.status}`)
      }
      return parseJsonResponse(body, targetUrl)
    } catch (error) {
      lastRequestError = error
      const retryable = isRetryableFetchError(error)
      if (retryable && attempt < HTTP_MAX_ATTEMPTS) {
        const retryDelay = HTTP_RETRY_DELAY_MS * attempt
        localLog(
          'backend-http',
          'warn',
          `Transient HTTP error for ${targetUrl}; retrying in ${retryDelay}ms (${attempt}/${HTTP_MAX_ATTEMPTS})`,
        )
        await sleep(retryDelay)
        continue
      }
      throw formatFetchError(targetUrl, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw formatFetchError(targetUrl, lastRequestError)
}

function getBackendStatusPayload() {
  const running = Boolean(activeProcess && !activeProcess.killed)

  return {
    running,
    ready: activeReady,
    mode: activeMode,
    pid: activePid,
    requestedPort,
    port: runtimePort,
    status: activeStatus,
    heartbeatFailures: activeHeartbeatFailures,
    restarts: restartCount,
    lastError,
    lastExit,
    baseUrl: `http://${API_HOST}:${runtimePort}`,
    importBaseUrl: `http://${API_HOST}:${runtimePort}`,
    warnings: [...backendWarnings],
    logsCount: backendLogs.length,
  }
}

function formatLogExport() {
  const headerLines = [
    '# Presto Unified Runtime Logs',
    `generated_at=${nowIso()}`,
    `project_root=${getProjectRoot()}`,
    `status=${JSON.stringify(getBackendStatusPayload(), null, 2)}`,
    '',
    '# entries',
  ]

  const entries = backendLogs.map(
    (entry) => `${entry.timestamp} [${entry.level}] [${entry.source}] ${entry.message}`,
  )

  return [...headerLines, ...entries, ''].join('\n')
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
    localLog('electron-main', 'error', `renderer failed to load (code=${errorCode}) ${errorDescription} url=${validatedUrl}`)
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
    return performHttpRequest(url)
  })

  ipcMain.handle('http:post', async (_event, url, data) => {
    return performHttpRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  })

  ipcMain.handle('http:put', async (_event, url, data) => {
    return performHttpRequest(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  })

  ipcMain.handle('http:delete', async (_event, url) => {
    return performHttpRequest(url, { method: 'DELETE' })
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

  ipcMain.handle('backend:get-status', async () => getBackendStatusPayload())

  ipcMain.handle('backend:activate-mode', async (_event, mode) => {
    const status = await activateMode(mode, 'frontend requested mode switch')
    return { ok: true, status }
  })

  ipcMain.handle('backend:restart', async () => {
    const status = await activateMode(activeMode, 'manual restart', { forceRestart: true, countRestart: true })
    return { ok: true, status }
  })

  ipcMain.handle('backend:update-ports', async (_event, config) => {
    const next = config && typeof config === 'object' ? config : {}

    if ('port' in next) {
      requestedPort = normalizePort(next.port, API_GATEWAY_PORT)
    }
    if ('exportPort' in next) {
      requestedPort = normalizePort(next.exportPort, API_GATEWAY_PORT)
    }
    if ('importPort' in next) {
      requestedPort = normalizePort(next.importPort, API_GATEWAY_PORT)
    }

    const status = await activateMode(activeMode, 'port configuration updated', { forceRestart: true, countRestart: true })
    return { ok: true, status, requestedPort, runtimePort }
  })

  ipcMain.handle('backend:get-logs', async (_event, limit = 200) => {
    const normalized = Math.max(1, Math.min(5000, Number(limit) || 200))
    return backendLogs.slice(Math.max(0, backendLogs.length - normalized))
  })

  ipcMain.handle('backend:export-logs', async () => {
    const logsDir = path.join(app.getPath('home'), '.presto', 'logs')
    await fs.mkdir(logsDir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(logsDir, `presto-runtime-${stamp}.log`)
    await fs.writeFile(filePath, formatLogExport(), 'utf-8')

    return { ok: true, filePath, count: backendLogs.length }
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
  .then(async () => {
    registerIpcHandlers()
    localLog('backend-manager', 'info', 'App ready, starting backend supervisor')

    try {
      await activateMode(activeMode, 'app startup')
    } catch (error) {
      pushWarning(`Backend startup failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    mainWindow = createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })
  .catch((error) => {
    localLog('electron-main', 'error', `failed to initialize: ${String(error)}`)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  shuttingDown = true
  void stopActiveBackend()
})
