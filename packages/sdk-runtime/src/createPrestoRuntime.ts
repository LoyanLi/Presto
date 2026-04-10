import type { AppRuntimeClient } from './clients/app'
import type { BackendRuntimeClient } from './clients/backend'
import type { DialogRuntimeClient } from './clients/dialog'
import type { FsRuntimeClient } from './clients/fs'
import type { MacAccessibilityRuntimeClient } from './clients/macAccessibility'
import type { MobileProgressRuntimeClient } from './clients/mobileProgress'
import type { PluginRuntimeClient } from './clients/plugins'
import type { ShellRuntimeClient } from './clients/shell'
import type { WindowRuntimeClient } from './clients/window'

export interface PrestoRuntime {
  app: AppRuntimeClient
  backend: BackendRuntimeClient
  dialog: DialogRuntimeClient
  shell: ShellRuntimeClient
  fs: FsRuntimeClient
  plugins: PluginRuntimeClient
  mobileProgress: MobileProgressRuntimeClient
  macAccessibility: MacAccessibilityRuntimeClient
  window: WindowRuntimeClient
}

export function createPrestoRuntime(runtime: PrestoRuntime): PrestoRuntime {
  return {
    app: runtime.app,
    backend: runtime.backend,
    dialog: runtime.dialog,
    shell: runtime.shell,
    fs: runtime.fs,
    plugins: runtime.plugins,
    mobileProgress: runtime.mobileProgress,
    macAccessibility: runtime.macAccessibility,
    window: runtime.window,
  }
}
