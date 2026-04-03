import type { ReactElement } from 'react'
import type {
  DawTarget,
  PluginAdapterModuleRequirement,
  PluginCapabilityRequirement,
  WorkflowSettingsSectionDefinition,
} from '@presto/contracts'

export type HostPluginOrigin = 'official' | 'installed'
export type HostPluginStatus = 'ready' | 'error'
export type HostExtensionType = 'workflow' | 'automation'

export interface HostPluginHomeEntry {
  pluginId: string
  pageId: string
  title: string
  description: string
  actionLabel: string
}

export interface HostAutomationEntry {
  pluginId: string
  itemId: string
  title: string
  description?: string
  automationType: string
  order?: number
}

export interface HostWorkspacePageRoute {
  pluginId: string
  pageId: string
}

export type HostBuiltinSettingsPageId =
  | 'general'
  | 'workflowExtensions'
  | 'automationExtensions'

export interface HostBuiltinSettingsPageRoute {
  kind: 'builtin'
  pageId: HostBuiltinSettingsPageId
}

export interface HostPluginSettingsPageRoute {
  kind: 'plugin'
  pluginId: string
  pageId: string
}

export type HostSettingsPageRoute = HostBuiltinSettingsPageRoute | HostPluginSettingsPageRoute

export interface HostPluginSettingsEntry {
  pluginId: string
  extensionType: HostExtensionType
  pageId: string
  title: string
  order?: number
  storageKey: string
  defaults: Record<string, unknown>
  sections: WorkflowSettingsSectionDefinition[]
  load(): Promise<Record<string, unknown>>
  save(nextValue: Record<string, unknown>): Promise<Record<string, unknown>>
}

export interface HostRenderedPluginPage {
  pluginId: string
  pageId: string
  title: string
  mount: 'workspace'
  render(): ReactElement
}

export interface HostPluginRecord {
  pluginId: string
  extensionType: HostExtensionType
  displayName: string
  version: string
  origin: HostPluginOrigin
  status: HostPluginStatus
  description?: string
  pluginRoot?: string
  loadable?: boolean
  supportedDaws?: DawTarget[]
  adapterModuleRequirements?: PluginAdapterModuleRequirement[]
  capabilityRequirements?: PluginCapabilityRequirement[]
}

export interface HostPluginIssue {
  scope: string
  message: string
  reason?: string
  pluginRoot?: string
}

export interface HostPluginManagerModel {
  managedRoot: string | null
  plugins: HostPluginRecord[]
  issues: HostPluginIssue[]
  settingsEntries?: HostPluginSettingsEntry[]
  isBusy?: boolean
  statusMessage?: string | null
}
