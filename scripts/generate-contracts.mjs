#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const manifestDir = path.join(repoRoot, 'packages', 'contracts-manifest')
const capabilityManifestPath = path.join(manifestDir, 'capabilities.json')
const runtimeServicesPath = path.join(manifestDir, 'runtime-services.json')
const pluginPermissionsPath = path.join(manifestDir, 'plugin-permissions.json')
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
const runtimeServices = readJson(runtimeServicesPath)
const pluginPermissions = readJson(pluginPermissionsPath)
const schemas = readJson(schemasPath)

if (!Array.isArray(capabilities)) {
  throw new Error('contracts-manifest/capabilities.json must be an array')
}
if (!Array.isArray(runtimeServices)) {
  throw new Error('contracts-manifest/runtime-services.json must be an array')
}
if (!pluginPermissions || typeof pluginPermissions !== 'object') {
  throw new Error('contracts-manifest/plugin-permissions.json must be an object')
}
if (!Array.isArray(pluginPermissions.allowedRuntimeServices)) {
  throw new Error('plugin-permissions.allowedRuntimeServices must be an array')
}
if (JSON.stringify(pluginPermissions.allowedRuntimeServices) !== JSON.stringify(runtimeServices)) {
  throw new Error('runtime-services.json must match plugin-permissions.allowedRuntimeServices exactly')
}
if (!schemas || typeof schemas !== 'object') {
  throw new Error('contracts-manifest/schemas.json must be an object')
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

function generateTsCapabilityRegistry() {
  const outDir = path.join(repoRoot, 'packages', 'contracts', 'src', 'generated')
  ensureDir(outDir)

  const body = capabilities
    .map((capability) => {
      const requestSchema = schemaName(capability.requestSchema, 'requestSchema', capability.id)
      const responseSchema = schemaName(capability.responseSchema, 'responseSchema', capability.id)
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
    supportedDaws: ${JSON.stringify(capability.supportedDaws)} as const,
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

function generateTsRuntimeServices() {
  const outDir = path.join(repoRoot, 'host-plugin-runtime', 'src', 'discovery', 'generated')
  ensureDir(outDir)

  const content = `/* Auto-generated from contracts-manifest; do not edit by hand. */
export const FORMAL_RUNTIME_SERVICE_NAMES = ${JSON.stringify(runtimeServices, null, 2)} as const
export const FORMAL_PUBLIC_CAPABILITY_IDS = ${JSON.stringify(
    capabilities.filter((capability) => capability.visibility === 'public').map((capability) => capability.id),
    null,
    2,
  )} as const
`

  writeFileSync(path.join(outDir, 'runtimeServices.ts'), content, 'utf8')
}

function generatePyCapabilityCatalog() {
  const outDir = path.join(repoRoot, 'backend', 'import', 'presto', 'application', 'capabilities')
  ensureDir(outDir)

  const definitions = capabilities
    .map((capability) => {
      const requestSchema = schemaName(capability.requestSchema, 'requestSchema', capability.id)
      const responseSchema = schemaName(capability.responseSchema, 'responseSchema', capability.id)
      const emitsBlock =
        Array.isArray(capability.emitsEvents) && capability.emitsEvents.length > 0
          ? `,\n        emits_events=${toPyTuple(capability.emitsEvents)}`
          : ''

      return `    definition(
        "${capability.id}",
        kind="${capability.kind}",
        domain="${capability.domain}",
        visibility="${capability.visibility}",
        description=${JSON.stringify(capability.description)},
        request_schema="${requestSchema}",
        response_schema="${responseSchema}",
        depends_on=${toPyTuple(capability.dependsOn)},
        supported_daws=${toPyTuple(capability.supportedDaws)},
        handler="${capability.handler}"${emitsBlock},
    ),`
    })
    .join('\n')

  const content = `"""Auto-generated from contracts-manifest; do not edit by hand."""
from __future__ import annotations

from .factory import definition

DEFAULT_CAPABILITY_DEFINITIONS = (
${definitions}
)
`

  writeFileSync(path.join(outDir, 'catalog_generated.py'), content, 'utf8')
}

generateTsCapabilityRegistry()
generateTsRuntimeServices()
generatePyCapabilityCatalog()

console.log('Generated contracts artifacts from manifest:')
console.log(' - packages/contracts/src/generated/capabilityRegistry.ts')
console.log(' - host-plugin-runtime/src/discovery/generated/runtimeServices.ts')
console.log(' - backend/import/presto/application/capabilities/catalog_generated.py')
