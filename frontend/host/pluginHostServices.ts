import type {
  PluginAutomationRunnerContext,
  PluginLogger,
  PluginToolPageHost,
  PluginToolRunRequest,
  PluginToolRunResponse,
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

const unavailableToolFsHost: PluginToolPageHost['fs'] = {
  async readFile() {
    return null
  },
  async writeFile() {
    return false
  },
  async exists() {
    return false
  },
  async readdir() {
    return []
  },
  async deleteFile() {
    return false
  },
}

const unavailableToolShellHost: PluginToolPageHost['shell'] = {
  async openPath(path) {
    return `shell runtime is unavailable in this host shell: ${path}`
  },
}

const unavailableToolRunHost: PluginToolRunHost = async ({ toolId }) => {
  throw new Error(`tool.run is unavailable in this host shell: ${toolId}`)
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
  runToolHost: PluginToolRunHost = unavailableToolRunHost,
): PluginToolPageHost & { runTool: PluginToolRunHost } {
  return {
    dialog: {
      async openFile(options) {
        if (typeof runtime.dialog.openFile === 'function') {
          return runtime.dialog.openFile(options)
        }
        return {
          canceled: true,
          paths: [],
        }
      },
      async openDirectory() {
        if (typeof runtime.dialog.openDirectory === 'function') {
          return runtime.dialog.openDirectory()
        }
        if (typeof runtime.dialog.openFolder === 'function') {
          return runtime.dialog.openFolder()
        }
        return {
          canceled: true,
          paths: [],
        }
      },
    },
    fs: runtime.fs
      ? {
          readFile: (path) => runtime.fs!.readFile(path),
          writeFile: (path, content) => runtime.fs!.writeFile(path, content),
          exists: (path) => runtime.fs!.exists(path),
          readdir: (path) => runtime.fs!.readdir(path),
          deleteFile: (path) => runtime.fs!.deleteFile(path),
        }
      : unavailableToolFsHost,
    shell: runtime.shell
      ? {
          openPath: (path) => runtime.shell!.openPath(path),
        }
      : unavailableToolShellHost,
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
