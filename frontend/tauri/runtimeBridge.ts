import { invoke } from '@tauri-apps/api/core'

import { createDesktopRuntimeBridge } from '../desktop/runtimeBridge'
import { createPrestoClient } from '@presto/sdk-core'
import { PRESTO_VERSION } from '@presto/contracts'
import type {
  CapabilityRequestEnvelope,
  CapabilityResponseEnvelope,
  PrestoClient,
  PrestoTransport,
} from '@presto/contracts'

const tauriRuntimeOperations = {
  app: {
    getVersion: 'app.version.get',
    checkForUpdates: 'app.release.check',
    viewLog: 'app.log.view',
  },
  backend: {
    getStatus: 'backend.status.get',
    listCapabilities: 'backend.capabilities.list',
    getDawAdapterSnapshot: 'backend.daw-adapter.snapshot.get',
    restart: 'backend.lifecycle.restart',
    setDawTarget: 'backend.daw-target.set',
    setDeveloperMode: 'backend.developer-mode.set',
    invokeCapability: 'backend.capability.invoke',
  },
  dialog: {
    open: 'dialog.folder.open',
  },
  shell: {
    openPath: 'shell.path.open',
    openExternal: 'shell.external.open',
  },
  fs: {
    readFile: 'fs.file.read',
    writeFile: 'fs.file.write',
    ensureDir: 'fs.dir.ensure',
    getHomePath: 'fs.home-path.get',
    exists: 'fs.path.exists',
    stat: 'fs.path.stat',
    readdir: 'fs.dir.read',
    mkdir: 'fs.dir.create',
    unlink: 'fs.file.unlink',
    rmdir: 'fs.dir.remove',
    deleteFile: 'fs.file.delete',
  },
  plugins: {
    list: 'plugins.catalog.list',
    installFromDirectory: 'plugins.install.directory',
    installFromZip: 'plugins.install.zip',
    setEnabled: 'plugins.set-enabled',
    uninstall: 'plugins.uninstall',
  },
  window: {
    toggleAlwaysOnTop: 'window.always-on-top.toggle',
    getAlwaysOnTop: 'window.always-on-top.get',
    setAlwaysOnTop: 'window.always-on-top.set',
  },
  mobileProgress: {
    createSession: 'mobile-progress.session.create',
    closeSession: 'mobile-progress.session.close',
    getViewUrl: 'mobile-progress.view-url.get',
    updateSession: 'mobile-progress.session.update',
  },
  macAccessibility: {
    preflight: 'mac-accessibility.preflight',
    runScript: 'mac-accessibility.script.run',
    runFile: 'mac-accessibility.file.run',
  },
} as const

export function createTauriRuntimeBridge() {
  return createDesktopRuntimeBridge(tauriRuntimeOperations, (operation, ...args) =>
    invoke('runtime_invoke', { operation, args }),
  )
}

export function createTauriPrestoClient(): PrestoClient {
  const transport: PrestoTransport = Object.freeze({
    invoke<TRequest, TResponse>(
      request: CapabilityRequestEnvelope<TRequest>,
    ): Promise<CapabilityResponseEnvelope<TResponse>> {
      return invoke('runtime_invoke', {
        operation: tauriRuntimeOperations.backend.invokeCapability,
        args: [request],
      }) as Promise<CapabilityResponseEnvelope<TResponse>>
    },
  })

  return createPrestoClient({
    transport,
    clientName: 'tauri-renderer',
    clientVersion: PRESTO_VERSION,
  })
}
