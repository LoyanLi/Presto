import type { PluginRuntime, PluginRuntimeServiceName } from '../../../packages/contracts/src/plugins/runtime'
import type { WorkflowPluginManifest } from '../../../packages/contracts/src/plugins/manifest'

class PluginPermissionError extends Error {
  readonly code = 'PLUGIN_PERMISSION_DENIED'
  readonly pluginId: string
  readonly resource: string

  constructor(pluginId: string, resource: string, message: string) {
    super(message)
    this.name = 'PluginPermissionError'
    this.pluginId = pluginId
    this.resource = resource
  }
}

type ManifestPermissionShape = Pick<WorkflowPluginManifest, 'pluginId' | 'requiredRuntimeServices'>

function createPermissionError(pluginId: string, resource: string): PluginPermissionError {
  return new PluginPermissionError(
    pluginId,
    resource,
    `Plugin "${pluginId}" is not allowed to access ${resource}.`,
  )
}

function createRuntimeGuard<Args extends unknown[], Result>(
  allowedRuntimeServices: ReadonlySet<PluginRuntimeServiceName>,
  pluginId: string,
  serviceName: PluginRuntimeServiceName,
  action: string,
  invoke: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    if (!allowedRuntimeServices.has(serviceName)) {
      throw createPermissionError(pluginId, action)
    }

    return invoke(...args)
  }
}

function requireService<T>(service: T | undefined, pluginId: string, serviceName: string): T {
  if (service === undefined || service === null) {
    throw new PluginPermissionError(
      pluginId,
      serviceName,
      `Plugin "${pluginId}" requires ${serviceName}, but the host did not provide it.`,
    )
  }

  return service
}

function isRuntimeServiceAllowed(
  allowedRuntimeServices: ReadonlySet<PluginRuntimeServiceName>,
  serviceName: PluginRuntimeServiceName,
): boolean {
  return allowedRuntimeServices.has(serviceName)
}

export function guardRuntimeAccess(runtime: PluginRuntime, manifest: ManifestPermissionShape): PluginRuntime {
  const allowedRuntimeServices = new Set<PluginRuntimeServiceName>(manifest.requiredRuntimeServices ?? [])
  const pluginId = manifest.pluginId

  const guardedRuntime: PluginRuntime = {}

  if (isRuntimeServiceAllowed(allowedRuntimeServices, 'dialog.openFolder')) {
    const dialogRuntime = requireService(runtime.dialog, pluginId, 'presto.runtime.dialog')
    guardedRuntime.dialog = {
      openFolder: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'dialog.openFolder',
        'presto.runtime.dialog.openFolder()',
        () => dialogRuntime.openFolder(),
      ),
    }
  }

  if (
    isRuntimeServiceAllowed(allowedRuntimeServices, 'automation.listDefinitions') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'automation.runDefinition')
  ) {
    const automationRuntime = requireService(runtime.automation, pluginId, 'presto.runtime.automation')
    guardedRuntime.automation = {
      listDefinitions: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'automation.listDefinitions',
        'presto.runtime.automation.listDefinitions()',
        () => automationRuntime.listDefinitions(),
      ),
      runDefinition: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'automation.runDefinition',
        'presto.runtime.automation.runDefinition()',
        (request) => automationRuntime.runDefinition(request),
      ),
    }
  }

  if (
    isRuntimeServiceAllowed(allowedRuntimeServices, 'shell.openPath') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'shell.openExternal')
  ) {
    const shellRuntime = requireService(runtime.shell, pluginId, 'presto.runtime.shell')
    guardedRuntime.shell = {
      openPath: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'shell.openPath',
        'presto.runtime.shell.openPath()',
        (path: string) => shellRuntime.openPath(path),
      ),
      openExternal: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'shell.openExternal',
        'presto.runtime.shell.openExternal()',
        (url: string) => shellRuntime.openExternal(url),
      ),
    }
  }

  if (
    isRuntimeServiceAllowed(allowedRuntimeServices, 'fs.readFile') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'fs.getHomePath') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'fs.writeFile') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'fs.ensureDir') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'fs.readdir') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'fs.stat')
  ) {
    const fsRuntime = requireService(runtime.fs, pluginId, 'presto.runtime.fs')
    guardedRuntime.fs = {
      readFile: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'fs.readFile',
        'presto.runtime.fs.readFile()',
        (path: string) => fsRuntime.readFile(path),
      ),
      writeFile: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'fs.writeFile',
        'presto.runtime.fs.writeFile()',
        (path: string, content: string) => fsRuntime.writeFile(path, content),
      ),
      ensureDir: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'fs.ensureDir',
        'presto.runtime.fs.ensureDir()',
        (path: string) => fsRuntime.ensureDir(path),
      ),
      readdir: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'fs.readdir',
        'presto.runtime.fs.readdir()',
        (path: string) => fsRuntime.readdir(path),
      ),
      stat: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'fs.stat',
        'presto.runtime.fs.stat()',
        (path: string) => fsRuntime.stat(path),
      ),
      getHomePath: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'fs.getHomePath',
        'presto.runtime.fs.getHomePath()',
        () => fsRuntime.getHomePath(),
      ),
    }
  }

  if (
    isRuntimeServiceAllowed(allowedRuntimeServices, 'mobileProgress.createSession') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'mobileProgress.closeSession') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'mobileProgress.getViewUrl') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'mobileProgress.updateSession')
  ) {
    const mobileProgressRuntime = requireService(runtime.mobileProgress, pluginId, 'presto.runtime.mobileProgress')
    guardedRuntime.mobileProgress = {
      createSession: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'mobileProgress.createSession',
        'presto.runtime.mobileProgress.createSession()',
        (taskId: string) => mobileProgressRuntime.createSession(taskId),
      ),
      closeSession: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'mobileProgress.closeSession',
        'presto.runtime.mobileProgress.closeSession()',
        (sessionId: string) => mobileProgressRuntime.closeSession(sessionId),
      ),
      getViewUrl: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'mobileProgress.getViewUrl',
        'presto.runtime.mobileProgress.getViewUrl()',
        (sessionId: string) => mobileProgressRuntime.getViewUrl(sessionId),
      ),
      updateSession: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'mobileProgress.updateSession',
        'presto.runtime.mobileProgress.updateSession()',
        (sessionId: string, payload: unknown) => mobileProgressRuntime.updateSession(sessionId, payload),
      ),
    }
  }

  if (
    isRuntimeServiceAllowed(allowedRuntimeServices, 'macAccessibility.preflight') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'macAccessibility.runScript') ||
    isRuntimeServiceAllowed(allowedRuntimeServices, 'macAccessibility.runFile')
  ) {
    const macAccessibilityRuntime = requireService(
      runtime.macAccessibility,
      pluginId,
      'presto.runtime.macAccessibility',
    )
    guardedRuntime.macAccessibility = {
      preflight: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'macAccessibility.preflight',
        'presto.runtime.macAccessibility.preflight()',
        () => macAccessibilityRuntime.preflight(),
      ),
      runScript: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'macAccessibility.runScript',
        'presto.runtime.macAccessibility.runScript()',
        (script: string, args?: string[]) => macAccessibilityRuntime.runScript(script, args),
      ),
      runFile: createRuntimeGuard(
        allowedRuntimeServices,
        pluginId,
        'macAccessibility.runFile',
        'presto.runtime.macAccessibility.runFile()',
        (path: string, args?: string[]) => macAccessibilityRuntime.runFile(path, args),
      ),
    }
  }

  return guardedRuntime
}
