import type { PrestoRuntime } from '@presto/sdk-runtime'

export type HostPermissionId = 'macAccessibility'

export interface HostPermissionStatus {
  id: HostPermissionId
  checked: boolean
  granted: boolean
  required: boolean
  errorCode: string
}

export function createDefaultRequiredHostPermissions({
  macAccessibilityAvailable,
}: {
  macAccessibilityAvailable: boolean
}): HostPermissionStatus[] {
  if (!macAccessibilityAvailable) {
    return []
  }

  return [
    {
      id: 'macAccessibility',
      checked: false,
      granted: false,
      required: true,
      errorCode: '',
    },
  ]
}

export async function scanRequiredHostPermissions({
  macAccessibilityPreflight,
  macAccessibilityPermissionRequiredCode,
}: {
  macAccessibilityPreflight?: PrestoRuntime['macAccessibility']['preflight']
  macAccessibilityPermissionRequiredCode: string
}): Promise<HostPermissionStatus[]> {
  if (!macAccessibilityPreflight) {
    return createDefaultRequiredHostPermissions({ macAccessibilityAvailable: true })
  }

  const result = await macAccessibilityPreflight()
  const errorCode = typeof result.error === 'string' ? result.error : ''

  if (errorCode === 'MAC_ACCESSIBILITY_UNSUPPORTED') {
    return createDefaultRequiredHostPermissions({ macAccessibilityAvailable: false })
  }

  return [
    {
      id: 'macAccessibility',
      checked: true,
      granted: result.ok && result.trusted,
      required: errorCode !== 'MAC_ACCESSIBILITY_UNSUPPORTED',
      errorCode,
    },
  ]
}

export function getMissingRequiredHostPermissions(
  permissions: readonly HostPermissionStatus[],
): HostPermissionStatus[] {
  return permissions.filter((permission) => permission.required && permission.checked && !permission.granted)
}
