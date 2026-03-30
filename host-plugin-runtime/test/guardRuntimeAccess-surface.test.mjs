import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

let guardRuntimeAccessPromise = null

async function loadGuardRuntimeAccess() {
  if (!guardRuntimeAccessPromise) {
    guardRuntimeAccessPromise = (async () => {
      const entry = path.join(repoRoot, 'host-plugin-runtime/src/permissions/guardRuntimeAccess.ts')
      const buildResult = await esbuild.build({
        entryPoints: [entry],
        absWorkingDir: repoRoot,
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
        target: 'node20',
      })
      const source = buildResult.outputFiles[0]?.text
      if (!source) {
        throw new Error('Failed to compile guardRuntimeAccess.ts')
      }
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      const loaded = await import(moduleUrl)
      return loaded.guardRuntimeAccess
    })()
  }

  return guardRuntimeAccessPromise
}

test('guardRuntimeAccess exposes automation runtime methods when declared in manifest', async () => {
  const guardRuntimeAccess = await loadGuardRuntimeAccess()
  const calls = []
  const runtime = {
    automation: {
      async listDefinitions() {
        calls.push({ method: 'automation.listDefinitions' })
        return [{ id: 'split', title: 'Split', app: 'Presto' }]
      },
      async runDefinition(request) {
        calls.push({ method: 'automation.runDefinition', request })
        return { ok: true, steps: [] }
      },
    },
  }
  const manifest = {
    pluginId: 'plugin.runtime.automation',
    requiredRuntimeServices: ['automation.listDefinitions', 'automation.runDefinition'],
  }

  const guarded = guardRuntimeAccess(runtime, manifest)
  assert.ok(guarded.automation)

  const definitions = await guarded.automation.listDefinitions()
  const result = await guarded.automation.runDefinition({ definitionId: 'split' })

  assert.deepEqual(definitions, [{ id: 'split', title: 'Split', app: 'Presto' }])
  assert.deepEqual(result, { ok: true, steps: [] })
  assert.deepEqual(calls, [
    { method: 'automation.listDefinitions' },
    { method: 'automation.runDefinition', request: { definitionId: 'split' } },
  ])
})

test('guardRuntimeAccess denies undeclared automation runtime methods', async () => {
  const guardRuntimeAccess = await loadGuardRuntimeAccess()
  const runtime = {
    automation: {
      async listDefinitions() {
        return []
      },
      async runDefinition() {
        return { ok: true, steps: [] }
      },
    },
  }
  const manifest = {
    pluginId: 'plugin.runtime.denied',
    requiredRuntimeServices: [],
  }

  const guarded = guardRuntimeAccess(runtime, manifest)
  assert.equal(guarded.automation, undefined)
})
