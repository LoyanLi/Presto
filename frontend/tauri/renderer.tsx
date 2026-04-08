import { renderHostShellApp } from '../desktop/renderHostShellApp'
import { createTauriPrestoClient, createTauriRuntimeBridge } from './runtimeBridge'

renderHostShellApp({
  client: createTauriPrestoClient(),
  runtime: createTauriRuntimeBridge(),
})
