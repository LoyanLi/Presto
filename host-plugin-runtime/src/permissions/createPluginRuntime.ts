import type { PrestoClient } from '../../../packages/contracts/src/capabilities/clients'
import type { PluginContext } from '../../../packages/contracts/src/plugins/context'
import type { PluginLogger } from '../../../packages/contracts/src/plugins/logger'
import type { PluginRuntime } from '../../../packages/contracts/src/plugins/runtime'
import type { PluginStorage } from '../../../packages/contracts/src/plugins/storage'
import type { WorkflowPluginManifest } from '../../../packages/contracts/src/plugins/manifest'
import { guardCapabilityAccess } from './guardCapabilityAccess'
import { guardRuntimeAccess } from './guardRuntimeAccess'

interface PluginRuntimeDependencies {
  locale: PluginContext['locale']
  presto: PrestoClient
  runtime: PluginRuntime
  storage: PluginStorage
  logger: PluginLogger
}

function namespaceStorageKey(pluginId: string, key: string): string {
  return `plugin:${encodeURIComponent(pluginId)}::${key}`
}

function createNamespacedStorage(storage: PluginStorage, pluginId: string): PluginStorage {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      return storage.get<T>(namespaceStorageKey(pluginId, key))
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      return storage.set<T>(namespaceStorageKey(pluginId, key), value)
    },
    async delete(key: string): Promise<void> {
      return storage.delete(namespaceStorageKey(pluginId, key))
    },
  }
}

function createPrefixedLogger(logger: PluginLogger, pluginId: string): PluginLogger {
  const withPluginId = (message: string, meta?: Record<string, unknown>): [string, Record<string, unknown> | undefined] => [
    `[${pluginId}] ${message}`,
    {
      ...(meta ?? {}),
      pluginId,
    },
  ]

  return {
    debug(message: string, meta?: Record<string, unknown>): void {
      const [prefixedMessage, prefixedMeta] = withPluginId(message, meta)
      logger.debug(prefixedMessage, prefixedMeta)
    },
    info(message: string, meta?: Record<string, unknown>): void {
      const [prefixedMessage, prefixedMeta] = withPluginId(message, meta)
      logger.info(prefixedMessage, prefixedMeta)
    },
    warn(message: string, meta?: Record<string, unknown>): void {
      const [prefixedMessage, prefixedMeta] = withPluginId(message, meta)
      logger.warn(prefixedMessage, prefixedMeta)
    },
    error(message: string, meta?: Record<string, unknown>): void {
      const [prefixedMessage, prefixedMeta] = withPluginId(message, meta)
      logger.error(prefixedMessage, prefixedMeta)
    },
  }
}

export function createPluginRuntime(
  manifest: WorkflowPluginManifest,
  dependencies: PluginRuntimeDependencies,
): PluginContext {
  const presto = guardCapabilityAccess(dependencies.presto, manifest)
  const runtime = guardRuntimeAccess(dependencies.runtime, manifest)
  const storage = createNamespacedStorage(dependencies.storage, manifest.pluginId)
  const logger = createPrefixedLogger(dependencies.logger, manifest.pluginId)

  return {
    pluginId: manifest.pluginId,
    locale: dependencies.locale,
    presto,
    runtime,
    storage,
    logger,
  }
}
