import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const entry = path.join(repoRoot, 'frontend/sidecar/logging.ts')

let modulePromise = null

async function loadLoggingModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const outDir = await mkdtemp(path.join(tmpdir(), 'presto-sidecar-logging-test-'))
      const outfile = path.join(outDir, 'sidecarLogging.mjs')
      await esbuild.build({
        entryPoints: [entry],
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
  return modulePromise
}

test('sidecar rpc logging keeps the operation and true error reason on the summary line', async (t) => {
  const { module, outDir } = await loadLoggingModule()
  t.after(async () => {
    await rm(outDir, { recursive: true, force: true })
  })

  const entry = module.createSidecarRpcErrorLogEntry(
    {
      id: 'req-1',
      operation: 'backend.capability.invoke',
    },
    new Error('unsupported_operation:undefined'),
  )

  assert.deepEqual(entry, {
    level: 'error',
    source: 'sidecar.rpc',
    message: 'backend.capability.invoke unsupported_operation:undefined',
    details: {
      requestId: 'req-1',
    },
  })
})

test('sidecar parse failures produce a direct parse summary for logging', async (t) => {
  const { module, outDir } = await loadLoggingModule()
  t.after(async () => {
    await rm(outDir, { recursive: true, force: true })
  })

  const entry = module.createSidecarParseErrorLogEntry(new Error('Unexpected token ] in JSON at position 1'))

  assert.deepEqual(entry, {
    level: 'error',
    source: 'sidecar.rpc',
    message: 'request.parse Unexpected token ] in JSON at position 1',
    details: null,
  })
})
