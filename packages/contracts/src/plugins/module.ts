import type { PluginContext } from './context'
import type { WorkflowPluginManifest } from './manifest'

export interface WorkflowPluginModule {
  manifest: WorkflowPluginManifest
  activate(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
