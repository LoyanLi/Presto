import type { PublicCapabilityId, WorkflowPluginManifest } from '@presto/contracts'

export interface PermissionValidationIssue {
  field: string
  reason: string
}

export interface PermissionValidationResult {
  ok: boolean
  issues: PermissionValidationIssue[]
}

export interface ValidatePermissionsInput {
  manifest: WorkflowPluginManifest
  allowedCapabilities: readonly PublicCapabilityId[]
}

const hasDuplicate = (values: readonly string[], value: string): boolean => values.filter((item) => item === value).length > 1

export function validatePermissions(input: ValidatePermissionsInput): PermissionValidationResult {
  const issues: PermissionValidationIssue[] = []
  const allowedCapabilities = new Set(input.allowedCapabilities)

  for (const capability of input.manifest.requiredCapabilities) {
    if (!allowedCapabilities.has(capability)) {
      issues.push({ field: 'requiredCapabilities', reason: `unsupported_capability:${capability}` })
    }

    if (hasDuplicate(input.manifest.requiredCapabilities, capability)) {
      issues.push({ field: 'requiredCapabilities', reason: `duplicate_value:${capability}` })
      break
    }
  }

  if (input.manifest.requiredRuntimeServices !== undefined) {
    issues.push({ field: 'requiredRuntimeServices', reason: 'unsupported_field' })
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}
