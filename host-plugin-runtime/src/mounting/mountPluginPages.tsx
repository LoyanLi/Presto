import type { WorkflowPluginManifest } from '../../../packages/contracts/src/plugins'
import type { PluginPageDefinition } from '../../../packages/contracts/src/plugins/page'

export interface MountedPluginPage extends PluginPageDefinition {
  kind: 'page'
  pluginId: string
}

export function mountPluginPages(manifest: WorkflowPluginManifest): MountedPluginPage[] {
  return manifest.pages.filter((page) => page.mount === 'workspace').map((page) => ({
    kind: 'page',
    pluginId: manifest.pluginId,
    pageId: page.pageId,
    path: page.path,
    title: page.title,
    mount: page.mount,
    componentExport: page.componentExport,
  }))
}
