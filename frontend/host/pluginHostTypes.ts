import type { ReactElement } from 'react'
import type {
  DawTarget,
  PluginAutomationOptionDefinition,
  PluginAutomationRunResult,
  PluginAdapterModuleRequirement,
  PluginCapabilityRequirement,
  WorkflowSettingsSectionDefinition,
} from '@presto/contracts'

export type HostPluginOrigin = 'official' | 'installed'
export type HostPluginStatus = 'ready' | 'error' | 'disabled'
export type HostExtensionType = 'workflow' | 'automation' | 'tool'

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
  optionsSchema: PluginAutomationOptionDefinition[]
  execute(input: Record<string, unknown>): Promise<PluginAutomationRunResult>
}

export interface HostWorkspacePageRoute {
  pluginId: string
  pageId: string
}

export interface HostToolPageRoute {
  pluginId: string
  pageId: string
}

export type HostBuiltinSettingsPageId =
  | 'general'
  | 'daw'
  | 'permissions'
  | 'updates'
  | 'diagnostics'
  | 'workflowExtensions'
  | 'automationExtensions'
  | 'toolExtensions'

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
  mount: 'workspace' | 'tools'
  render(): ReactElement
}

export interface HostToolEntry {
  pluginId: string
  pageId: string
  title: string
  description: string
  actionLabel: string
}

export interface HostPluginRecord {
  pluginId: string
  extensionType: HostExtensionType
  displayName: string
  version: string
  origin: HostPluginOrigin
  status: HostPluginStatus
  enabled: boolean
  description?: string
  pluginRoot?: string
  loadable?: boolean
  supportedDaws?: DawTarget[]
  requiredCapabilities?: string[]
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
