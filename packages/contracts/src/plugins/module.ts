import type { PluginContext } from './context'
import type { WorkflowPluginManifest } from './manifest'

export type PluginAutomationStepStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface PluginAutomationStepResult {
  id: string
  status: PluginAutomationStepStatus
  message?: string
}

export interface PluginAutomationRunResult {
  steps?: PluginAutomationStepResult[]
  summary?: string
}

export interface PluginAutomationMacAccessibility {
  preflight(): Promise<{ ok: boolean; trusted: boolean; error?: string }>
  runScript(script: string, args?: string[]): Promise<{
    ok: boolean
    stdout: string
    stderr?: string
    error?: { code: string; message: string; details?: Record<string, unknown> }
  }>
  runFile(path: string, args?: string[]): Promise<{
    ok: boolean
    stdout: string
    stderr?: string
    error?: { code: string; message: string; details?: Record<string, unknown> }
  }>
}

export interface PluginAutomationRunnerContext extends PluginContext {
  macAccessibility: PluginAutomationMacAccessibility
}

export type PluginAutomationRunner = (
  context: PluginAutomationRunnerContext,
  input: Record<string, unknown>,
) => Promise<PluginAutomationRunResult> | PluginAutomationRunResult

export interface WorkflowPluginModule {
  manifest: WorkflowPluginManifest
  activate(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
