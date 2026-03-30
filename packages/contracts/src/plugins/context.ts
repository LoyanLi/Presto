import type { PrestoClient } from '../capabilities/clients'
import type { PluginRuntime } from './runtime'
import type { PluginStorage } from './storage'
import type { PluginLogger } from './logger'

export type PluginLocale = 'en' | 'zh-CN'
export type PluginLocalePreference = 'system' | PluginLocale

export interface PluginLocaleContext {
  requested: PluginLocalePreference
  resolved: PluginLocale
}

export interface PluginContext {
  pluginId: string
  locale: PluginLocaleContext
  presto: PrestoClient
  runtime: PluginRuntime
  storage: PluginStorage
  logger: PluginLogger
}
