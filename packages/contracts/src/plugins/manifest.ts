import type { PublicCapabilityId } from '../capabilities/ids'
import type { DawTarget } from '../daw/targets'
import type {
  PluginPageDefinition,
  PluginNavigationItem,
  PluginCommandDefinition,
  PluginAutomationItemDefinition,
} from './page'
import type { WorkflowSettingsPageDefinition } from './settings'
import type { WorkflowDefinitionReference } from './workflow'

export interface PluginAdapterModuleRequirement {
  moduleId: string
  minVersion: string
}

export interface PluginCapabilityRequirement {
  capabilityId: PublicCapabilityId
  minVersion: string
}

export interface WorkflowPluginManifest {
  pluginId: string
  extensionType: 'workflow' | 'automation'
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
  adapterModuleRequirements?: PluginAdapterModuleRequirement[]
  capabilityRequirements?: PluginCapabilityRequirement[]
  settingsPages?: WorkflowSettingsPageDefinition[]
  navigationItems?: PluginNavigationItem[]
  commands?: PluginCommandDefinition[]
  workflowDefinition?: WorkflowDefinitionReference
  requiredCapabilities: PublicCapabilityId[]
}
