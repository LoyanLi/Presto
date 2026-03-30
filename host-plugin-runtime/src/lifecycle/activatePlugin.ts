import type { PluginContext, WorkflowPluginManifest, WorkflowPluginModule } from '../../../packages/contracts/src'

export interface PluginActivationIssue {
  pluginId: string
  reason: string
}

export interface PluginActivationResult {
  ok: boolean
  pluginId: string
  manifest: WorkflowPluginManifest
  issue?: PluginActivationIssue
}

export interface ActivatePluginInput {
  module: WorkflowPluginModule
  context: PluginContext
}

export async function activatePlugin(input: ActivatePluginInput): Promise<PluginActivationResult> {
  const manifest = input.module.manifest

  try {
    await input.module.activate(input.context)

    return {
      ok: true,
      pluginId: manifest.pluginId,
      manifest,
    }
  } catch (error) {
    return {
      ok: false,
      pluginId: manifest.pluginId,
      manifest,
      issue: {
        pluginId: manifest.pluginId,
        reason: error instanceof Error ? error.message : 'plugin_activation_failed',
      },
    }
  }
}
