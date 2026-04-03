import { invoke } from '@tauri-apps/api/core'
import { renderHostShellApp } from '../desktop/renderHostShellApp'
import { createTauriPrestoClient, createTauriRuntimeBridge } from './runtimeBridge'

renderHostShellApp({
  client: createTauriPrestoClient(),
  runtime: createTauriRuntimeBridge(),
  onReady: () => {
    void invoke('app_ready')
  },
})
