import type { CapabilityId } from '../capabilities/ids'

export type ErrorSource =
  | 'capability'
  | 'daw'
  | 'mac_automation'
  | 'transport'
  | 'runtime'

export interface PrestoErrorPayload {
  code: string
  message: string
  details?: Record<string, unknown>
  source: ErrorSource
  retryable: boolean
  capability?: CapabilityId
  adapter?: string
}
