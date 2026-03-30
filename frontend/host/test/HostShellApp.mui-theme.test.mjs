import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let hostModulePromise = null

class MemoryStorage {
  #store = new Map()

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null
  }

  setItem(key, value) {
    this.#store.set(key, String(value))
  }
}

async function loadHostModule() {
  if (!hostModulePromise) {
    hostModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(repoRoot, '.tmp-host-mui-theme-test-'))
      const outfile = path.join(tempDir, 'host-index.mjs')
      await esbuild.build({
        entryPoints: [path.join(repoRoot, 'frontend/host/index.ts')],
        bundle: true,
        format: 'esm',
        platform: 'node',
        jsx: 'automatic',
        target: 'node20',
        outfile,
        external: ['react', 'react-dom', 'react-dom/server', 'electron', '@mui/*', '@emotion/*'],
        loader: {
          '.ts': 'ts',
          '.tsx': 'tsx',
          '.css': 'text',
        },
      })

      return import(pathToFileURL(outfile).href)
    })()
  }

  return hostModulePromise
}

function installDomStub(mode = 'dark') {
  const storage = new MemoryStorage()
  globalThis.window = {
    localStorage: storage,
    matchMedia: () => ({ matches: mode === 'dark' }),
  }
  globalThis.document = {
    documentElement: {
      getAttribute: (name) => (name === 'data-presto-theme' ? mode : null),
      setAttribute: () => {},
    },
  }
}

test.afterEach(() => {
  delete globalThis.window
  delete globalThis.document
})

test('host shell provides an MUI css baseline derived from shared theme mode', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  installDomStub('dark')

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('home'),
      developerPresto: {},
      developerRuntime: {},
      pluginHomeEntries: [],
      pluginPages: [],
      pluginManagerModel: {
        managedRoot: null,
        plugins: [],
        issues: [],
        settingsEntries: [],
      },
    }),
  )

  assert.match(markup, /data-emotion="css-global/)
  assert.doesNotMatch(markup, /background-color:#0c0e17/)
  assert.match(markup, /background-color:/)
  assert.match(markup, /font-family:/)
})
