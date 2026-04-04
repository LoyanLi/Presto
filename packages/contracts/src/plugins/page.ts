import type { PluginContext } from './context'

export interface PluginPageDefinition {
  pageId: string
  path: string
  title: string
  mount: 'workspace'
  componentExport: string
}

export interface PluginNavigationItem {
  itemId: string
  title: string
  pageId: string
  section: 'sidebar'
  order?: number
}

export interface PluginCommandDefinition {
  commandId: string
  title: string
  pageId?: string
}

export interface PluginAutomationBooleanOptionDefinition {
  optionId: string
  kind: 'boolean'
  label: string
  description?: string
  defaultValue?: boolean
}

export interface PluginAutomationSelectOptionDefinition {
  value: string
  label: string
}

export interface PluginAutomationSelectOptionFieldDefinition {
  optionId: string
  kind: 'select'
  label: string
  description?: string
  defaultValue?: string
  options: PluginAutomationSelectOptionDefinition[]
}

export type PluginAutomationOptionDefinition =
  | PluginAutomationBooleanOptionDefinition
  | PluginAutomationSelectOptionFieldDefinition

export interface PluginAutomationItemDefinition {
  itemId: string
  title: string
  automationType: string
  description?: string
  order?: number
  runnerExport: string
  optionsSchema?: PluginAutomationOptionDefinition[]
}

export interface PluginPageHost {
  pickFolder(): Promise<{
    canceled: boolean
    paths: string[]
  }>
}

export interface PluginPageProps {
  context: PluginContext
  host: PluginPageHost
  params: Record<string, string>
  searchParams: URLSearchParams
}
