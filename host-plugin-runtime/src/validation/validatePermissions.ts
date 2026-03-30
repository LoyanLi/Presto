import type { PublicCapabilityId, PluginRuntimeServiceName, WorkflowPluginManifest } from '../../../packages/contracts/src'

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
  allowedRuntimeServices: readonly PluginRuntimeServiceName[]
}

const hasDuplicate = (values: readonly string[], value: string): boolean => values.filter((item) => item === value).length > 1

export function validatePermissions(input: ValidatePermissionsInput): PermissionValidationResult {
  const issues: PermissionValidationIssue[] = []
  const allowedCapabilities = new Set(input.allowedCapabilities)
  const allowedRuntimeServices = new Set(input.allowedRuntimeServices)

  for (const capability of input.manifest.requiredCapabilities) {
    if (!allowedCapabilities.has(capability)) {
      issues.push({ field: 'requiredCapabilities', reason: `unsupported_capability:${capability}` })
    }

    if (hasDuplicate(input.manifest.requiredCapabilities, capability)) {
      issues.push({ field: 'requiredCapabilities', reason: `duplicate_value:${capability}` })
      break
    }
  }

  for (const service of input.manifest.requiredRuntimeServices ?? []) {
    if (!allowedRuntimeServices.has(service)) {
      issues.push({ field: 'requiredRuntimeServices', reason: `unsupported_runtime_service:${service}` })
    }

    if (hasDuplicate(input.manifest.requiredRuntimeServices ?? [], service)) {
      issues.push({ field: 'requiredRuntimeServices', reason: `duplicate_value:${service}` })
      break
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}
