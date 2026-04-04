import type { WorkflowPluginManifest } from '@presto/contracts'

export interface PluginRuntimeIssue {
  category: string
  reason: string
  pluginRoot?: string
  manifestPath?: string
}

export interface PluginRuntimePluginRecord {
  pluginId: string
  displayName: string
  version: string
  pluginRoot: string
  entryPath: string
  manifest: WorkflowPluginManifest
  settingsPages?: NonNullable<WorkflowPluginManifest['settingsPages']>
  loadable: boolean
  enabled: boolean
}

export interface PluginRuntimeListResult {
  managedPluginsRoot: string
  plugins: PluginRuntimePluginRecord[]
  issues: PluginRuntimeIssue[]
}

export interface PluginRuntimeInstallResult {
  ok: boolean
  cancelled?: boolean
  managedPluginsRoot: string
  plugin?: PluginRuntimePluginRecord
  issues: PluginRuntimeIssue[]
}

export interface PluginRuntimeUninstallResult {
  ok: boolean
  managedPluginsRoot: string
  pluginId: string
  issues: PluginRuntimeIssue[]
}

export interface PluginRuntimeSetEnabledResult {
  ok: boolean
  managedPluginsRoot: string
  pluginId: string
  enabled: boolean
  issues: PluginRuntimeIssue[]
}

export interface PluginRuntimeClient {
  list(): Promise<PluginRuntimeListResult>
  installFromDirectory(overwrite?: boolean): Promise<PluginRuntimeInstallResult>
  installFromZip(overwrite?: boolean): Promise<PluginRuntimeInstallResult>
  setEnabled(pluginId: string, enabled: boolean): Promise<PluginRuntimeSetEnabledResult>
  uninstall(pluginId: string): Promise<PluginRuntimeUninstallResult>
}
