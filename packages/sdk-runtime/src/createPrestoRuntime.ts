import type { AppRuntimeClient } from './clients/app'
import type { AutomationRuntimeClient } from './clients/automation'
import type { BackendRuntimeClient } from './clients/backend'
import type { DialogRuntimeClient } from './clients/dialog'
import type { FsRuntimeClient } from './clients/fs'
import type { MacAccessibilityRuntimeClient } from './clients/macAccessibility'
import type { MobileProgressRuntimeClient } from './clients/mobileProgress'
import type { ShellRuntimeClient } from './clients/shell'
import type { WindowRuntimeClient } from './clients/window'

export interface PrestoRuntime {
  app: AppRuntimeClient
  automation: AutomationRuntimeClient
  backend: BackendRuntimeClient
  dialog: DialogRuntimeClient
  shell: ShellRuntimeClient
  fs: FsRuntimeClient
  mobileProgress: MobileProgressRuntimeClient
  macAccessibility: MacAccessibilityRuntimeClient
  window: WindowRuntimeClient
}

export function createPrestoRuntime(runtime: PrestoRuntime): PrestoRuntime {
  return {
    app: runtime.app,
    automation: runtime.automation,
    backend: runtime.backend,
    dialog: runtime.dialog,
    shell: runtime.shell,
    fs: runtime.fs,
    mobileProgress: runtime.mobileProgress,
    macAccessibility: runtime.macAccessibility,
    window: runtime.window,
  }
}
