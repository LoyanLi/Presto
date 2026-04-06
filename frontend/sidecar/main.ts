import { createInterface } from 'node:readline'

import { createAutomationRuntime } from '../runtime/automationRuntime.mjs'
import { createAppLogStore } from '../runtime/appLogStore.mjs'
import { createMacAccessibilityRuntime } from '../runtime/macAccessibilityRuntime.mjs'
import { createMobileProgressRuntimeController } from '../runtime/mobileProgressRuntimeController.mjs'
import { createBackendSupervisor, type BackendSupervisor } from '../runtime/backendSupervisor'
import { createPluginHostService } from '../runtime/pluginHostService'
import { enrichCapabilityRequestForBackend } from './capabilityRouting'
import {
  createSidecarBootstrapErrorLogEntry,
  createSidecarParseErrorLogEntry,
  createSidecarRpcErrorLogEntry,
} from './logging'
import {
  resolveAutomationDefinitionsDir,
  resolveAutomationScriptsDir,
  resolveBackendRoot,
  resolveLogsDir,
  resolveManagedPluginsRoot,
  resolveOfficialPluginsRoot,
} from './resourcePaths'

type RpcRequest = {
  id: string
  operation: string
  args?: unknown[]
}

type RpcResponse = {
  id: string
  ok: boolean
  result?: unknown
  error?: {
    message: string
  }
}

let backendSupervisor: BackendSupervisor | null = null
let currentDawTarget = 'pro_tools'

const appLogStore = createAppLogStore({
  logDir: resolveLogsDir(),
})
const macAccessibilityRuntime = createMacAccessibilityRuntime()
const automationRuntime = createAutomationRuntime({
  definitionsDir: resolveAutomationDefinitionsDir(),
  scriptsDir: resolveAutomationScriptsDir(),
  macAccessibilityRuntime,
})
const pluginHostService = createPluginHostService({
  managedPluginsRoot: resolveManagedPluginsRoot(),
  discoveryRoots: [],
  currentDaw: currentDawTarget,
  isHostApiVersionCompatible(hostApiVersion) {
    return hostApiVersion === '0.1.0' || hostApiVersion === '1' || hostApiVersion === '1.0.0'
  },
})
const mobileProgressRuntimeController = createMobileProgressRuntimeController({
  loadJobForMobileProgress,
})

function appendAppLogEntry(entry: { level: 'info' | 'warn' | 'error'; source: string; message: string; details: unknown }) {
  appLogStore.append(entry)
}

async function ensureBackendSupervisor(): Promise<BackendSupervisor> {
  if (!backendSupervisor) {
    backendSupervisor = createBackendSupervisor({
      targetDaw: currentDawTarget,
      onLog(entry) {
        appLogStore.append(entry)
      },
      resolvePythonBinImpl: undefined,
    })
  }

  return backendSupervisor
}

async function invokeCapability(request: unknown) {
  const supervisor = await ensureBackendSupervisor()
  const enrichedRequest = await enrichCapabilityRequestForBackend(
    request as Parameters<BackendSupervisor['invokeCapability']>[0],
    pluginHostService,
  )
  return supervisor.invokeCapability(enrichedRequest as never)
}

async function loadJobForMobileProgress(taskId: string) {
  const response = await invokeCapability({
    requestId: `mobile-progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capability: 'jobs.get',
    payload: {
      jobId: String(taskId),
    },
    meta: {
      clientName: 'mobile-progress',
      clientVersion: '0.3.2',
      sdkVersion: '0.3.2',
    },
  })

  if (!response.success) {
    throw new Error(response.error?.message || response.error?.code || 'Failed to load progress.')
  }

  return response.data
}

async function loadDawAdapterSnapshot() {
  const response = await invokeCapability({
    requestId: `backend-daw-adapter-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capability: 'daw.adapter.getSnapshot',
    payload: {},
    meta: {
      clientName: 'tauri-sidecar',
      clientVersion: '0.3.2',
      sdkVersion: '0.3.2',
    },
  })

  if (!response.success) {
    throw new Error(response.error?.message || response.error?.code || 'Failed to load DAW adapter snapshot.')
  }

  return response.data
}

async function loadCapabilityCatalog() {
  const supervisor = await ensureBackendSupervisor()
  return supervisor.listCapabilities()
}

async function setBackendDeveloperMode(enabled: unknown) {
  const resolvedEnabled = Boolean(enabled)
  const runtimeMeta = {
    clientName: 'tauri-sidecar',
    clientVersion: '0.3.2',
    sdkVersion: '0.3.2',
  }
  const requestIdSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const getConfigResponse = await invokeCapability({
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
  const updateConfigResponse = await invokeCapability({
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

async function applyDawTarget(nextTarget: unknown) {
  const resolvedTarget = String(nextTarget ?? '')
  if (resolvedTarget !== 'pro_tools') {
    throw new Error(`unsupported_daw_target:${resolvedTarget || 'unknown'}`)
  }

  currentDawTarget = resolvedTarget
  if (backendSupervisor) {
    await backendSupervisor.stop()
    backendSupervisor = null
  }
  return currentDawTarget
}

async function fetchLatestGithubRelease() {
  const repo = process.env.PRESTO_GITHUB_REPO || 'LoyanLi/Presto'
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Presto-App',
    },
  })

  if (!response.ok) {
    throw new Error(`github_release_fetch_failed:${response.status}`)
  }

  const payload = await response.json()
  return {
    repo,
    tagName: typeof payload.tag_name === 'string' ? payload.tag_name : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    htmlUrl: typeof payload.html_url === 'string' ? payload.html_url : '',
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : '',
    prerelease: Boolean(payload.prerelease),
    draft: Boolean(payload.draft),
  }
}

async function initialize() {
  process.env.PRESTO_BACKEND_ROOT = resolveBackendRoot()
  await pluginHostService.syncOfficialExtensions({
    officialExtensionsRoot: resolveOfficialPluginsRoot(),
  })
}

async function handleRequest(request: RpcRequest): Promise<unknown> {
  switch (request.operation) {
    case 'app.release.latest.get':
      return fetchLatestGithubRelease()
    case 'app.log.current-path.get':
      return {
        filePath: appLogStore.getCurrentLogPath(),
      }
    case 'backend.status.get':
      return (await ensureBackendSupervisor()).getStatus()
    case 'backend.capabilities.list':
      return loadCapabilityCatalog()
    case 'backend.lifecycle.restart': {
      const supervisor = await ensureBackendSupervisor()
      await supervisor.stop()
      await supervisor.start()
      await supervisor.health()
      return { ok: true }
    }
    case 'backend.daw-adapter.snapshot.get':
      return loadDawAdapterSnapshot()
    case 'backend.daw-target.set':
      return {
        ok: true,
        target: await applyDawTarget(request.args?.[0]),
      }
    case 'backend.developer-mode.set':
      return setBackendDeveloperMode(request.args?.[0])
    case 'backend.capability.invoke':
      return invokeCapability(request.args?.[0])
    case 'plugins.catalog.list':
      return pluginHostService.listPlugins()
    case 'plugins.install.directory.selected':
      return pluginHostService.installFromDirectory({
        selectedPath: String(request.args?.[0] ?? ''),
        overwrite: Boolean(request.args?.[1]),
      })
    case 'plugins.install.zip.selected':
      return pluginHostService.installFromZip({
        zipPath: String(request.args?.[0] ?? ''),
        overwrite: Boolean(request.args?.[1]),
      })
    case 'plugins.set-enabled':
      return pluginHostService.setEnabled(String(request.args?.[0] ?? ''), Boolean(request.args?.[1]))
    case 'plugins.uninstall':
      return pluginHostService.uninstall(String(request.args?.[0] ?? ''))
    case 'automation.definition.list':
      return automationRuntime.listDefinitions()
    case 'automation.definition.run':
      return automationRuntime.runDefinition(request.args?.[0] as Record<string, unknown>)
    case 'mobile-progress.session.create': {
      const { runtime } = await mobileProgressRuntimeController.ensureRuntime()
      return mobileProgressRuntimeController.decorateResult(runtime.createSession(String(request.args?.[0] ?? '')))
    }
    case 'mobile-progress.session.close': {
      const { runtime } = await mobileProgressRuntimeController.ensureRuntime()
      return runtime.closeSession(String(request.args?.[0] ?? ''))
    }
    case 'mobile-progress.view-url.get': {
      const { runtime } = await mobileProgressRuntimeController.ensureRuntime()
      return mobileProgressRuntimeController.decorateResult(runtime.getViewUrl(String(request.args?.[0] ?? '')))
    }
    case 'mobile-progress.session.update': {
      const { runtime } = await mobileProgressRuntimeController.ensureRuntime()
      return runtime.updateSession(String(request.args?.[0] ?? ''), request.args?.[1])
    }
    case 'mac-accessibility.preflight':
      return macAccessibilityRuntime.preflight()
    case 'mac-accessibility.script.run':
      return macAccessibilityRuntime.runScript(String(request.args?.[0] ?? ''), request.args?.[1] as string[] | undefined)
    case 'mac-accessibility.file.run':
      return macAccessibilityRuntime.runFile(String(request.args?.[0] ?? ''), request.args?.[1] as string[] | undefined)
    default:
      throw new Error(`unsupported_operation:${request.operation}`)
  }
}

async function main() {
  await initialize()

  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  rl.on('line', (line) => {
    if (!line.trim()) {
      return
    }

    let request: RpcRequest
    try {
      request = JSON.parse(line) as RpcRequest
    } catch (error) {
      appendAppLogEntry(createSidecarParseErrorLogEntry(error))
      const response: RpcResponse = {
        id: 'parse-error',
        ok: false,
        error: {
          message: error instanceof Error ? error.message : 'invalid_json',
        },
      }
      process.stdout.write(`${JSON.stringify(response)}\n`)
      return
    }

    void handleRequest(request)
      .then((result) => {
        const response: RpcResponse = {
          id: request.id,
          ok: true,
          result,
        }
        process.stdout.write(`${JSON.stringify(response)}\n`)
      })
      .catch((error) => {
        appendAppLogEntry(createSidecarRpcErrorLogEntry(request, error))
        const response: RpcResponse = {
          id: request.id,
          ok: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        }
        process.stdout.write(`${JSON.stringify(response)}\n`)
      })
  })
}

process.on('SIGTERM', () => {
  void mobileProgressRuntimeController.closeRuntime().finally(() => process.exit(0))
})

void main().catch((error) => {
  appendAppLogEntry(createSidecarBootstrapErrorLogEntry(error))
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
