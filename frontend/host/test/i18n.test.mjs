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

test('desktop-facing copy avoids page and app wording in key host surfaces', async () => {
  const { translateHost } = await loadI18nModule()

  assert.equal(
    translateHost('en', 'home.workflowUnavailable.body'),
    'The selected workflow view could not be opened.',
  )
  assert.equal(
    translateHost('en', 'settings.update.openRelease'),
    'View Release Notes',
  )
  assert.equal(
    translateHost('zh-CN', 'general.developer.toggleBody'),
    '显示专门的开发者界面和插件诊断导航。',
  )
  assert.equal(
    translateHost('zh-CN', 'settings.accessibility.dialog.help'),
    '如果 Presto 已经开启过权限，请先移除再重新添加，然后重新打开应用。建议直接从 /Applications/Presto.app 运行。',
  )
})
