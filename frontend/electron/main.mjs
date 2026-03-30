import { app, BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'
import {
  access,
  mkdir,
  readFile as readFileFs,
  rm,
  stat as statFs,
  writeFile,
} from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createAutomationRuntime } from './runtime/automationRuntime.mjs'
import { createAppLogStore } from './runtime/appLogStore.mjs'
import { createMacAccessibilityRuntime } from './runtime/macAccessibilityRuntime.mjs'
import { createMobileProgressServer } from './runtime/mobileProgressServer.mjs'
import { buildMobileProgressPage } from './runtime/mobileProgressPage.mjs'
import { registerRuntimeHandlers } from './runtime/registerRuntimeHandlers.mjs'
import QRCode from 'qrcode'

const SUPPORTED_DAW_TARGETS = new Set(['pro_tools'])

async function loadBackendSupervisor() {
  if (!backendSupervisor) {
    const module = await import('./.stage1/backendSupervisor.mjs')
    backendSupervisor = module.createBackendSupervisor({
      targetDaw: currentDawTarget,
      onLog(entry) {
        appLogStore.append(entry)
      },
    })
  }
  return backendSupervisor
}

async function loadPluginHostService() {
  if (!pluginHostService) {
    const module = await import('./.stage1/pluginHostService.mjs')
    pluginHostService = module.createPluginHostService({
      managedPluginsRoot: path.join(app.getPath('userData'), 'extensions'),
      currentDaw: currentDawTarget,
      isHostApiVersionCompatible(hostApiVersion) {
        return hostApiVersion === '0.1.0' || hostApiVersion === '1' || hostApiVersion === '1.0.0'
      },
    })
    await pluginHostService.syncOfficialExtensions({
      officialExtensionsRoot: path.resolve(currentDir, '../../plugins/official'),
    })
  }

  return pluginHostService
}

let mainWindow = null
let backendSupervisor = null
let pluginHostService = null
let mobileProgressHttpServer = null
let mobileProgressRuntime = null
let mobileProgressOrigin = ''
let bootPromise = null
let currentDawTarget = 'pro_tools'
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(currentDir, '../../package.json')
const preloadPath = path.join(currentDir, '.stage1', 'preload.cjs')
const rendererPath = path.join(currentDir, 'index.html')
const smokeTarget = process.argv.find((entry) => entry.startsWith('--smoke-target='))?.split('=')[1] ?? null
const macAccessibilityRuntime = createMacAccessibilityRuntime()
const smokeImportAnalyzeFolderPath = path.join(tmpdir(), 'presto-import-analyze-smoke')
const GITHUB_RELEASES_REPO = process.env.PRESTO_GITHUB_REPO || 'LoyanLi/Presto'
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_RELEASES_REPO}/releases/latest`
const automationRuntime = createAutomationRuntime({
  definitionsDir: path.join(currentDir, 'runtime', 'automation', 'definitions'),
  scriptsDir: path.join(currentDir, 'runtime', 'automation', 'scripts'),
  macAccessibilityRuntime,
})
const DEFAULT_APP_METADATA = Object.freeze({
  applicationName: 'Presto',
  version: '0.3.0-alpha.1',
  author: 'Luminous Layers',
  copyright: 'Copyright (c) 2026 Loyan Li',
})
let resolvedAppMetadataPromise = null
const appLogStore = createAppLogStore({
  logDir: path.join(app.getPath('userData'), 'logs'),
})

app.setName(DEFAULT_APP_METADATA.applicationName)

function appendAppLog(level, source, message, details) {
  try {
    appLogStore.append({
      level,
      source,
      message,
      details: details ?? null,
    })
  } catch (error) {
    console.error('[electron-main] failed to append app log:', error)
  }
}

function normalizeErrorDetails(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      code: 'code' in error ? String(error.code ?? '') : undefined,
    }
  }

  return {
    value: String(error ?? 'unknown_error'),
  }
}

function summarizeCapabilityResult(response) {
  if (!response || typeof response !== 'object') {
    return { success: false }
  }

  return {
    success: response.success === true,
    errorCode:
      response.success === false && typeof response.error?.code === 'string'
        ? response.error.code
        : null,
  }
}

async function openLogInConsole(filePath) {
  await new Promise((resolve, reject) => {
    execFile('open', ['-a', 'Console', filePath], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve(undefined)
    })
  })
}

async function loadAppMetadata() {
  if (resolvedAppMetadataPromise) {
    return resolvedAppMetadataPromise
  }

  resolvedAppMetadataPromise = (async () => {
    try {
      const raw = await readFileFs(packageJsonPath, 'utf8')
      const parsed = JSON.parse(raw)
      const author =
        typeof parsed.author === 'string'
          ? parsed.author
          : typeof parsed.author?.name === 'string'
            ? parsed.author.name
            : DEFAULT_APP_METADATA.author
      return {
        applicationName:
          typeof parsed.build?.productName === 'string' && parsed.build.productName.trim()
            ? parsed.build.productName.trim()
            : DEFAULT_APP_METADATA.applicationName,
        version:
          typeof parsed.version === 'string' && parsed.version.trim()
            ? parsed.version.trim()
            : DEFAULT_APP_METADATA.version,
        author: author.trim() || DEFAULT_APP_METADATA.author,
        copyright:
          typeof parsed.copyright === 'string' && parsed.copyright.trim()
            ? parsed.copyright.trim()
            : DEFAULT_APP_METADATA.copyright,
      }
    } catch {
      return DEFAULT_APP_METADATA
    }
  })()

  return resolvedAppMetadataPromise
}

async function configureApplicationIdentity() {
  const metadata = await loadAppMetadata()
  app.setName(metadata.applicationName)
  app.setAboutPanelOptions({
    applicationName: metadata.applicationName,
    applicationVersion: metadata.version,
    version: metadata.version,
    authors: [metadata.author],
    copyright: metadata.copyright,
  })
}

async function fetchLatestGithubRelease() {
  const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Presto-App',
    },
  })

  if (!response.ok) {
    throw new Error(`github_release_fetch_failed:${response.status}`)
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw new Error('github_release_payload_invalid')
  }

  return {
    repo: GITHUB_RELEASES_REPO,
    tagName: typeof payload.tag_name === 'string' ? payload.tag_name : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    htmlUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : '',
    prerelease: Boolean(payload.prerelease),
    draft: Boolean(payload.draft),
  }
}

function createMinimalWavBuffer() {
  const sampleRate = 48000
  const channels = 1
  const bitsPerSample = 16
  const samples = Buffer.alloc(16)
  const dataSize = samples.length
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  samples.copy(buffer, 44)
  return buffer
}

let smokeImportAnalyzeFolderPromise = null

async function ensureSmokeImportAnalyzeFolder() {
  if (smokeImportAnalyzeFolderPromise) {
    return smokeImportAnalyzeFolderPromise
  }

  smokeImportAnalyzeFolderPromise = (async () => {
    const root = smokeImportAnalyzeFolderPath
    const nested = path.join(root, 'nested')
    const wavBuffer = createMinimalWavBuffer()
    await rm(root, { recursive: true, force: true })
    await mkdir(nested, { recursive: true })
    await writeFile(path.join(root, 'Kick.wav'), wavBuffer)
    await writeFile(path.join(root, 'Snare.wav'), wavBuffer)
    await writeFile(path.join(nested, 'HiHat.wav'), wavBuffer)
    return root
  })()

  return smokeImportAnalyzeFolderPromise
}

function getRendererUrl(nextSmokeTarget) {
  const baseUrl = pathToFileURL(rendererPath).href
  if (!nextSmokeTarget) {
    return baseUrl
  }
  const url = new URL(baseUrl)
  url.searchParams.set('smokeTarget', nextSmokeTarget)
  if (nextSmokeTarget === 'core-io-write') {
    url.searchParams.set('smokeImportFolder', smokeImportAnalyzeFolderPath)
  }
  return url.href
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readFsStat(targetPath) {
  try {
    const info = await statFs(targetPath)
    return {
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
    }
  } catch {
    return null
  }
}

function resolveMobileProgressHost() {
  const interfaces = networkInterfaces()
  const candidates = []
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal || !entry.address) {
        continue
      }
      if (entry.address.startsWith('169.254.')) {
        continue
      }
      if (name.startsWith('utun') || name.startsWith('bridge') || name === 'awdl0' || name === 'llw0') {
        continue
      }
      if (entry.address === '198.18.0.1') {
        continue
      }
      candidates.push({ name, address: entry.address })
    }
  }

  const preferred =
    candidates.find((item) => item.name === 'en0') ??
    candidates.find((item) => item.name.startsWith('en')) ??
    candidates.find((item) => item.address.startsWith('192.168.')) ??
    candidates.find((item) => item.address.startsWith('10.')) ??
    candidates.find((item) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(item.address)) ??
    candidates[0]

  return preferred?.address || '127.0.0.1'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function deriveMobileProgressJobView(job) {
  const progress = job?.progress ?? {}
  const metadata = job?.metadata ?? {}
  const result = job?.result ?? {}
  const terminalStatus =
    typeof result.status === 'string'
      ? result.status
      : job?.state === 'succeeded'
        ? 'completed'
        : String(job?.state ?? 'queued')

  return {
    jobId: String(job?.jobId ?? ''),
    state: String(job?.state ?? 'queued'),
    terminalStatus,
    progressPercent: Number(progress.percent ?? 0),
    message: String(progress.message ?? ''),
    currentSnapshot: Number(metadata.currentSnapshot ?? progress.current ?? 0),
    totalSnapshots: Number(metadata.totalSnapshots ?? progress.total ?? 0),
    currentSnapshotName: String(metadata.currentSnapshotName ?? ''),
    etaSeconds:
      metadata.etaSeconds === null || metadata.etaSeconds === undefined
        ? null
        : Number(metadata.etaSeconds),
    exportedCount: Number(metadata.exportedCount ?? (Array.isArray(result.exportedFiles) ? result.exportedFiles.length : 0)),
    exportedFiles: Array.isArray(result.exportedFiles) ? result.exportedFiles.map((value) => String(value)) : [],
    failedSnapshots: Array.isArray(result.failedSnapshots) ? result.failedSnapshots.map((value) => String(value)) : [],
    failedSnapshotDetails: Array.isArray(result.failedSnapshotDetails)
      ? result.failedSnapshotDetails
          .filter((value) => value && typeof value === 'object')
          .map((value) => ({
            snapshotName: String(value.snapshotName ?? ''),
            error: String(value.error ?? ''),
          }))
          .filter((value) => value.snapshotName)
      : [],
    isTerminal: ['succeeded', 'failed', 'cancelled'].includes(String(job?.state ?? '')),
  }
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function html(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

async function loadJobForMobileProgress(taskId) {
  const supervisor = await loadBackendSupervisor()
  const response = await supervisor.invokeCapability({
    requestId: `mobile-progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capability: 'jobs.get',
    payload: {
      jobId: String(taskId),
    },
    meta: {
      clientName: 'mobile-progress',
      clientVersion: '0.1.0',
      sdkVersion: '0.1.0',
    },
  })

  if (!response.success) {
    throw new Error(response.error?.message || response.error?.code || 'Failed to load progress.')
  }

  return response.data
}

async function loadDawAdapterSnapshot() {
  const supervisor = await loadBackendSupervisor()
  const metadata = await loadAppMetadata()
  const response = await supervisor.invokeCapability({
    requestId: `backend-daw-adapter-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capability: 'daw.adapter.getSnapshot',
    payload: {},
    meta: {
      clientName: 'electron-runtime',
      clientVersion: metadata.version,
      sdkVersion: '0.1.0',
    },
  })

  if (!response.success) {
    throw new Error(response.error?.message || response.error?.code || 'Failed to load DAW adapter snapshot.')
  }

  return response.data
}

async function setBackendDeveloperMode(enabled) {
  const supervisor = await loadBackendSupervisor()
  const metadata = await loadAppMetadata()
  const runtimeMeta = {
    clientName: 'electron-runtime',
    clientVersion: metadata.version,
    sdkVersion: '0.1.0',
  }
  const resolvedEnabled = Boolean(enabled)
  const requestIdSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const getConfigResponse = await supervisor.invokeCapability({
    requestId: `backend-set-developer-mode-get-${requestIdSuffix}`,
    capability: 'config.get',
    payload: {},
    meta: runtimeMeta,
  })

  if (!getConfigResponse.success) {
    throw new Error(getConfigResponse.error?.message || getConfigResponse.error?.code || 'Failed to load config.')
  }

  const currentConfigCandidate = getConfigResponse.data?.config
  if (!currentConfigCandidate || typeof currentConfigCandidate !== 'object') {
    throw new Error('Invalid config payload.')
  }

  const currentUiPreferences =
    currentConfigCandidate.uiPreferences && typeof currentConfigCandidate.uiPreferences === 'object'
      ? currentConfigCandidate.uiPreferences
      : {}
  const nextConfig = {
    ...currentConfigCandidate,
    uiPreferences: {
      ...currentUiPreferences,
      developerModeEnabled: resolvedEnabled,
    },
  }
  const updateConfigResponse = await supervisor.invokeCapability({
    requestId: `backend-set-developer-mode-update-${requestIdSuffix}`,
    capability: 'config.update',
    payload: {
      config: nextConfig,
    },
    meta: runtimeMeta,
  })

  if (!updateConfigResponse.success) {
    throw new Error(updateConfigResponse.error?.message || updateConfigResponse.error?.code || 'Failed to save config.')
  }

  return { ok: true, enabled: resolvedEnabled }
}

async function ensureMobileProgressRuntime() {
  if (mobileProgressRuntime && mobileProgressHttpServer && mobileProgressOrigin) {
    return {
      origin: mobileProgressOrigin,
      runtime: mobileProgressRuntime,
    }
  }

  const host = resolveMobileProgressHost()
  mobileProgressHttpServer = createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', mobileProgressOrigin || 'http://127.0.0.1')
      const pageMatch = requestUrl.pathname.match(/^\/mobile-progress\/([^/]+)$/)
      const apiMatch = requestUrl.pathname.match(/^\/mobile-progress-api\/([^/]+)$/)

      if (!pageMatch && !apiMatch) {
        html(response, 404, '<h1>Not Found</h1>')
        return
      }

      const sessionId = decodeURIComponent((pageMatch || apiMatch)?.[1] ?? '')
      const token = String(requestUrl.searchParams.get('token') ?? '')
      const session = mobileProgressRuntime?.getSession(sessionId) ?? null
      if (!session || token !== session.token) {
        if (apiMatch) {
          json(response, 403, { ok: false, error: 'Session not found.' })
          return
        }
        html(response, 403, '<h1>Session not found.</h1>')
        return
      }

      if (pageMatch) {
        html(response, 200, buildMobileProgressPage(sessionId, token))
        return
      }

      const jobView = session.latestJobView
        ? session.latestJobView
        : deriveMobileProgressJobView(await loadJobForMobileProgress(session.taskId))
      json(response, 200, {
        ok: true,
        session,
        jobView,
      })
    } catch (error) {
      json(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  await new Promise((resolve, reject) => {
    mobileProgressHttpServer.once('error', reject)
    mobileProgressHttpServer.listen(0, '0.0.0.0', () => {
      mobileProgressHttpServer.off('error', reject)
      resolve()
    })
  })

  const address = mobileProgressHttpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  mobileProgressOrigin = `http://${host}:${port}`
  mobileProgressRuntime = createMobileProgressServer({
    buildViewUrl(sessionId, token) {
      return `${mobileProgressOrigin}/mobile-progress/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`
    },
  })

  return {
    origin: mobileProgressOrigin,
    runtime: mobileProgressRuntime,
  }
}

async function decorateMobileProgressResult(result) {
  if (!result?.ok || !result.url) {
    return result
  }

  return {
    ...result,
    qrSvg: await QRCode.toString(result.url, {
      type: 'svg',
      width: 220,
      margin: 1,
      color: {
        dark: '#181a20',
        light: '#ffffff',
      },
    }),
  }
}

async function closeMobileProgressRuntime() {
  mobileProgressRuntime?.clearSessions?.()
  mobileProgressRuntime = null
  mobileProgressOrigin = ''
  if (!mobileProgressHttpServer) {
    return
  }
  const server = mobileProgressHttpServer
  mobileProgressHttpServer = null
  await new Promise((resolve) => {
    server.close(() => resolve())
  })
}

async function waitForRendererText(win, expectedText, timeoutMs = 20000) {
  const startedAt = Date.now()
  let lastText = ''

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastText = await win.webContents.executeJavaScript('document.body.innerText')
      if (typeof lastText === 'string' && lastText.includes(expectedText)) {
        return lastText
      }
    } catch (_error) {
      // Retry until the renderer is fully initialized.
    }

    await sleep(250)
  }

  throw new Error(`smoke text not found: ${expectedText}\n--- last renderer text ---\n${lastText}`)
}

async function clickRendererButton(win, label) {
  await win.webContents.executeJavaScript(
    `(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const target = buttons.find((button) => button.textContent && button.textContent.includes(${JSON.stringify(label)}))
      if (!target) {
        throw new Error('button not found: ' + ${JSON.stringify(label)})
      }
      target.click()
    })()`,
  )
}

async function clickFirstMatchingRendererButton(win, labels) {
  await win.webContents.executeJavaScript(
    `(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const labels = ${JSON.stringify(labels)}
      const target = buttons.find((button) =>
        labels.some((label) => button.textContent && button.textContent.includes(label))
      )
      if (!target) {
        throw new Error('button not found: ' + labels.join(' | '))
      }
      target.click()
    })()`,
  )
}

async function assertRendererBridge(win) {
  const hasBridge = await win.webContents.executeJavaScript(
    'Boolean(window.__PRESTO_PLUGIN_SHARED__)',
  )
  if (!hasBridge) {
    throw new Error('preload bridge is missing')
  }
}

function configureSmokeEnvironment(target) {
  if (target === 'track-write') {
    process.env.PRESTO_MAIN_BACKEND_PORT = '18516'
  }

  if (target === 'developer-read') {
    process.env.PRESTO_MAIN_BACKEND_PORT = '18511'
  }

  if (target === 'developer-write') {
    process.env.PRESTO_MAIN_BACKEND_PORT = '18512'
  }

  if (target === 'strip-silence') {
    process.env.PRESTO_MAIN_BACKEND_PORT = '18513'
  }

  if (target === 'core-io-write') {
    process.env.PRESTO_MAIN_BACKEND_PORT = '18514'
  }
}

async function runSmokeChecks(win, supervisor, target) {
  await assertRendererBridge(win)

  if (target === 'developer-read') {
    await waitForRendererText(win, 'Core Console')
    await waitForRendererText(win, 'system.health :: success')
    await waitForRendererText(win, 'config.get :: success')
    await waitForRendererText(win, 'daw.connection.getStatus :: success')
    await waitForRendererText(win, 'transport.getStatus :: success')
    await waitForRendererText(win, 'session.getInfo :: success')
    await waitForRendererText(win, 'track.list :: success')
    return
  }

  if (target === 'developer-write') {
    const trackList = await supervisor.invokeCapability({
      requestId: 'developer-smoke-track-list-write',
      capability: 'track.list',
      payload: {},
      meta: {
        clientName: 'developer-smoke-write',
        clientVersion: '0.1.0',
        sdkVersion: '0.1.0',
      },
    })
    if (!trackList.success) {
      throw new Error(`track.list failed for developer write smoke: ${trackList.error.code}`)
    }
    const firstTrackName = trackList.data.tracks[0]?.name
    if (!firstTrackName) {
      throw new Error('track.list returned no tracks for developer write smoke')
    }

    await waitForRendererText(win, 'Core Console')
    await waitForRendererText(win, 'config.get :: success')
    await waitForRendererText(win, 'config.update :: success')
    await waitForRendererText(win, 'daw.connection.connect :: success')
    await waitForRendererText(win, 'daw.connection.getStatus :: success')
    await waitForRendererText(win, 'transport.getStatus :: success')
    await waitForRendererText(win, 'session.save :: success')
    await waitForRendererText(win, 'track.rename :: success')
    await waitForRendererText(win, 'track.select :: success')
    await waitForRendererText(win, 'track.color.apply :: success')
    await waitForRendererText(win, 'clip.selectAllOnTrack :: success')
    await waitForRendererText(win, 'track.mute.set :: success')
    await waitForRendererText(win, 'track.solo.set :: success')
    await waitForRendererText(win, 'transport.play :: success')
    await waitForRendererText(win, 'transport.stop :: success')
    await waitForRendererText(win, 'transport.record :: success')
    await waitForRendererText(win, 'daw.connection.disconnect :: success')
    return
  }

  if (target === 'track-write') {
    await waitForRendererText(win, 'Core Console')
    await waitForRendererText(win, 'track.list :: success')
    await waitForRendererText(win, 'track.color.apply :: success')
    return
  }

  if (target === 'strip-silence') {
    await waitForRendererText(win, 'Core Console')
    await waitForRendererText(win, 'track.select :: success')
    await waitForRendererText(win, 'clip.selectAllOnTrack :: success')
    await waitForRendererText(win, 'stripSilence.open :: success')
    await waitForRendererText(win, 'stripSilence.execute :: success')
    return
  }

  if (target === 'core-io-write') {
    await waitForRendererText(win, 'Core Console')
    await waitForRendererText(win, 'import.run.start :: success')
    await waitForRendererText(win, 'export.range.set :: success')
    await waitForRendererText(win, 'export.start :: success')
    await waitForRendererText(win, 'export.direct.start :: success')
    await waitForRendererText(win, 'jobs.create :: success')
    await waitForRendererText(win, 'jobs.update :: success')
    await waitForRendererText(win, 'jobs.list :: success')
    await waitForRendererText(win, 'jobs.get :: success')
    await waitForRendererText(win, 'jobs.cancel :: success')
    await waitForRendererText(win, 'jobs.delete :: success')
    return
  }

  throw new Error(`unsupported smoke target: ${target}`)
}

function createRuntimeWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Presto',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  void win.loadURL(getRendererUrl(smokeTarget))

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

async function ensureWindow() {
  if (!mainWindow) {
    mainWindow = createRuntimeWindow()
  }

  return mainWindow
}

async function applyDawTarget(nextTarget) {
  const resolvedTarget = typeof nextTarget === 'string' ? nextTarget : ''
  if (!SUPPORTED_DAW_TARGETS.has(resolvedTarget)) {
    throw new Error(`unsupported_daw_target:${resolvedTarget || 'unknown'}`)
  }

  currentDawTarget = resolvedTarget
  if (backendSupervisor) {
    await backendSupervisor.stop()
    backendSupervisor = null
  }
  pluginHostService = null
  const supervisor = await loadBackendSupervisor()
  await supervisor.start()
  await supervisor.health()
  return currentDawTarget
}

async function bootstrapShell() {
  if (bootPromise) {
    return bootPromise
  }

  bootPromise = (async () => {
    configureSmokeEnvironment(smokeTarget)
    registerRuntimeHandlers({
      app,
      appLogStore,
      appendAppLog,
      applyDawTarget,
      automationRuntime,
      decorateMobileProgressResult,
      ensureMobileProgressRuntime,
      ensureSmokeImportAnalyzeFolder,
      ensureWindow,
      fetchLatestGithubRelease,
      getCurrentDawTarget: () => currentDawTarget,
      loadAppMetadata,
      loadBackendSupervisor,
      loadDawAdapterSnapshot,
      loadPluginHostService,
      macAccessibilityRuntime,
      normalizeErrorDetails,
      openLogInConsole,
      pathExists,
      readFsStat,
      setBackendDeveloperMode,
      smokeTarget,
      summarizeCapabilityResult,
    })
    if (smokeTarget === 'core-io-write' || smokeTarget === 'developer-write') {
      await ensureSmokeImportAnalyzeFolder()
    }
    const supervisor = await loadBackendSupervisor()
    await supervisor.start()
    await supervisor.health()
    mainWindow = createRuntimeWindow()
    if (smokeTarget) {
      await runSmokeChecks(mainWindow, supervisor, smokeTarget)
      await supervisor.stop()
      app.exit(0)
    }
    return supervisor.getStatus()
  })()

  return bootPromise
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void ensureWindow().catch((error) => {
      appendAppLog('error', 'electron.main', 'restore_runtime_window_failed', normalizeErrorDetails(error))
      console.error('[electron-main] failed to restore runtime window:', error)
    })
  }
})

app.on('before-quit', () => {
  void backendSupervisor?.stop().catch((error) => {
    appendAppLog('error', 'electron.main', 'stop_backend_supervisor_failed', normalizeErrorDetails(error))
    console.error('[electron-main] failed to stop backend supervisor:', error)
  })
  void closeMobileProgressRuntime().catch((error) => {
    appendAppLog('error', 'electron.main', 'stop_mobile_progress_runtime_failed', normalizeErrorDetails(error))
    console.error('[electron-main] failed to stop mobile progress runtime:', error)
  })
})

app.whenReady().then(() => {
  void configureApplicationIdentity()
    .then(() => bootstrapShell())
    .catch((error) => {
    appendAppLog('error', 'electron.main', 'runtime_shell_bootstrap_failed', normalizeErrorDetails(error))
    console.error('[electron-main] runtime shell bootstrap failed:', error)
    app.exit(1)
  })
})
