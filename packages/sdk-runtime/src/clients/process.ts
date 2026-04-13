export interface ProcessExecBundledOptions {
  cwd?: string
  env?: Record<string, string>
}

export interface ProcessExecBundledResult {
  ok: boolean
  exitCode: number
  stdout: string
  stderr?: string
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface ProcessRuntimeClient {
  execBundled(
    pluginId: string,
    resourceId: string,
    args?: string[],
    options?: ProcessExecBundledOptions,
  ): Promise<ProcessExecBundledResult>
}
