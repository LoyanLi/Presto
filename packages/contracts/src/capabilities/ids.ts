import { ALL_CAPABILITY_IDS, INTERNAL_CAPABILITY_IDS, PUBLIC_CAPABILITY_IDS } from '../generated/capabilityIds'

export type CapabilityKind = 'query' | 'command' | 'job'

export type CapabilityVisibility = 'public' | 'internal'

export type CapabilityDomain =
  | 'system'
  | 'config'
  | 'ai'
  | 'daw'
  | 'automation'
  | 'workflow'
  | 'session'
  | 'track'
  | 'clip'
  | 'transport'
  | 'import'
  | 'stripSilence'
  | 'export'
  | 'jobs'

export type CapabilityDependency =
  | 'config_store'
  | 'keychain_store'
  | 'ai_service'
  | 'jobs'
  | 'daw'
  | 'mac_automation'
  | 'daw_ui_profile'

export type PublicCapabilityId = (typeof PUBLIC_CAPABILITY_IDS)[number]

export type InternalCapabilityId = (typeof INTERNAL_CAPABILITY_IDS)[number]

export type CapabilityId = (typeof ALL_CAPABILITY_IDS)[number]

export { ALL_CAPABILITY_IDS, INTERNAL_CAPABILITY_IDS, PUBLIC_CAPABILITY_IDS }
