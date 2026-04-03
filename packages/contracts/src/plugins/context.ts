import type { PrestoClient } from '../capabilities/clients'
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
  storage: PluginStorage
  logger: PluginLogger
}
