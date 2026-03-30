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

export interface PluginAutomationItemDefinition {
  itemId: string
  title: string
  automationType: string
  description?: string
  order?: number
}

export interface PluginPageProps {
  context: PluginContext
  params: Record<string, string>
  searchParams: URLSearchParams
}
