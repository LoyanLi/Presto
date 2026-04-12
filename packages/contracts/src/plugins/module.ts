import type { PluginContext } from './context'
import type { PluginManifest } from './manifest'
import type { PluginToolDialogHost, PluginToolFsHost, PluginToolShellHost } from './page'

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

export interface PluginToolBundledProcessHost {
  execBundled(
    resourceId: string,
    args?: string[],
    options?: {
      cwd?: string
      env?: Record<string, string>
    },
  ): Promise<{
    ok: boolean
    exitCode: number
    stdout: string
    stderr?: string
    error?: { code: string; message: string; details?: Record<string, unknown> }
  }>
}

export interface PluginToolRunnerContext extends PluginContext {
  dialog: PluginToolDialogHost
  fs: PluginToolFsHost
  shell: PluginToolShellHost
  process: PluginToolBundledProcessHost
}

export interface PluginToolRunResult {
  // Progress is reported through the surrounding job wrapper rather than the runner return payload.
  summary?: string
  result?: unknown
}

export type PluginToolRunner = (
  context: PluginToolRunnerContext,
  input: Record<string, unknown>,
) => Promise<PluginToolRunResult> | PluginToolRunResult

export interface PluginModule {
  manifest: PluginManifest
  activate(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}

export type WorkflowPluginModule = PluginModule
