#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const backendRoot = path.join(repoRoot, 'backend')
const adapterPath = path.join(repoRoot, 'backend', 'presto', 'integrations', 'daw', 'protools_adapter.py')
const generatedCapabilityIdsPath = path.join(repoRoot, 'packages', 'contracts', 'src', 'generated', 'capabilityIds.ts')
const reportPath = path.join(repoRoot, 'build', 'ptsl-coverage.json')

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length
}

function loadSchemaStats() {
  const script = `
import json
from ptsl import PTSL_pb2 as pt
from presto.integrations.daw.ptsl_catalog import list_commands

entries = list_commands()
request_entries = [entry for entry in entries if entry.request_message]
response_entries = [entry for entry in entries if entry.response_message]
request_unresolved = [entry.command_name for entry in request_entries if getattr(pt, entry.request_message, None) is None]
response_unresolved = [entry.command_name for entry in response_entries if getattr(pt, entry.response_message, None) is None]

print(json.dumps({
    "totalCatalogCommands": len(entries),
    "commandsWithPyPtslOps": sum(1 for entry in entries if entry.has_py_ptsl_op),
    "requestSchemaCommandCount": len(request_entries),
    "responseSchemaCommandCount": len(response_entries),
    "requestSchemasResolved": len(request_entries) - len(request_unresolved),
    "responseSchemasResolved": len(response_entries) - len(response_unresolved),
    "unresolvedRequestSchemas": request_unresolved,
    "unresolvedResponseSchemas": response_unresolved,
}, ensure_ascii=False))
`.trim()

  return JSON.parse(
    execFileSync('python3', ['-c', script], {
      cwd: backendRoot,
      encoding: 'utf8',
    }),
  )
}

function loadSemanticCoverageStats() {
  const script = `
import json
from presto.integrations.daw.ptsl_catalog import list_commands
from presto.integrations.daw.ptsl_semantic import semantic_capability_id

print(json.dumps({
    "expectedPublicSemanticCapabilityIds": [semantic_capability_id(entry) for entry in list_commands()],
}, ensure_ascii=False))
`.trim()

  return JSON.parse(
    execFileSync('python3', ['-c', script], {
      cwd: backendRoot,
      encoding: 'utf8',
    }),
  )
}

function parseGeneratedCapabilityIdArray(source, exportName) {
  const pattern = new RegExp(`export const ${exportName} = (\\[[\\s\\S]*?\\]) as const`)
  const match = source.match(pattern)
  if (!match) {
    throw new Error(`Unable to parse ${exportName} from generated capability ids.`)
  }
  return JSON.parse(match[1])
}

function main() {
  const adapterSource = fs.readFileSync(adapterPath, 'utf8')
  const generatedCapabilityIdsSource = fs.readFileSync(generatedCapabilityIdsPath, 'utf8')
  const schemaStats = loadSchemaStats()
  const semanticCoverageStats = loadSemanticCoverageStats()
  const publicCapabilityIds = parseGeneratedCapabilityIdArray(
    generatedCapabilityIdsSource,
    'PUBLIC_CAPABILITY_IDS',
  )
  const generatedPublicPtslSemanticCapabilityIds = parseGeneratedCapabilityIdArray(
    generatedCapabilityIdsSource,
    'PTSL_SEMANTIC_CAPABILITY_IDS',
  ).sort()
  const internalCapabilityIds = parseGeneratedCapabilityIdArray(
    generatedCapabilityIdsSource,
    'INTERNAL_CAPABILITY_IDS',
  )
  const internalPtslCapabilityIds = internalCapabilityIds
    .filter((id) => /^daw\.ptsl\./.test(String(id)))
    .sort()
  const expectedPublicSemanticCapabilityIds = [...semanticCoverageStats.expectedPublicSemanticCapabilityIds].sort()
  const publicCapabilityIdSet = new Set(publicCapabilityIds)
  const generatedPublicSemanticCapabilityIdSet = new Set(generatedPublicPtslSemanticCapabilityIds)
  const publicPtslSemanticCapabilityIds = expectedPublicSemanticCapabilityIds.filter((id) =>
    publicCapabilityIdSet.has(id),
  )
  const canonicalPublicCapabilityIdsCoveringPtsl = publicPtslSemanticCapabilityIds.filter(
    (id) => !generatedPublicSemanticCapabilityIdSet.has(id),
  )
  const publicSemanticCapabilityIdSet = new Set(publicPtslSemanticCapabilityIds)
  const executeCapabilityPresent = internalPtslCapabilityIds.includes('daw.ptsl.command.execute')
  const report = {
    ...schemaStats,
    adapterDirectClientRunCommandCallCount: countMatches(adapterSource, /\bclient\.run_command\(/g),
    adapterDirectClientRunCallCount: countMatches(adapterSource, /\bclient\.run\(/g),
    internalPtslCapabilityIds,
    generatedPublicPtslSemanticCapabilityIds,
    generatedPublicPtslSemanticCapabilityCount: generatedPublicPtslSemanticCapabilityIds.length,
    canonicalPublicCapabilityIdsCoveringPtsl,
    canonicalPublicCapabilityCoverageCount: canonicalPublicCapabilityIdsCoveringPtsl.length,
    publicPtslSemanticCapabilityIds,
    publicPtslSemanticCapabilityCount: publicPtslSemanticCapabilityIds.length,
    catalogReachableViaPublicSemanticCapabilityCount: expectedPublicSemanticCapabilityIds.filter((id) =>
      publicSemanticCapabilityIdSet.has(id),
    ).length,
    catalogUnreachableViaPublicSemanticCapability: expectedPublicSemanticCapabilityIds.filter(
      (id) => !publicSemanticCapabilityIdSet.has(id),
    ),
    catalogReachableViaInternalCapabilityCount: executeCapabilityPresent ? schemaStats.totalCatalogCommands : 0,
    catalogUnreachableViaInternalCapability: executeCapabilityPresent
      ? []
      : JSON.parse(
          execFileSync(
            'python3',
            [
              '-c',
              'import json; from presto.integrations.daw.ptsl_catalog import list_commands; print(json.dumps([entry.command_name for entry in list_commands()]))',
            ],
            {
              cwd: backendRoot,
              encoding: 'utf8',
            },
          ),
        ),
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${reportPath}`)
}

main()
