import { createPrestoRuntime } from '../../../packages/sdk-runtime/src/createPrestoRuntime'
import type { AppLatestReleaseInfo, AppRuntimeClient, AppViewLogResult } from '../../../packages/sdk-runtime/src/clients/app'
import type {
  AutomationDefinition,
  AutomationRunDefinitionRequest,
  AutomationRunDefinitionResult,
  AutomationRuntimeClient,
} from '../../../packages/sdk-runtime/src/clients/automation'
import type { BackendRuntimeClient, BackendStatus, DawAdapterSnapshot } from '../../../packages/sdk-runtime/src/clients/backend'
import type { DialogOpenFolderResult, DialogRuntimeClient } from '../../../packages/sdk-runtime/src/clients/dialog'
import type { FsRuntimeClient, FsStat } from '../../../packages/sdk-runtime/src/clients/fs'
import type {
  MacAccessibilityPreflightResult,
  MacAccessibilityRunResult,
  MacAccessibilityRuntimeClient,
} from '../../../packages/sdk-runtime/src/clients/macAccessibility'
import type {
  MobileProgressCreateSessionResult,
  MobileProgressGetViewUrlResult,
  MobileProgressRuntimeClient,
} from '../../../packages/sdk-runtime/src/clients/mobileProgress'
import type { ShellRuntimeClient } from '../../../packages/sdk-runtime/src/clients/shell'
import type { WindowRuntimeClient } from '../../../packages/sdk-runtime/src/clients/window'
import type { CapabilityRequestEnvelope, CapabilityResponseEnvelope } from '../../../packages/contracts/src'

export interface RuntimeBridgeInvoke {
  (channel: string, ...args: unknown[]): Promise<unknown>
}

export const runtimeBridgeChannels = {
  app: {
    getVersion: 'app:get-version',
    getLatestRelease: 'app:get-latest-release',
    viewLog: 'app:view-log',
  },
  automation: {
    listDefinitions: 'automation:list-definitions',
    runDefinition: 'automation:run-definition',
  },
  backend: {
    getStatus: 'backend:get-status',
    getDawAdapterSnapshot: 'backend:get-daw-adapter-snapshot',
    restart: 'backend:restart',
    setDawTarget: 'backend:set-daw-target',
    setDeveloperMode: 'backend:set-developer-mode',
    invokeCapability: 'backend:invoke-capability',
  },
  dialog: {
    open: 'dialog:open',
  },
  shell: {
    openPath: 'shell:open-path',
    openExternal: 'shell:open-external',
  },
  fs: {
    readFile: 'fs:read-file',
    writeFile: 'fs:write-file',
    ensureDir: 'fs:ensure-dir',
    getHomePath: 'fs:get-home-path',
    exists: 'fs:exists',
    stat: 'fs:stat',
    readdir: 'fs:readdir',
    mkdir: 'fs:mkdir',
    unlink: 'fs:unlink',
    rmdir: 'fs:rmdir',
    deleteFile: 'fs:delete-file',
  },
  window: {
    toggleAlwaysOnTop: 'window:toggle-always-on-top',
    getAlwaysOnTop: 'window:get-always-on-top',
    setAlwaysOnTop: 'window:set-always-on-top',
  },
  mobileProgress: {
    createSession: 'mobileProgress:createSession',
    closeSession: 'mobileProgress:closeSession',
    getViewUrl: 'mobileProgress:getViewUrl',
    updateSession: 'mobileProgress:updateSession',
  },
  macAccessibility: {
    preflight: 'macAccessibility:preflight',
    runScript: 'macAccessibility:run-script',
    runFile: 'macAccessibility:run-file',
  },
} as const

function invokeTyped<T>(invoke: RuntimeBridgeInvoke, channel: string, ...args: unknown[]): Promise<T> {
  return invoke(channel, ...args) as Promise<T>
}

function createAppRuntime(invoke: RuntimeBridgeInvoke): AppRuntimeClient {
  return {
    getVersion: () => invokeTyped<string>(invoke, runtimeBridgeChannels.app.getVersion),
    getLatestRelease: () => invokeTyped<AppLatestReleaseInfo>(invoke, runtimeBridgeChannels.app.getLatestRelease),
    viewLog: () => invokeTyped<AppViewLogResult>(invoke, runtimeBridgeChannels.app.viewLog),
  }
}

function createAutomationRuntime(invoke: RuntimeBridgeInvoke): AutomationRuntimeClient {
  return {
    listDefinitions: () =>
      invokeTyped<AutomationDefinition[]>(invoke, runtimeBridgeChannels.automation.listDefinitions),
    runDefinition: (request: AutomationRunDefinitionRequest) =>
      invokeTyped<AutomationRunDefinitionResult>(invoke, runtimeBridgeChannels.automation.runDefinition, request),
  }
}

function createBackendRuntime(invoke: RuntimeBridgeInvoke): BackendRuntimeClient {
  return {
    getStatus: () => invokeTyped<BackendStatus>(invoke, runtimeBridgeChannels.backend.getStatus),
    getDawAdapterSnapshot: () =>
      invokeTyped<DawAdapterSnapshot>(invoke, runtimeBridgeChannels.backend.getDawAdapterSnapshot),
    restart: () => invokeTyped<{ ok: true }>(invoke, runtimeBridgeChannels.backend.restart),
    setDawTarget: (target: string) =>
      invokeTyped<{ ok: true; target: string }>(invoke, runtimeBridgeChannels.backend.setDawTarget, target),
    setDeveloperMode: (enabled: boolean) =>
      invokeTyped<{ ok: true; enabled: boolean }>(invoke, runtimeBridgeChannels.backend.setDeveloperMode, enabled),
    invokeCapability: <TRequest, TResponse>(request: CapabilityRequestEnvelope<TRequest>) =>
      invokeTyped<CapabilityResponseEnvelope<TResponse>>(invoke, runtimeBridgeChannels.backend.invokeCapability, request),
  } as BackendRuntimeClient & {
    invokeCapability<TRequest, TResponse>(
      request: CapabilityRequestEnvelope<TRequest>,
    ): Promise<CapabilityResponseEnvelope<TResponse>>
  }
}

function createDialogRuntime(invoke: RuntimeBridgeInvoke): DialogRuntimeClient {
  return {
    openFolder: async () => {
      const response = await invokeTyped<{ canceled: boolean; filePaths: string[] }>(invoke, runtimeBridgeChannels.dialog.open, {
        properties: ['openDirectory'],
      })
      const result: DialogOpenFolderResult = {
        canceled: response.canceled,
        paths: response.filePaths,
      }
      return result
    },
  }
}

function createShellRuntime(invoke: RuntimeBridgeInvoke): ShellRuntimeClient {
  return {
    openPath: (path: string) => invokeTyped<string>(invoke, runtimeBridgeChannels.shell.openPath, path),
    openExternal: (url: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.shell.openExternal, url),
  }
}

function createFsRuntime(invoke: RuntimeBridgeInvoke): FsRuntimeClient {
  return {
    readFile: (path: string) => invokeTyped<string | null>(invoke, runtimeBridgeChannels.fs.readFile, path),
    writeFile: (path: string, content: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.writeFile, path, content),
    ensureDir: (path: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.ensureDir, path),
    getHomePath: () => invokeTyped<string>(invoke, runtimeBridgeChannels.fs.getHomePath),
    exists: (path: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.exists, path),
    stat: (path: string) => invokeTyped<FsStat | null>(invoke, runtimeBridgeChannels.fs.stat, path),
    readdir: (path: string) => invokeTyped<string[]>(invoke, runtimeBridgeChannels.fs.readdir, path),
    mkdir: (path: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.mkdir, path),
    unlink: (path: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.unlink, path),
    rmdir: (path: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.rmdir, path),
    deleteFile: (path: string) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.fs.deleteFile, path),
  }
}

function createWindowRuntime(invoke: RuntimeBridgeInvoke): WindowRuntimeClient {
  return {
    toggleAlwaysOnTop: () => invokeTyped<boolean>(invoke, runtimeBridgeChannels.window.toggleAlwaysOnTop),
    getAlwaysOnTop: () => invokeTyped<boolean>(invoke, runtimeBridgeChannels.window.getAlwaysOnTop),
    setAlwaysOnTop: (enabled: boolean) => invokeTyped<boolean>(invoke, runtimeBridgeChannels.window.setAlwaysOnTop, enabled),
  }
}

function createMobileProgressRuntime(invoke: RuntimeBridgeInvoke): MobileProgressRuntimeClient {
  return {
    createSession: (taskId: string) =>
      invokeTyped<MobileProgressCreateSessionResult>(invoke, runtimeBridgeChannels.mobileProgress.createSession, taskId),
    closeSession: (sessionId: string) => invokeTyped<{ ok: boolean }>(invoke, runtimeBridgeChannels.mobileProgress.closeSession, sessionId),
    getViewUrl: (sessionId: string) =>
      invokeTyped<MobileProgressGetViewUrlResult>(invoke, runtimeBridgeChannels.mobileProgress.getViewUrl, sessionId),
    updateSession: (sessionId: string, payload: unknown) =>
      invokeTyped(invoke, runtimeBridgeChannels.mobileProgress.updateSession, sessionId, payload),
  }
}

function createMacAccessibilityRuntime(invoke: RuntimeBridgeInvoke): MacAccessibilityRuntimeClient {
  return {
    preflight: () => invokeTyped<MacAccessibilityPreflightResult>(invoke, runtimeBridgeChannels.macAccessibility.preflight),
    runScript: (script: string, args?: string[]) =>
      invokeTyped<MacAccessibilityRunResult>(invoke, runtimeBridgeChannels.macAccessibility.runScript, script, args),
    runFile: (path: string, args?: string[]) =>
      invokeTyped<MacAccessibilityRunResult>(invoke, runtimeBridgeChannels.macAccessibility.runFile, path, args),
  }
}

export function createRuntimeBridge(invoke: RuntimeBridgeInvoke) {
  return createPrestoRuntime({
    app: createAppRuntime(invoke),
    automation: createAutomationRuntime(invoke),
    backend: createBackendRuntime(invoke),
    dialog: createDialogRuntime(invoke),
    shell: createShellRuntime(invoke),
    fs: createFsRuntime(invoke),
    mobileProgress: createMobileProgressRuntime(invoke),
    macAccessibility: createMacAccessibilityRuntime(invoke),
    window: createWindowRuntime(invoke),
  })
}
