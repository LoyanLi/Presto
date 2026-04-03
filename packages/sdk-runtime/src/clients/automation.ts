export interface AutomationDefinition {
  definitionId: string
  title: string
  description?: string
}

export interface AutomationRunDefinitionRequest {
  definitionId: string
  input?: Record<string, unknown>
}

export interface AutomationRunDefinitionStepResult {
  stepId: string
  ok: boolean
  message?: string
}

export interface AutomationRunDefinitionResult {
  ok: boolean
  runId?: string
  steps?: AutomationRunDefinitionStepResult[]
  error?: string
}

export interface AutomationRuntimeClient {
  listDefinitions(): Promise<AutomationDefinition[]>
  runDefinition(request: AutomationRunDefinitionRequest): Promise<AutomationRunDefinitionResult>
}
