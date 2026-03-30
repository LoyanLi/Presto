import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let preferencesModulePromise = null

class MemoryStorage {
  #store = new Map()

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null
  }

  setItem(key, value) {
    this.#store.set(key, String(value))
  }

  removeItem(key) {
    this.#store.delete(key)
  }

  clear() {
    this.#store.clear()
  }
}

function installWindowStub() {
  const storage = new MemoryStorage()
  globalThis.window = {
    localStorage: storage,
  }
  return storage
}

async function loadPreferencesModule() {
  if (!preferencesModulePromise) {
    preferencesModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(repoRoot, '.tmp-host-shell-preferences-test-'))
      const outfile = path.join(tempDir, 'shell-preferences.mjs')
      await esbuild.build({
        entryPoints: [path.join(repoRoot, 'frontend/host/shellPreferences.ts')],
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

      return import(pathToFileURL(outfile).href)
    })()
  }

  return preferencesModulePromise
}

test.afterEach(() => {
  delete globalThis.window
})

test('shell preferences default to follow-system language, developer mode off, and Pro Tools target', async () => {
  installWindowStub()
  const { getHostShellPreferences } = await loadPreferencesModule()

  assert.deepEqual(getHostShellPreferences(), {
    language: 'system',
    developerMode: false,
    dawTarget: 'pro_tools',
  })
})

test('shell preferences persist language, developer mode, and daw target changes', async () => {
  const storage = installWindowStub()
  const { getHostShellPreferences, setHostShellPreferences } = await loadPreferencesModule()

  setHostShellPreferences({
    language: 'zh-CN',
    developerMode: true,
    dawTarget: 'pro_tools',
  })

  assert.deepEqual(getHostShellPreferences(), {
    language: 'zh-CN',
    developerMode: true,
    dawTarget: 'pro_tools',
  })
  assert.equal(
    storage.getItem('presto.host.shell.preferences'),
    JSON.stringify({
      language: 'zh-CN',
      developerMode: true,
      dawTarget: 'pro_tools',
    }),
  )
})
