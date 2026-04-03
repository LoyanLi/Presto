import type { WorkflowPluginManifest } from '@presto/contracts/plugins'
import type { PluginNavigationItem } from '@presto/contracts/plugins/page'

export interface MountedPluginNavigationItem extends PluginNavigationItem {
  kind: 'navigation'
  pluginId: string
}

export function mountPluginNavigation(manifest: WorkflowPluginManifest): MountedPluginNavigationItem[] {
  const navigationItems = manifest.navigationItems ?? []

  return navigationItems.filter((item) => item.section === 'sidebar').map((item) => ({
    kind: 'navigation',
    pluginId: manifest.pluginId,
    itemId: item.itemId,
    title: item.title,
    pageId: item.pageId,
    section: item.section,
    order: item.order,
  }))
}
