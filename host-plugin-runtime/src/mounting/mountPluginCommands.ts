import type { WorkflowPluginManifest } from '../../../packages/contracts/src/plugins'
import type { PluginCommandDefinition } from '../../../packages/contracts/src/plugins/page'

export interface MountedPluginCommand extends PluginCommandDefinition {
  kind: 'command'
  pluginId: string
}

export function mountPluginCommands(manifest: WorkflowPluginManifest): MountedPluginCommand[] {
  const commands = manifest.commands ?? []

  return commands.map((command) => ({
    kind: 'command',
    pluginId: manifest.pluginId,
    commandId: command.commandId,
    title: command.title,
    pageId: command.pageId,
  }))
}
