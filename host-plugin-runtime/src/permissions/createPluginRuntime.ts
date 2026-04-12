import type { PrestoClient } from '@presto/contracts/capabilities/clients'
import type { PluginContext } from '@presto/contracts/plugins/context'
import type { PluginLogger } from '@presto/contracts/plugins/logger'
import type { PluginStorage } from '@presto/contracts/plugins/storage'
import type { WorkflowPluginManifest } from '@presto/contracts/plugins/manifest'
import { guardCapabilityAccess, type PluginRunMetricsRecorder } from './guardCapabilityAccess'

interface PluginRuntimeDependencies {
  locale: PluginContext['locale']
  presto: PrestoClient
  storage: PluginStorage
  logger: PluginLogger
  metricsRecorder?: PluginRunMetricsRecorder
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
  const presto = guardCapabilityAccess(dependencies.presto, manifest, dependencies.metricsRecorder)
  const storage = createNamespacedStorage(dependencies.storage, manifest.pluginId)
  const logger = createPrefixedLogger(dependencies.logger, manifest.pluginId)

  return {
    pluginId: manifest.pluginId,
    locale: dependencies.locale,
    presto,
    storage,
    logger,
  }
}
