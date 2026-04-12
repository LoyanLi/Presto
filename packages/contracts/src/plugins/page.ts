import type { PluginContext } from './context'

// `workspace` remains the canonical mount for existing workflow pages.
export type PluginPageMount = 'workspace' | 'tools'

export interface PluginPageDefinition {
  pageId: string
  path: string
  title: string
  mount: PluginPageMount
  componentExport: string
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

export interface PluginWorkflowPageHost {
  pickFolder(): Promise<{
    canceled: boolean
    paths: string[]
  }>
}

export interface PluginToolDialogHost {
  openFile(): Promise<{
    canceled: boolean
    paths: string[]
  }>
  openDirectory(): Promise<{
    canceled: boolean
    paths: string[]
  }>
}

export interface PluginToolFsHost {
  // Tool pages only receive the file operations we explicitly permit today.
  readFile(path: string): Promise<string | null>
  writeFile(path: string, content: string): Promise<boolean>
  exists(path: string): Promise<boolean>
  readdir(path: string): Promise<string[]>
  deleteFile(path: string): Promise<boolean>
}

export interface PluginToolShellHost {
  openPath(path: string): Promise<string>
}

export interface PluginToolPageHost {
  dialog: PluginToolDialogHost
  fs: PluginToolFsHost
  shell: PluginToolShellHost
}

export interface PluginWorkflowPageProps {
  context: PluginContext
  host: PluginWorkflowPageHost
  params: Record<string, string>
  searchParams: URLSearchParams
}

export interface PluginToolPageProps {
  context: PluginContext
  host: PluginToolPageHost
  params: Record<string, string>
  searchParams: URLSearchParams
}

export type PluginPageHost = PluginWorkflowPageHost
export type PluginPageProps = PluginWorkflowPageProps
