import type {
  PluginAutomationRunnerContext,
  PluginLogger,
  PluginToolPageHost,
  PluginToolRunRequest,
  PluginToolRunResponse,
  PluginToolRuntimePermission,
  PluginWorkflowPageHost,
  PluginStorage,
} from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'

export interface PluginHostProcessRuntime {
  execBundled(
    pluginId: string,
    resourceId: string,
    args?: string[],
    options?: {
      cwd?: string
      env?: Record<string, string>
    },
  ): Promise<{
    ok: boolean
    exitCode: number
    stdout: string
    stderr?: string
    error?: {
      code: string
      message: string
      details?: Record<string, unknown>
    }
  }>
}

export type PluginHostRuntime = Pick<PrestoRuntime, 'dialog'> &
  Partial<Pick<PrestoRuntime, 'macAccessibility' | 'fs' | 'shell'>> & {
    process?: PluginHostProcessRuntime
  }

export type PluginToolRunHost = (request: PluginToolRunRequest) => Promise<PluginToolRunResponse>

type MacAccessibilityClient = NonNullable<PrestoRuntime['macAccessibility']>
type ToolPermissionSet = ReadonlySet<PluginToolRuntimePermission>

class PluginToolPermissionError extends Error {
  readonly code = 'PLUGIN_TOOL_PERMISSION_DENIED'
  readonly pluginId: string
  readonly permission: PluginToolRuntimePermission

  constructor(pluginId: string, permission: PluginToolRuntimePermission) {
    super(`Plugin "${pluginId}" is not allowed to access ${permission}.`)
    this.name = 'PluginToolPermissionError'
    this.pluginId = pluginId
    this.permission = permission
  }
}

class PluginToolHostUnavailableError extends Error {
  readonly code = 'PLUGIN_TOOL_HOST_UNAVAILABLE'
  readonly pluginId: string
  readonly permission: PluginToolRuntimePermission

  constructor(pluginId: string, permission: PluginToolRuntimePermission) {
    super(`Plugin "${pluginId}" cannot access ${permission} because the required host runtime is unavailable.`)
    this.name = 'PluginToolHostUnavailableError'
    this.pluginId = pluginId
    this.permission = permission
  }
}

const unavailableMacAccessibility: MacAccessibilityClient = {
  async preflight() {
    return {
      ok: false,
      trusted: false,
      error: 'macAccessibility runtime is unavailable in this host shell.',
    }
  },
  async runScript() {
    return {
      ok: false,
      stdout: '',
      error: {
        code: 'MAC_ACCESSIBILITY_UNAVAILABLE',
        message: 'macAccessibility runtime is unavailable in this host shell.',
      },
    }
  },
  async runFile() {
    return {
      ok: false,
      stdout: '',
      error: {
        code: 'MAC_ACCESSIBILITY_UNAVAILABLE',
        message: 'macAccessibility runtime is unavailable in this host shell.',
      },
    }
  },
}

const inMemoryStorage = new Map<string, string>()

const unavailableToolRunHost: PluginToolRunHost = async ({ toolId }) => {
  throw new Error(`tool.run is unavailable in this host shell: ${toolId}`)
}

function createToolPermissionError(
  pluginId: string,
  permission: PluginToolRuntimePermission,
): PluginToolPermissionError {
  return new PluginToolPermissionError(pluginId, permission)
}

function rejectToolPermission<T>(
  pluginId: string,
  permission: PluginToolRuntimePermission,
): Promise<T> {
  return Promise.reject(createToolPermissionError(pluginId, permission))
}

function createToolHostUnavailableError(
  pluginId: string,
  permission: PluginToolRuntimePermission,
): PluginToolHostUnavailableError {
  return new PluginToolHostUnavailableError(pluginId, permission)
}

function rejectToolHostUnavailable<T>(
  pluginId: string,
  permission: PluginToolRuntimePermission,
): Promise<T> {
  return Promise.reject(createToolHostUnavailableError(pluginId, permission))
}

function hasToolPermission(
  permissions: ToolPermissionSet,
  permission: PluginToolRuntimePermission,
): boolean {
  return permissions.has(permission)
}

export function createHostPluginStorage(): PluginStorage {
  const storageApi = typeof window !== 'undefined' ? window.localStorage : null

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = storageApi ? storageApi.getItem(key) : inMemoryStorage.get(key) ?? null
      if (!raw) {
        return null
      }

      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      const encoded = JSON.stringify(value)
      if (storageApi) {
        storageApi.setItem(key, encoded)
        return
      }
      inMemoryStorage.set(key, encoded)
    },
    async delete(key: string): Promise<void> {
      if (storageApi) {
        storageApi.removeItem(key)
        return
      }
      inMemoryStorage.delete(key)
    },
  }
}

export function createHostPluginLogger(): PluginLogger {
  return {
    debug(message, meta) {
      console.debug(message, meta)
    },
    info(message, meta) {
      console.info(message, meta)
    },
    warn(message, meta) {
      console.warn(message, meta)
    },
    error(message, meta) {
      console.error(message, meta)
    },
  }
}

export function createPluginWorkflowPageHost(runtime: PluginHostRuntime): PluginWorkflowPageHost {
  return {
    async pickFolder() {
      if (typeof runtime.dialog.openFolder === 'function') {
        return runtime.dialog.openFolder()
      }
      if (typeof runtime.dialog.openDirectory === 'function') {
        return runtime.dialog.openDirectory()
      }
      return {
        canceled: true,
        paths: [],
      }
    },
  }
}

export function createPluginToolPageHost(
  runtime: PluginHostRuntime,
  pluginId: string,
  permissions: ToolPermissionSet,
  runToolHost: PluginToolRunHost = unavailableToolRunHost,
): PluginToolPageHost & { runTool: PluginToolRunHost } {
  return {
    dialog: {
      async openFile(options) {
        if (!hasToolPermission(permissions, 'dialog.openFile')) {
          return rejectToolPermission(pluginId, 'dialog.openFile')
        }
        if (typeof runtime.dialog.openFile === 'function') {
          return runtime.dialog.openFile(options)
        }
        return rejectToolHostUnavailable(pluginId, 'dialog.openFile')
      },
      async openDirectory() {
        if (!hasToolPermission(permissions, 'dialog.openDirectory')) {
          return rejectToolPermission(pluginId, 'dialog.openDirectory')
        }
        if (typeof runtime.dialog.openDirectory === 'function') {
          return runtime.dialog.openDirectory()
        }
        if (typeof runtime.dialog.openFolder === 'function') {
          return runtime.dialog.openFolder()
        }
        return rejectToolHostUnavailable(pluginId, 'dialog.openDirectory')
      },
    },
    fs: {
      readFile: (path) =>
        !hasToolPermission(permissions, 'fs.read')
          ? rejectToolPermission(pluginId, 'fs.read')
          : runtime.fs
            ? runtime.fs.readFile(path)
            : rejectToolHostUnavailable(pluginId, 'fs.read'),
      writeFile: (path, content) =>
        !hasToolPermission(permissions, 'fs.write')
          ? rejectToolPermission(pluginId, 'fs.write')
          : runtime.fs
            ? runtime.fs.writeFile(path, content)
            : rejectToolHostUnavailable(pluginId, 'fs.write'),
      exists: (path) =>
        !hasToolPermission(permissions, 'fs.read')
          ? rejectToolPermission(pluginId, 'fs.read')
          : runtime.fs
            ? runtime.fs.exists(path)
            : rejectToolHostUnavailable(pluginId, 'fs.read'),
      readdir: (path) =>
        !hasToolPermission(permissions, 'fs.list')
          ? rejectToolPermission(pluginId, 'fs.list')
          : runtime.fs
            ? runtime.fs.readdir(path)
            : rejectToolHostUnavailable(pluginId, 'fs.list'),
      deleteFile: (path) =>
        !hasToolPermission(permissions, 'fs.delete')
          ? rejectToolPermission(pluginId, 'fs.delete')
          : runtime.fs
            ? runtime.fs.deleteFile(path)
            : rejectToolHostUnavailable(pluginId, 'fs.delete'),
    },
    shell: {
      openPath: (path) =>
        !hasToolPermission(permissions, 'shell.openPath')
          ? rejectToolPermission(pluginId, 'shell.openPath')
          : runtime.shell
            ? runtime.shell.openPath(path)
            : rejectToolHostUnavailable(pluginId, 'shell.openPath'),
    },
    runTool: runToolHost,
  }
}

export function createPluginPageHost(runtime: PluginHostRuntime): PluginWorkflowPageHost {
  return createPluginWorkflowPageHost(runtime)
}

export function createAutomationRunnerContext(
  context: Omit<PluginAutomationRunnerContext, 'macAccessibility'>,
  runtime: PluginHostRuntime,
): PluginAutomationRunnerContext {
  return {
    ...context,
    macAccessibility: runtime.macAccessibility ?? unavailableMacAccessibility,
  }
}
