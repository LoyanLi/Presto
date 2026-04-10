#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const manifestDir = path.join(repoRoot, 'packages', 'contracts-manifest')
const capabilityManifestPath = path.join(manifestDir, 'capabilities.json')
const dawTargetsManifestPath = path.join(manifestDir, 'daw-targets.json')
const schemasPath = path.join(manifestDir, 'schemas.json')

const readJson = (targetPath) => JSON.parse(readFileSync(targetPath, 'utf8'))
const ensureDir = (targetPath) => mkdirSync(targetPath, { recursive: true })
const toPyTuple = (values) => {
  if (values.length === 0) {
    return '()'
  }
  if (values.length === 1) {
    return `(${JSON.stringify(values[0])},)`
  }
  return `(${values.map((value) => JSON.stringify(value)).join(', ')})`
}

const capabilities = readJson(capabilityManifestPath)
const dawTargets = readJson(dawTargetsManifestPath)
const schemas = readJson(schemasPath)

if (!Array.isArray(capabilities)) {
  throw new Error('contracts-manifest/capabilities.json must be an array')
}
if (!dawTargets || typeof dawTargets !== 'object' || Array.isArray(dawTargets)) {
  throw new Error('contracts-manifest/daw-targets.json must be an object')
}
if (!schemas || typeof schemas !== 'object') {
  throw new Error('contracts-manifest/schemas.json must be an object')
}

function stringArray(values, fieldName) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`)
  }

  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${fieldName} must only contain non-empty strings`)
    }
  }

  const normalized = values.map((value) => value.trim())
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${fieldName} must not contain duplicates`)
  }

  return normalized
}

const RESERVED_DAW_TARGETS = stringArray(dawTargets.reserved, 'contracts-manifest/daw-targets.json reserved')
const SUPPORTED_DAW_TARGETS = stringArray(dawTargets.supported, 'contracts-manifest/daw-targets.json supported')
const RESERVED_DAW_TARGET_SET = new Set(RESERVED_DAW_TARGETS)
const SUPPORTED_DAW_TARGET_SET = new Set(SUPPORTED_DAW_TARGETS)
const DEFAULT_DAW_TARGET = SUPPORTED_DAW_TARGETS[0]

for (const supportedTarget of SUPPORTED_DAW_TARGETS) {
  if (!RESERVED_DAW_TARGET_SET.has(supportedTarget)) {
    throw new Error(`supported daw target ${supportedTarget} must also exist in reserved targets`)
  }
}

function schemaName(schemaRef, fieldName, capabilityId) {
  if (typeof schemaRef === 'string' && schemaRef.trim()) {
    return schemaRef.trim()
  }
  if (schemaRef && typeof schemaRef === 'object' && typeof schemaRef.name === 'string' && schemaRef.name.trim()) {
    return schemaRef.name.trim()
  }
  throw new Error(`capability ${capabilityId} has invalid ${fieldName}`)
}

function supportedDaws(capability) {
  const resolvedSupportedDaws = stringArray(
    capability.supportedDaws,
    `capability ${capability.id} supportedDaws`,
  )

  for (const dawTarget of resolvedSupportedDaws) {
    if (!SUPPORTED_DAW_TARGET_SET.has(dawTarget)) {
      throw new Error(`capability ${capability.id} supportedDaws must use globally supported daw targets only: ${dawTarget}`)
    }
  }

  return resolvedSupportedDaws
}

function canonicalSource(capability, resolvedSupportedDaws) {
  if (typeof capability.canonicalSource === 'string' && capability.canonicalSource.trim()) {
    const resolvedCanonicalSource = capability.canonicalSource.trim()
    if (!resolvedSupportedDaws.includes(resolvedCanonicalSource)) {
      throw new Error(`capability ${capability.id} canonicalSource must be included in supportedDaws`)
    }
    return resolvedCanonicalSource
  }
  throw new Error(`capability ${capability.id} must declare canonicalSource`)
}

function fieldSupport(capability, resolvedSupportedDaws) {
  if (!capability.fieldSupport || typeof capability.fieldSupport !== 'object' || Array.isArray(capability.fieldSupport)) {
    throw new Error(`capability ${capability.id} must declare fieldSupport`)
  }

  const resolvedFieldSupport = capability.fieldSupport
  const resolvedCanonicalSource = canonicalSource(capability, resolvedSupportedDaws)
  if (!resolvedFieldSupport[resolvedCanonicalSource]) {
    throw new Error(`capability ${capability.id} fieldSupport must include canonicalSource ${resolvedCanonicalSource}`)
  }

  for (const [targetDaw, support] of Object.entries(resolvedFieldSupport)) {
    if (!resolvedSupportedDaws.includes(targetDaw)) {
      throw new Error(`capability ${capability.id} fieldSupport.${targetDaw} must match capability supportedDaws`)
    }
    if (!support || typeof support !== 'object' || Array.isArray(support)) {
      throw new Error(`capability ${capability.id} fieldSupport.${targetDaw} must be an object`)
    }
    if (!Array.isArray(support.requestFields) || !Array.isArray(support.responseFields)) {
      throw new Error(`capability ${capability.id} fieldSupport.${targetDaw} must declare requestFields and responseFields`)
    }
  }

  for (const targetDaw of resolvedSupportedDaws) {
    if (!resolvedFieldSupport[targetDaw]) {
      throw new Error(`capability ${capability.id} fieldSupport must include supported daw ${targetDaw}`)
    }
  }

  return resolvedFieldSupport
}

function generateTsDawTargets() {
  const outDir = path.join(repoRoot, 'packages', 'contracts', 'src', 'generated')
  ensureDir(outDir)

  const content = `/* Auto-generated from contracts-manifest/daw-targets.json; do not edit by hand. */
export const RESERVED_DAW_TARGETS = ${JSON.stringify(RESERVED_DAW_TARGETS)} as const

export type DawTarget = (typeof RESERVED_DAW_TARGETS)[number]

export const SUPPORTED_DAW_TARGETS = ${JSON.stringify(SUPPORTED_DAW_TARGETS)} as const satisfies readonly DawTarget[]

export type SupportedDawTarget = (typeof SUPPORTED_DAW_TARGETS)[number]

export const DEFAULT_DAW_TARGET: SupportedDawTarget = ${JSON.stringify(DEFAULT_DAW_TARGET)}
`

  writeFileSync(path.join(outDir, 'dawTargets.ts'), content, 'utf8')
}

function generateTsCapabilityRegistry() {
  const outDir = path.join(repoRoot, 'packages', 'contracts', 'src', 'generated')
  ensureDir(outDir)

  const body = capabilities
    .map((capability) => {
      const requestSchema = schemaName(capability.requestSchema, 'requestSchema', capability.id)
      const responseSchema = schemaName(capability.responseSchema, 'responseSchema', capability.id)
      const resolvedSupportedDaws = supportedDaws(capability)
      const resolvedCanonicalSource = canonicalSource(capability, resolvedSupportedDaws)
      const resolvedFieldSupport = fieldSupport(capability, resolvedSupportedDaws)
      const emitsBlock =
        Array.isArray(capability.emitsEvents) && capability.emitsEvents.length > 0
          ? `\n    emitsEvents: ${JSON.stringify(capability.emitsEvents)} as const,`
          : ''

      return `  {
    id: '${capability.id}',
    version: ${capability.version},
    kind: '${capability.kind}',
    domain: '${capability.domain}',
    visibility: '${capability.visibility}',
    description: ${JSON.stringify(capability.description)},
    requestSchema: schemaRef('${requestSchema}'),
    responseSchema: schemaRef('${responseSchema}'),
    dependsOn: ${JSON.stringify(capability.dependsOn)} as const,
    supportedDaws: ${JSON.stringify(resolvedSupportedDaws)} as const,
    canonicalSource: ${JSON.stringify(resolvedCanonicalSource)},
    fieldSupport: ${JSON.stringify(resolvedFieldSupport)} as const,
    handler: '${capability.handler}',${emitsBlock}
  },`
    })
    .join('\n')

  const content = `/* Auto-generated from contracts-manifest; do not edit by hand. */
import type { CapabilityDefinition } from '../capabilities/registry'

const schemaRef = (name: string) => ({
  name,
  package: '@presto/contracts' as const,
  version: 1 as const,
})

export const CAPABILITY_REGISTRY = [
${body}
] as const satisfies readonly CapabilityDefinition<any, any>[]

export const PUBLIC_CAPABILITY_IDS = CAPABILITY_REGISTRY.filter((definition) => definition.visibility === 'public').map(
  (definition) => definition.id,
) as readonly string[]
`

  writeFileSync(path.join(outDir, 'capabilityRegistry.ts'), content, 'utf8')
}

function generatePyCapabilityCatalog() {
  const outDir = path.join(repoRoot, 'backend', 'presto', 'application', 'capabilities')
  ensureDir(outDir)

  const definitions = capabilities
    .map((capability) => {
      const requestSchema = schemaName(capability.requestSchema, 'requestSchema', capability.id)
      const responseSchema = schemaName(capability.responseSchema, 'responseSchema', capability.id)
      const resolvedSupportedDaws = supportedDaws(capability)
      const resolvedCanonicalSource = canonicalSource(capability, resolvedSupportedDaws)
      const resolvedFieldSupport = fieldSupport(capability, resolvedSupportedDaws)
      const emitsBlock =
        Array.isArray(capability.emitsEvents) && capability.emitsEvents.length > 0
          ? `,\n        emits_events=${toPyTuple(capability.emitsEvents)}`
          : ''
      const fieldSupportBlock = Object.entries(resolvedFieldSupport)
        .map(
          ([daw, support]) =>
            `            ${JSON.stringify(daw)}: CapabilityFieldSupport(request_fields=${toPyTuple(support.requestFields)}, response_fields=${toPyTuple(support.responseFields)}),`,
        )
        .join('\n')

      return `    definition(
        "${capability.id}",
        kind="${capability.kind}",
        domain="${capability.domain}",
        visibility="${capability.visibility}",
        description=${JSON.stringify(capability.description)},
        request_schema="${requestSchema}",
        response_schema="${responseSchema}",
        depends_on=${toPyTuple(capability.dependsOn)},
        supported_daws=${toPyTuple(resolvedSupportedDaws)},
        canonical_source="${resolvedCanonicalSource}",
        field_support={
${fieldSupportBlock}
        },
        handler="${capability.handler}"${emitsBlock},
    ),`
    })
    .join('\n')

  const content = `"""Auto-generated from contracts-manifest; do not edit by hand."""
from __future__ import annotations

from ...domain.capabilities import CapabilityFieldSupport
from .factory import definition

DEFAULT_CAPABILITY_DEFINITIONS = (
${definitions}
)
`

  writeFileSync(path.join(outDir, 'catalog_generated.py'), content, 'utf8')
}

function generatePyDawTargets() {
  const outDir = path.join(repoRoot, 'backend', 'presto', 'domain')
  ensureDir(outDir)

  const content = `"""Auto-generated from contracts-manifest/daw-targets.json; do not edit by hand."""
from __future__ import annotations

from typing import Literal, TypeAlias


DawTarget: TypeAlias = Literal[${RESERVED_DAW_TARGETS.map((value) => JSON.stringify(value)).join(', ')}]

DEFAULT_DAW_TARGET: DawTarget = ${JSON.stringify(DEFAULT_DAW_TARGET)}
RESERVED_DAW_TARGETS: tuple[DawTarget, ...] = ${toPyTuple(RESERVED_DAW_TARGETS)}
SUPPORTED_DAW_TARGETS: tuple[DawTarget, ...] = ${toPyTuple(SUPPORTED_DAW_TARGETS)}
`

  writeFileSync(path.join(outDir, 'daw_targets_generated.py'), content, 'utf8')
}

function generateRustDawTargets() {
  const outDir = path.join(repoRoot, 'src-tauri', 'src', 'runtime')
  ensureDir(outDir)

  const content = `// Auto-generated from contracts-manifest/daw-targets.json; do not edit by hand.
pub(super) const DEFAULT_DAW_TARGET: &str = ${JSON.stringify(DEFAULT_DAW_TARGET)};
pub(super) const RESERVED_DAW_TARGETS: [&str; ${RESERVED_DAW_TARGETS.length}] = [${RESERVED_DAW_TARGETS.map((value) => JSON.stringify(value)).join(', ')}];
pub(super) const SUPPORTED_DAW_TARGETS: [&str; ${SUPPORTED_DAW_TARGETS.length}] = [${SUPPORTED_DAW_TARGETS.map((value) => JSON.stringify(value)).join(', ')}];
`

  writeFileSync(path.join(outDir, 'daw_targets_generated.rs'), content, 'utf8')
}

generateTsDawTargets()
generateTsCapabilityRegistry()
generatePyDawTargets()
generatePyCapabilityCatalog()
generateRustDawTargets()

console.log('Generated contracts artifacts from manifest:')
console.log(' - packages/contracts/src/generated/dawTargets.ts')
console.log(' - packages/contracts/src/generated/capabilityRegistry.ts')
console.log(' - backend/presto/domain/daw_targets_generated.py')
console.log(' - backend/presto/application/capabilities/catalog_generated.py')
console.log(' - src-tauri/src/runtime/daw_targets_generated.rs')
