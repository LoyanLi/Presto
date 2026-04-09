import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const entry = path.join(repoRoot, 'packages/contracts/src/daw/targets.ts')

let dawTargetsModulePromise = null

async function loadDawTargetsModule() {
  if (!dawTargetsModulePromise) {
    dawTargetsModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-daw-targets-test-'))
      const outfile = path.join(tempDir, 'daw-targets.mjs')

      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
        await esbuild.build({
          entryPoints: [entry],
          bundle: true,
          format: 'esm',
          platform: 'node',
          target: 'node20',
          outfile,
        })
        return await import(pathToFileURL(outfile).href)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })()
  }

  return dawTargetsModulePromise
}

test('contracts distinguish supported DAW targets from reserved future targets', async () => {
  const module = await loadDawTargetsModule()

  assert.deepEqual(module.SUPPORTED_DAW_TARGETS, ['pro_tools'])
  assert.deepEqual(module.RESERVED_DAW_TARGETS, ['pro_tools', 'logic', 'cubase', 'nuendo'])
  assert.equal(module.isSupportedDawTarget('pro_tools'), true)
  assert.equal(module.isSupportedDawTarget('logic'), false)
  assert.equal(module.isReservedDawTarget('logic'), true)
  assert.equal(module.isReservedDawTarget('ableton'), false)
})

test('contracts daw target surface is sourced from generated artifacts instead of inline arrays', async () => {
  const source = await readFile(entry, 'utf8')

  assert.match(source, /from '\.\.\/generated\/dawTargets'/)
  assert.doesNotMatch(source, /RESERVED_DAW_TARGETS = \[/)
  assert.doesNotMatch(source, /SUPPORTED_DAW_TARGETS = \[/)
})
