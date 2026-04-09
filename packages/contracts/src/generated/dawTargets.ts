/* Auto-generated from contracts-manifest/daw-targets.json; do not edit by hand. */
export const RESERVED_DAW_TARGETS = ["pro_tools","logic","cubase","nuendo"] as const

export type DawTarget = (typeof RESERVED_DAW_TARGETS)[number]

export const SUPPORTED_DAW_TARGETS = ["pro_tools"] as const satisfies readonly DawTarget[]

export type SupportedDawTarget = (typeof SUPPORTED_DAW_TARGETS)[number]

export const DEFAULT_DAW_TARGET: SupportedDawTarget = "pro_tools"
