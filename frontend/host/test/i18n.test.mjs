import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let i18nModulePromise = null

async function loadI18nModule() {
  if (!i18nModulePromise) {
    i18nModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-host-i18n-test-'))
      const outfile = path.join(tempDir, 'i18n.mjs')
      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
        await esbuild.build({
          entryPoints: [path.join(repoRoot, 'frontend/host/i18n.ts')],
          bundle: true,
          format: 'esm',
          platform: 'node',
          target: 'node20',
          outfile,
          loader: {
            '.ts': 'ts',
            '.tsx': 'tsx',
          },
        })

        return await import(pathToFileURL(outfile).href)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })()
  }

  return i18nModulePromise
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'navigator')
})

test('system locale candidates resolve from global navigator shim without window', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      languages: ['zh-CN', 'en-US'],
      language: 'zh-CN',
    },
    configurable: true,
  })

  const { getSystemLocaleCandidates, resolveHostLocale } = await loadI18nModule()

  assert.deepEqual(getSystemLocaleCandidates(), ['zh-CN', 'en-US'])
  assert.equal(resolveHostLocale('system'), 'zh-CN')
})
