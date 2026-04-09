import { RESERVED_DAW_TARGETS, SUPPORTED_DAW_TARGETS } from '../generated/dawTargets'
import type { DawTarget, SupportedDawTarget } from '../generated/dawTargets'

export { RESERVED_DAW_TARGETS, SUPPORTED_DAW_TARGETS } from '../generated/dawTargets'
export type { DawTarget, SupportedDawTarget } from '../generated/dawTargets'

export function isReservedDawTarget(value: unknown): value is DawTarget {
  return typeof value === 'string' && RESERVED_DAW_TARGETS.includes(value as DawTarget)
}

export function isSupportedDawTarget(value: unknown): value is SupportedDawTarget {
  return typeof value === 'string' && SUPPORTED_DAW_TARGETS.includes(value as SupportedDawTarget)
}
