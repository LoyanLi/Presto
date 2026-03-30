export interface MacAccessibilityStructuredError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface MacAccessibilityPreflightResult {
  ok: boolean
  trusted: boolean
  error?: string
}

export interface MacAccessibilityRunResult {
  ok: boolean
  stdout: string
  stderr?: string
  error?: MacAccessibilityStructuredError
}

export interface MacAccessibilityRuntimeClient {
  preflight(): Promise<MacAccessibilityPreflightResult>
  runScript(script: string, args?: string[]): Promise<MacAccessibilityRunResult>
  runFile(path: string, args?: string[]): Promise<MacAccessibilityRunResult>
}
