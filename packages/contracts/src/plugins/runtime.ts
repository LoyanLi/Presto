export interface AutomationDefinition {
  id: string
  title: string
  app: string
  description?: string
}

export interface AutomationRunDefinitionRequest {
  definitionId: string
  input?: Record<string, unknown>
}

export interface AutomationRunDefinitionStepResult {
  id: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  message?: string
}

export interface AutomationRunDefinitionResult {
  ok: boolean
  steps: AutomationRunDefinitionStepResult[]
  output?: Record<string, unknown>
  error?: {
    code: string
    message: string
    stepId?: string
    details?: Record<string, unknown>
  }
}

export type PluginRuntimeServiceName =
  | 'dialog.openFolder'
  | 'automation.listDefinitions'
  | 'automation.runDefinition'
  | 'shell.openPath'
  | 'shell.openExternal'
  | 'fs.readFile'
  | 'fs.getHomePath'
  | 'fs.writeFile'
  | 'fs.ensureDir'
  | 'fs.readdir'
  | 'fs.stat'
  | 'mobileProgress.createSession'
  | 'mobileProgress.closeSession'
  | 'mobileProgress.getViewUrl'
  | 'mobileProgress.updateSession'
  | 'macAccessibility.preflight'
  | 'macAccessibility.runScript'
  | 'macAccessibility.runFile'

export interface PluginRuntime {
  dialog?: {
    openFolder(): Promise<{ canceled: boolean; paths: string[] }>
  }
  automation?: {
    listDefinitions(): Promise<AutomationDefinition[]>
    runDefinition(request: AutomationRunDefinitionRequest): Promise<AutomationRunDefinitionResult>
  }
  shell?: {
    openPath(path: string): Promise<string>
    openExternal(url: string): Promise<boolean>
  }
  fs?: {
    readFile(path: string): Promise<string | null>
    getHomePath(): Promise<string>
    writeFile(path: string, content: string): Promise<boolean>
    ensureDir(path: string): Promise<boolean>
    readdir(path: string): Promise<string[]>
    stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean } | null>
  }
  mobileProgress?: {
    createSession(taskId: string): Promise<{ ok: boolean; sessionId?: string; url?: string; qrSvg?: string; error?: string }>
    closeSession(sessionId: string): Promise<{ ok: boolean }>
    getViewUrl(sessionId: string): Promise<{ ok: boolean; sessionId?: string; url?: string; qrSvg?: string; error?: string }>
    updateSession(sessionId: string, payload: unknown): Promise<{ ok: boolean; sessionId?: string; updatedAt?: string; error?: string }>
  }
  macAccessibility?: {
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
}
