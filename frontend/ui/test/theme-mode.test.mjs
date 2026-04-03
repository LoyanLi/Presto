import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const STORAGE_KEY = 'presto.ui.theme.mode'

class MemoryStorage {
  #store = new Map()

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null
  }

  setItem(key, value) {
    this.#store.set(key, String(value))
  }
}

function createMatchMediaStub(initialDark = false) {
  let matches = Boolean(initialDark)
  const listeners = new Set()

  const mediaQueryList = {
    media: '(prefers-color-scheme: dark)',
    get matches() {
      return matches
    },
    addEventListener(type, listener) {
      if (type === 'change') {
        listeners.add(listener)
      }
    },
    removeEventListener(type, listener) {
      if (type === 'change') {
        listeners.delete(listener)
      }
    },
    addListener(listener) {
      listeners.add(listener)
    },
    removeListener(listener) {
      listeners.delete(listener)
    },
    dispatch(nextDark) {
      matches = Boolean(nextDark)
      const event = { matches, media: '(prefers-color-scheme: dark)' }
      listeners.forEach((listener) => listener(event))
    },
  }

  return {
    matchMedia(query) {
      if (query === '(prefers-color-scheme: dark)') {
        return mediaQueryList
      }

      return {
        media: query,
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }
    },
    mediaQueryList,
  }
}

function installThemeRuntime({ storedPreference = 'system', systemDark = false } = {}) {
  const attributes = new Map()
  const storage = new MemoryStorage()
  storage.setItem(STORAGE_KEY, storedPreference)
  const { matchMedia, mediaQueryList } = createMatchMediaStub(systemDark)

  globalThis.window = {
    localStorage: storage,
    matchMedia,
  }
  globalThis.document = {
    documentElement: {
      getAttribute(name) {
        return attributes.has(name) ? attributes.get(name) : null
      },
      setAttribute(name, value) {
        attributes.set(name, String(value))
      },
    },
  }

  return {
    mediaQueryList,
    getThemeAttribute() {
      return globalThis.document.documentElement.getAttribute('data-presto-theme')
    },
    getStoredPreference() {
      return storage.getItem(STORAGE_KEY)
    },
  }
}

async function loadThemeModeModule() {
  const tempDir = await mkdtemp(path.join(tmpdir(), '.tmp-ui-theme-mode-test-'))
  const outfile = path.join(tempDir, 'theme-mode.mjs')

  try {
    await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
    await esbuild.build({
      entryPoints: [path.join(repoRoot, 'frontend/ui/theme/mode.ts')],
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
}

test.afterEach(() => {
  delete globalThis.window
  delete globalThis.document
})

test('stored system preference resolves to dark when OS color scheme prefers dark', async () => {
  const runtime = installThemeRuntime({
    storedPreference: 'system',
    systemDark: true,
  })
  const { getThemeMode } = await loadThemeModeModule()

  assert.equal(getThemeMode(), 'dark')
  assert.equal(runtime.getThemeAttribute(), 'dark')
  assert.equal(runtime.getStoredPreference(), 'system')
})

test('initThemeMode default does not override stored system preference', async () => {
  const runtime = installThemeRuntime({
    storedPreference: 'system',
    systemDark: true,
  })
  const { getThemeMode, getThemePreference, initThemeMode } = await loadThemeModeModule()

  assert.equal(initThemeMode('light'), 'dark')
  assert.equal(getThemeMode(), 'dark')
  assert.equal(getThemePreference(), 'system')
  assert.equal(runtime.getThemeAttribute(), 'dark')
  assert.equal(runtime.getStoredPreference(), 'system')
})

test('changing theme preference updates the data-presto-theme attribute', async () => {
  const runtime = installThemeRuntime({
    storedPreference: 'light',
    systemDark: true,
  })
  const { getThemeMode, getThemePreference, setThemeMode, setThemePreference } = await loadThemeModeModule()

  setThemeMode('light')
  assert.equal(runtime.getThemeAttribute(), 'light')
  assert.equal(getThemeMode(), 'light')
  assert.equal(getThemePreference(), 'light')
  assert.equal(runtime.getStoredPreference(), 'light')

  setThemeMode('dark')
  assert.equal(runtime.getThemeAttribute(), 'dark')
  assert.equal(getThemeMode(), 'dark')
  assert.equal(getThemePreference(), 'dark')
  assert.equal(runtime.getStoredPreference(), 'dark')

  setThemePreference('system')
  assert.equal(runtime.getThemeAttribute(), 'dark')
  assert.equal(getThemeMode(), 'dark')
  assert.equal(getThemePreference(), 'system')
  assert.equal(runtime.getStoredPreference(), 'system')
})

test('subscribeThemeMode emits effective mode changes for preference and system updates', async () => {
  const runtime = installThemeRuntime({
    storedPreference: 'light',
    systemDark: false,
  })
  const { setThemeMode, setThemePreference, subscribeThemeMode } = await loadThemeModeModule()

  const observedModes = []
  const unsubscribe = subscribeThemeMode((mode) => {
    observedModes.push(mode)
  })

  setThemeMode('dark')
  setThemePreference('system')
  runtime.mediaQueryList.dispatch(true)
  runtime.mediaQueryList.dispatch(false)
  unsubscribe()

  setThemeMode('dark')

  assert.deepEqual(observedModes, ['dark', 'light', 'dark', 'light'])
})

test('subscribeThemePreference emits preference changes even when effective mode stays the same', async () => {
  installThemeRuntime({
    storedPreference: 'light',
    systemDark: false,
  })
  const { setThemeMode, setThemePreference, subscribeThemePreference } = await loadThemeModeModule()

  const observedPreferences = []
  const unsubscribe = subscribeThemePreference((preference) => {
    observedPreferences.push(preference)
  })

  setThemePreference('system')
  setThemeMode('dark')
  unsubscribe()
  setThemePreference('light')

  assert.deepEqual(observedPreferences, ['system', 'dark'])
})
