import type { CapabilityId, PrestoErrorPayload } from '@presto/contracts'

type CapabilityFieldSupport = {
  requestFields: string[]
  responseFields: string[]
}

type CapabilityFieldSupportDefinition = {
  id: CapabilityId | string
  canonicalSource: string
  fieldSupport: Record<string, CapabilityFieldSupport>
}

function collectPayloadFieldPaths(payload: unknown, prefix = ''): Set<string> {
  if (Array.isArray(payload)) {
    const fields = new Set<string>()
    const listPrefix = prefix ? `${prefix}[]` : '[]'
    for (const value of payload) {
      for (const field of collectPayloadFieldPaths(value, listPrefix)) {
        fields.add(field)
      }
    }
    return fields
  }

  if (payload && typeof payload === 'object') {
    const fields = new Set<string>()
    for (const [key, value] of Object.entries(payload)) {
      const fieldName = prefix ? `${prefix}.${key}` : key
      fields.add(fieldName)
      for (const field of collectPayloadFieldPaths(value, fieldName)) {
        fields.add(field)
      }
    }
    return fields
  }

  return new Set<string>()
}

export function validateCapabilityPayloadForDaw(
  capability: CapabilityFieldSupportDefinition,
  payload: unknown,
  activeDawTarget?: string | null,
): void {
  const targetDaw = activeDawTarget || capability.canonicalSource
  const support = capability.fieldSupport[targetDaw]
  if (!support || support.requestFields.length === 0) {
    return
  }

  const presentFields = [...collectPayloadFieldPaths(payload)]
  const unsupportedFields = presentFields.filter((field) => !support.requestFields.includes(field)).sort()
  if (unsupportedFields.length === 0) {
    return
  }

  throw {
    code: 'CAPABILITY_FIELDS_UNSUPPORTED',
    message: `Unsupported fields for ${capability.id} on ${targetDaw}: ${unsupportedFields.join(', ')}`,
    source: 'capability',
    retryable: false,
    capability: capability.id,
    details: {
      capabilityId: capability.id,
      targetDaw,
      unsupportedFields,
    },
  } satisfies PrestoErrorPayload
}
