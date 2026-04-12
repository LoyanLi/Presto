import type { PublicCapabilityId } from '../capabilities/ids'
import type { DawTarget } from '../daw/targets'
import type {
  PluginPageDefinition,
  PluginAutomationItemDefinition,
} from './page'
import type { WorkflowSettingsPageDefinition } from './settings'
import type { WorkflowDefinitionReference } from './workflow'

export type PluginExtensionType = 'workflow' | 'automation' | 'tool'

export interface PluginAdapterModuleRequirement {
  moduleId: string
  minVersion: string
}

export interface PluginCapabilityRequirement {
  capabilityId: PublicCapabilityId
  minVersion: string
}

export interface PluginToolDefinition {
  toolId: string
  pageId: string
  title: string
  description?: string
  order?: number
  runnerExport: string
}

export const PLUGIN_TOOL_RUNTIME_PERMISSIONS = [
  'dialog.openFile',
  'dialog.openDirectory',
  'fs.read',
  'fs.write',
  'fs.list',
  'fs.delete',
  'shell.openPath',
  'process.execBundled',
] as const

export type PluginToolRuntimePermission = (typeof PLUGIN_TOOL_RUNTIME_PERMISSIONS)[number]

export type PluginBundledResourceKind = 'script' | 'binary'

export interface PluginBundledResourceDefinition {
  resourceId: string
  kind: PluginBundledResourceKind
  relativePath: string
}

export interface PluginManifest {
  pluginId: string
  extensionType: PluginExtensionType
  version: string
  hostApiVersion: string
  supportedDaws: DawTarget[]
  uiRuntime: 'react18'
  displayName: string
  description?: string
  entry: string
  styleEntry?: string
  pages: PluginPageDefinition[]
  automationItems?: PluginAutomationItemDefinition[]
  tools?: PluginToolDefinition[]
  adapterModuleRequirements?: PluginAdapterModuleRequirement[]
  capabilityRequirements?: PluginCapabilityRequirement[]
  settingsPages?: WorkflowSettingsPageDefinition[]
  workflowDefinition?: WorkflowDefinitionReference
  toolRuntimePermissions?: PluginToolRuntimePermission[]
  bundledResources?: PluginBundledResourceDefinition[]
  requiredCapabilities: PublicCapabilityId[]
}

export type WorkflowPluginManifest = PluginManifest
