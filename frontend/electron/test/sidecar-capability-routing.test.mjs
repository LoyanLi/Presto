import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const routingEntry = path.join(repoRoot, 'frontend/sidecar/capabilityRouting.ts')

let routingModulePromise = null

async function loadRoutingModule() {
  if (!routingModulePromise) {
    routingModulePromise = (async () => {
      const outDir = await mkdtemp(path.join(tmpdir(), 'presto-sidecar-capability-routing-test-'))
      const outfile = path.join(outDir, 'capabilityRouting.mjs')
      await esbuild.build({
        entryPoints: [routingEntry],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        outfile,
      })
      return {
        module: await import(pathToFileURL(outfile).href),
        outDir,
      }
    })()
  }
  return routingModulePromise
}

test('sidecar enriches workflow.run.start requests with trusted definition payload before backend invoke', async (t) => {
  const { module, outDir } = await loadRoutingModule()
  t.after(async () => {
    await rm(outDir, { recursive: true, force: true })
  })

  const resolverCalls = []
  const request = {
    requestId: 'req-1',
    capability: 'workflow.run.start',
    payload: {
      pluginId: 'official.import-workflow',
      workflowId: 'official.import-workflow.run',
      input: {
        sourceFolders: ['/Imports'],
      },
    },
    meta: {
      clientName: 'tauri-renderer',
      clientVersion: '0.1.0',
    },
  }

  const enriched = await module.enrichCapabilityRequestForBackend(request, {
    async resolveWorkflowExecution(input) {
      resolverCalls.push(input)
      return {
        definition: {
          workflowId: 'official.import-workflow.run',
          steps: [{ stepId: 'import', usesCapability: 'import.run.start', input: {} }],
        },
        allowedCapabilities: ['workflow.run.start', 'import.run.start'],
      }
    },
  })

  assert.deepEqual(resolverCalls, [
    {
      pluginId: 'official.import-workflow',
      workflowId: 'official.import-workflow.run',
    },
  ])
  assert.deepEqual(enriched.payload, {
    pluginId: 'official.import-workflow',
    workflowId: 'official.import-workflow.run',
    input: {
      sourceFolders: ['/Imports'],
    },
    definition: {
      workflowId: 'official.import-workflow.run',
      steps: [{ stepId: 'import', usesCapability: 'import.run.start', input: {} }],
    },
    allowedCapabilities: ['workflow.run.start', 'import.run.start'],
  })
})

test('sidecar leaves non-workflow capability payloads unchanged', async () => {
  const { module } = await loadRoutingModule()
  let called = false
  const request = {
    requestId: 'req-2',
    capability: 'jobs.get',
    payload: {
      jobId: 'job-1',
    },
    meta: {
      clientName: 'tauri-renderer',
      clientVersion: '0.1.0',
    },
  }

  const enriched = await module.enrichCapabilityRequestForBackend(request, {
    async resolveWorkflowExecution() {
      called = true
      throw new Error('should not be called')
    },
  })

  assert.equal(called, false)
  assert.equal(enriched, request)
})
