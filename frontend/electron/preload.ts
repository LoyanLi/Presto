import { createRuntimeBridge } from './runtime/runtimeBridge'
import { createPrestoClient } from '../../packages/sdk-core/src/createPrestoClient'
import type {
  CapabilityRequestEnvelope,
  CapabilityResponseEnvelope,
  PrestoClient,
  PrestoTransport,
} from '../../packages/contracts/src'

type ElectronPreloadApi = {
  contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void
  }
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
  }
}

type PluginHostBridge = {
  listPlugins(): Promise<unknown>
  installFromDirectory(overwrite?: boolean): Promise<unknown>
  installFromZip(overwrite?: boolean): Promise<unknown>
  uninstall(pluginId: string): Promise<unknown>
}

type PrestoBootstrap = {
  takeClient(): PrestoClient
  takeRuntime(): typeof runtime
  takePluginHostBridge(): PluginHostBridge
}

declare const require: {
  (id: string): ElectronPreloadApi
}

const { contextBridge, ipcRenderer } = require('electron')

const runtime = createRuntimeBridge((channel, ...args) => ipcRenderer.invoke(channel, ...args))
const transport: PrestoTransport = Object.freeze({
  invoke<TRequest, TResponse>(
    request: CapabilityRequestEnvelope<TRequest>
  ): Promise<CapabilityResponseEnvelope<TResponse>> {
    return ipcRenderer.invoke('backend:invoke-capability', request) as Promise<CapabilityResponseEnvelope<TResponse>>
  },
})
const prestoClient = createPrestoClient({
  transport,
  clientName: 'electron-renderer',
  clientVersion: '0.1.0',
})
const pluginHostBridge: PluginHostBridge = Object.freeze({
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  installFromDirectory: (overwrite = false) => ipcRenderer.invoke('plugins:install-directory', overwrite),
  installFromZip: (overwrite = false) => ipcRenderer.invoke('plugins:install-zip', overwrite),
  uninstall: (pluginId: string) => ipcRenderer.invoke('plugins:uninstall', pluginId),
})

const prestoBootstrap: PrestoBootstrap = (() => {
  let client: PrestoClient | null = prestoClient
  let hostRuntime: typeof runtime | null = runtime
  let hostBridge: PluginHostBridge | null = pluginHostBridge

  return Object.freeze({
    takeClient(): PrestoClient {
      if (!client) {
        throw new Error('presto_client_already_taken')
      }

      const nextClient = client
      client = null
      return nextClient
    },
    takeRuntime(): typeof runtime {
      if (!hostRuntime) {
        throw new Error('presto_runtime_already_taken')
      }

      const nextRuntime = hostRuntime
      hostRuntime = null
      return nextRuntime
    },
    takePluginHostBridge(): PluginHostBridge {
      if (!hostBridge) {
        throw new Error('presto_plugin_host_bridge_already_taken')
      }

      const nextBridge = hostBridge
      hostBridge = null
      return nextBridge
    },
  })
})()

contextBridge.exposeInMainWorld('__PRESTO_BOOTSTRAP__', prestoBootstrap)

declare global {
  interface Window {
    __PRESTO_BOOTSTRAP__?: typeof prestoBootstrap
  }
}
