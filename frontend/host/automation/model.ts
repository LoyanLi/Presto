import type { PluginAutomationRunResult, PluginAutomationStepStatus } from '@presto/contracts'

export type AutomationStepState = {
  id: string
  status: PluginAutomationStepStatus
  message?: string
}

export interface AutomationRunState extends PluginAutomationRunResult {
  error?: string
}
