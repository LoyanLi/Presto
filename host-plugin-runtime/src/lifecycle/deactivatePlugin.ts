import type { WorkflowPluginManifest, WorkflowPluginModule } from '../../../packages/contracts/src'

export interface PluginDeactivationIssue {
  pluginId: string
  reason: string
}

export interface PluginDeactivationResult {
  ok: boolean
  pluginId: string
  manifest: WorkflowPluginManifest
  issue?: PluginDeactivationIssue
}

export interface DeactivatePluginInput {
  module: WorkflowPluginModule
}

export async function deactivatePlugin(input: DeactivatePluginInput): Promise<PluginDeactivationResult> {
  const manifest = input.module.manifest

  if (typeof input.module.deactivate !== 'function') {
    return {
      ok: true,
      pluginId: manifest.pluginId,
      manifest,
    }
  }

  try {
    await input.module.deactivate()

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
        reason: error instanceof Error ? error.message : 'plugin_deactivation_failed',
      },
    }
  }
}
