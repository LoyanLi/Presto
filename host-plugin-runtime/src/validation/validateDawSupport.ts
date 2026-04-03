import type { DawTarget, WorkflowPluginManifest } from '@presto/contracts'

export interface DawSupportValidationIssue {
  field: string
  reason: string
}

export interface DawSupportValidationResult {
  ok: boolean
  issues: DawSupportValidationIssue[]
}

export interface ValidateDawSupportInput {
  manifest: WorkflowPluginManifest
  currentDaw: DawTarget
}

export function validateDawSupport(input: ValidateDawSupportInput): DawSupportValidationResult {
  if (input.manifest.supportedDaws.includes(input.currentDaw)) {
    return { ok: true, issues: [] }
  }

  return {
    ok: false,
    issues: [
      {
        field: 'supportedDaws',
        reason: `current_daw_not_supported:${input.currentDaw}`,
      },
    ],
  }
}
