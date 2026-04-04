import { createDesktopRuntimeBridge, type DesktopRuntimeInvoke } from '../../desktop/runtimeBridge'

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
  plugins: {
    list: 'plugins:list',
    installFromDirectory: 'plugins:install-directory',
    installFromZip: 'plugins:install-zip',
    setEnabled: 'plugins:set-enabled',
    uninstall: 'plugins:uninstall',
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

export function createRuntimeBridge(invoke: RuntimeBridgeInvoke) {
  const invokeOperation: DesktopRuntimeInvoke = (operation, ...args) => invoke(operation, ...args)
  return createDesktopRuntimeBridge(runtimeBridgeChannels, invokeOperation)
}
