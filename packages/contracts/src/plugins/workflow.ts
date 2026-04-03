import type { PublicCapabilityId } from '../capabilities/ids'

export interface WorkflowDefinitionReference {
  workflowId: string
  inputSchemaId: string
  definitionEntry: string
}

export interface WorkflowRefValue {
  $ref: string
}

export interface WorkflowForeachDefinition {
  items: WorkflowRefValue
  as: string
}

export interface WorkflowConditionDefinition {
  $ref: string
  equals: string | number | boolean | null
}

export interface WorkflowStepDefinition {
  stepId: string
  usesCapability: PublicCapabilityId
  input: Record<string, unknown>
  saveAs?: string
  awaitJob?: boolean
  when?: WorkflowConditionDefinition
  foreach?: WorkflowForeachDefinition
  steps?: WorkflowStepDefinition[]
}

export interface WorkflowDefinition {
  workflowId: string
  version: string
  inputSchemaId: string
  steps: WorkflowStepDefinition[]
}
