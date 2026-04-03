export { discoverPlugins } from './discovery/discoverPlugins'

export { validateManifest } from './validation/validateManifest'
export { validatePermissions } from './validation/validatePermissions'
export { validateDawSupport } from './validation/validateDawSupport'

export { loadPluginModule } from './loading/loadPluginModule'

export { activatePlugin } from './lifecycle/activatePlugin'
export { deactivatePlugin } from './lifecycle/deactivatePlugin'

export { mountPluginPages } from './mounting/mountPluginPages'
export { mountPluginNavigation } from './mounting/mountPluginNavigation'
export { mountPluginCommands } from './mounting/mountPluginCommands'

export {
  discoverInstalledPlugins,
  installPluginFromDirectory,
  installPluginFromZip,
} from './installation/pluginManagement'

export { createPluginRuntime } from './permissions/createPluginRuntime'
export { guardCapabilityAccess } from './permissions/guardCapabilityAccess'
