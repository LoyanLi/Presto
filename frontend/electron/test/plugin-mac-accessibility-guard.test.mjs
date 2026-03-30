import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

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

test('guardRuntimeAccess allows declared macAccessibility services and blocks undeclared ones', async () => {
  const guardRuntimeAccess = await loadGuardRuntimeAccess()
  const invocations = []
  const runtime = {
    macAccessibility: {
      async preflight() {
        invocations.push({ method: 'preflight' })
        return { ok: true, trusted: true }
      },
      async runScript(script, args) {
        invocations.push({ method: 'runScript', script, args: args ?? [] })
        return { ok: true, stdout: 'script-ok' }
      },
      async runFile(scriptPath, args) {
        invocations.push({ method: 'runFile', scriptPath, args: args ?? [] })
        return { ok: true, stdout: 'file-ok' }
      },
    },
  }
  const manifest = {
    pluginId: 'plugin.test.mac',
    requiredRuntimeServices: ['macAccessibility.preflight', 'macAccessibility.runFile'],
  }

  const guarded = guardRuntimeAccess(runtime, manifest)
  assert.ok(guarded.macAccessibility)

  const preflightResult = await guarded.macAccessibility.preflight()
  assert.deepEqual(preflightResult, { ok: true, trusted: true })

  const runFileResult = await guarded.macAccessibility.runFile('/tmp/test.scpt', ['arg1'])
  assert.deepEqual(runFileResult, { ok: true, stdout: 'file-ok' })

  await assert.rejects(
    async () => guarded.macAccessibility.runScript('return "hello"', ['arg1']),
    (error) =>
      error instanceof Error &&
      error.name === 'PluginPermissionError' &&
      error.code === 'PLUGIN_PERMISSION_DENIED' &&
      String(error.message).includes('presto.runtime.macAccessibility.runScript()'),
  )

  assert.deepEqual(invocations, [
    { method: 'preflight' },
    { method: 'runFile', scriptPath: '/tmp/test.scpt', args: ['arg1'] },
  ])
})

test('guardRuntimeAccess fails clearly when declared macAccessibility service is not provided by host runtime', async () => {
  const guardRuntimeAccess = await loadGuardRuntimeAccess()
  const manifest = {
    pluginId: 'plugin.test.mac.missing',
    requiredRuntimeServices: ['macAccessibility.preflight'],
  }

  assert.throws(
    () => guardRuntimeAccess({}, manifest),
    (error) =>
      error instanceof Error &&
      error.name === 'PluginPermissionError' &&
      String(error.message).includes('host did not provide'),
  )
})
