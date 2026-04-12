import { createPrestoRuntime } from '@presto/sdk-runtime/createPrestoRuntime'
import type {
  AppReleaseCheckRequest,
  AppReleaseCheckResult,
  AppRuntimeClient,
  AppViewLogResult,
} from '@presto/sdk-runtime/clients/app'
import type {
  BackendCapabilityDefinition,
  BackendRuntimeClient,
  BackendStatus,
  DawAdapterSnapshot,
} from '@presto/sdk-runtime/clients/backend'
import type {
  DialogOpenDirectoryResult,
  DialogOpenFileResult,
  DialogOpenFolderResult,
  DialogRuntimeClient,
} from '@presto/sdk-runtime/clients/dialog'
import type { FsRuntimeClient, FsStat } from '@presto/sdk-runtime/clients/fs'
import type {
  MacAccessibilityPreflightResult,
  MacAccessibilityRunResult,
  MacAccessibilityRuntimeClient,
} from '@presto/sdk-runtime/clients/macAccessibility'
import type {
  MobileProgressCreateSessionResult,
  MobileProgressGetViewUrlResult,
  MobileProgressRuntimeClient,
} from '@presto/sdk-runtime/clients/mobileProgress'
import type {
  PluginRuntimeClient,
  PluginRuntimeInstallResult,
  PluginRuntimeListResult,
  PluginRuntimeUninstallResult,
  PluginRuntimeSetEnabledResult,
} from '@presto/sdk-runtime/clients/plugins'
import type { ShellRuntimeClient } from '@presto/sdk-runtime/clients/shell'
import type { WindowRuntimeClient } from '@presto/sdk-runtime/clients/window'
import type { CapabilityRequestEnvelope, CapabilityResponseEnvelope } from '@presto/contracts'

export interface DesktopRuntimeOperationMap {
  app: {
    getVersion: string
    checkForUpdates: string
    viewLog: string
  }
  backend: {
    getStatus: string
    listCapabilities: string
    getDawAdapterSnapshot: string
    restart: string
    setDawTarget: string
    setDeveloperMode: string
    invokeCapability: string
  }
  dialog: {
    open: string
  }
  shell: {
    openPath: string
    openExternal: string
  }
  fs: {
    readFile: string
    writeFile: string
    ensureDir: string
    getHomePath: string
    exists: string
    stat: string
    readdir: string
    mkdir: string
    unlink: string
    rmdir: string
    deleteFile: string
  }
  plugins: {
    list: string
    installFromDirectory: string
    installFromZip: string
    setEnabled: string
    uninstall: string
  }
  window: {
    toggleAlwaysOnTop: string
    getAlwaysOnTop: string
    setAlwaysOnTop: string
  }
  mobileProgress: {
    createSession: string
    closeSession: string
    getViewUrl: string
    updateSession: string
  }
  macAccessibility: {
    preflight: string
    runScript: string
    runFile: string
  }
}

export interface DesktopRuntimeInvoke {
  (operation: string, ...args: unknown[]): Promise<unknown>
}

function invokeTyped<T>(invoke: DesktopRuntimeInvoke, operation: string, ...args: unknown[]): Promise<T> {
  return invoke(operation, ...args) as Promise<T>
}

export function createDesktopRuntimeBridge(
  operations: DesktopRuntimeOperationMap,
  invoke: DesktopRuntimeInvoke,
) {
  const app: AppRuntimeClient = {
    getVersion: () => invokeTyped<string>(invoke, operations.app.getVersion),
    checkForUpdates: (request: AppReleaseCheckRequest) =>
      invokeTyped<AppReleaseCheckResult>(invoke, operations.app.checkForUpdates, request),
    viewLog: () => invokeTyped<AppViewLogResult>(invoke, operations.app.viewLog),
  }

  const backend = {
    getStatus: () => invokeTyped<BackendStatus>(invoke, operations.backend.getStatus),
    listCapabilities: () =>
      invokeTyped<BackendCapabilityDefinition[]>(invoke, operations.backend.listCapabilities),
    getDawAdapterSnapshot: () =>
      invokeTyped<DawAdapterSnapshot>(invoke, operations.backend.getDawAdapterSnapshot),
    restart: () => invokeTyped<{ ok: true }>(invoke, operations.backend.restart),
    setDawTarget: (target: string) =>
      invokeTyped<{ ok: true; target: string }>(invoke, operations.backend.setDawTarget, target),
    setDeveloperMode: (enabled: boolean) =>
      invokeTyped<{ ok: true; enabled: boolean }>(invoke, operations.backend.setDeveloperMode, enabled),
    invokeCapability: <TRequest, TResponse>(request: CapabilityRequestEnvelope<TRequest>) =>
      invokeTyped<CapabilityResponseEnvelope<TResponse>>(invoke, operations.backend.invokeCapability, request),
  } as BackendRuntimeClient & {
    invokeCapability<TRequest, TResponse>(
      request: CapabilityRequestEnvelope<TRequest>,
    ): Promise<CapabilityResponseEnvelope<TResponse>>
  }

  const dialog: DialogRuntimeClient = {
    openFolder: async () => {
      const response = await invokeTyped<{ canceled: boolean; filePaths: string[] }>(invoke, operations.dialog.open, {
        properties: ['openDirectory'],
      })
      const result: DialogOpenFolderResult = {
        canceled: response.canceled,
        paths: response.filePaths,
      }
      return result
    },
    openFile: async () => {
      const response = await invokeTyped<{ canceled: boolean; filePaths: string[] }>(invoke, operations.dialog.open, {
        properties: ['openFile'],
      })
      const result: DialogOpenFileResult = {
        canceled: response.canceled,
        paths: response.filePaths,
      }
      return result
    },
    openDirectory: async () => {
      const response = await invokeTyped<{ canceled: boolean; filePaths: string[] }>(invoke, operations.dialog.open, {
        properties: ['openDirectory'],
      })
      const result: DialogOpenDirectoryResult = {
        canceled: response.canceled,
        paths: response.filePaths,
      }
      return result
    },
  }

  const shell: ShellRuntimeClient = {
    openPath: (path: string) => invokeTyped<string>(invoke, operations.shell.openPath, path),
    openExternal: (url: string) => invokeTyped<boolean>(invoke, operations.shell.openExternal, url),
  }

  const fs: FsRuntimeClient = {
    readFile: (path: string) => invokeTyped<string | null>(invoke, operations.fs.readFile, path),
    writeFile: (path: string, content: string) =>
      invokeTyped<boolean>(invoke, operations.fs.writeFile, path, content),
    ensureDir: (path: string) => invokeTyped<boolean>(invoke, operations.fs.ensureDir, path),
    getHomePath: () => invokeTyped<string>(invoke, operations.fs.getHomePath),
    exists: (path: string) => invokeTyped<boolean>(invoke, operations.fs.exists, path),
    stat: (path: string) => invokeTyped<FsStat | null>(invoke, operations.fs.stat, path),
    readdir: (path: string) => invokeTyped<string[]>(invoke, operations.fs.readdir, path),
    mkdir: (path: string) => invokeTyped<boolean>(invoke, operations.fs.mkdir, path),
    unlink: (path: string) => invokeTyped<boolean>(invoke, operations.fs.unlink, path),
    rmdir: (path: string) => invokeTyped<boolean>(invoke, operations.fs.rmdir, path),
    deleteFile: (path: string) => invokeTyped<boolean>(invoke, operations.fs.deleteFile, path),
  }

  const plugins: PluginRuntimeClient = {
    list: () => invokeTyped<PluginRuntimeListResult>(invoke, operations.plugins.list),
    installFromDirectory: (overwrite = false) =>
      invokeTyped<PluginRuntimeInstallResult>(invoke, operations.plugins.installFromDirectory, overwrite),
    installFromZip: (overwrite = false) =>
      invokeTyped<PluginRuntimeInstallResult>(invoke, operations.plugins.installFromZip, overwrite),
    setEnabled: (pluginId: string, enabled: boolean) =>
      invokeTyped<PluginRuntimeSetEnabledResult>(invoke, operations.plugins.setEnabled, pluginId, enabled),
    uninstall: (pluginId: string) =>
      invokeTyped<PluginRuntimeUninstallResult>(invoke, operations.plugins.uninstall, pluginId),
  }

  const window: WindowRuntimeClient = {
    toggleAlwaysOnTop: () => invokeTyped<boolean>(invoke, operations.window.toggleAlwaysOnTop),
    getAlwaysOnTop: () => invokeTyped<boolean>(invoke, operations.window.getAlwaysOnTop),
    setAlwaysOnTop: (enabled: boolean) => invokeTyped<boolean>(invoke, operations.window.setAlwaysOnTop, enabled),
  }

  const mobileProgress: MobileProgressRuntimeClient = {
    createSession: (taskId: string) =>
      invokeTyped<MobileProgressCreateSessionResult>(invoke, operations.mobileProgress.createSession, taskId),
    closeSession: (sessionId: string) =>
      invokeTyped<{ ok: boolean }>(invoke, operations.mobileProgress.closeSession, sessionId),
    getViewUrl: (sessionId: string) =>
      invokeTyped<MobileProgressGetViewUrlResult>(invoke, operations.mobileProgress.getViewUrl, sessionId),
    updateSession: (sessionId: string, payload: unknown) =>
      invokeTyped(invoke, operations.mobileProgress.updateSession, sessionId, payload),
  }

  const macAccessibility: MacAccessibilityRuntimeClient = {
    preflight: () => invokeTyped<MacAccessibilityPreflightResult>(invoke, operations.macAccessibility.preflight),
    runScript: (script: string, args?: string[]) =>
      invokeTyped<MacAccessibilityRunResult>(invoke, operations.macAccessibility.runScript, script, args),
    runFile: (path: string, args?: string[]) =>
      invokeTyped<MacAccessibilityRunResult>(invoke, operations.macAccessibility.runFile, path, args),
  }

  return createPrestoRuntime({
    app,
    backend,
    dialog,
    shell,
    fs,
    plugins,
    mobileProgress,
    macAccessibility,
    window,
  })
}
