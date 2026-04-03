import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-host-mui-theme-test-'))
      const outfile = path.join(tempDir, 'host-index.mjs')
      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
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
            '.png': 'dataurl',
          },
        })

        return await import(pathToFileURL(outfile).href)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
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

function renderHostMarkup(HostShellApp, createHostShellState, mode) {
  installDomStub(mode)
  return renderToStaticMarkup(
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
}

function getCssBaselineRuleSet(markup) {
  const match = markup.match(/<style data-emotion="css-global[^"]*">([\s\S]*?)<\/style>/)
  assert.ok(match, 'Expected css-global baseline style tag in rendered markup')
  return match[1]
}

function getBodyBackgroundColor(cssRuleSet) {
  const match = cssRuleSet.match(/body\{[^}]*background-color:([^;]+);/)
  assert.ok(match, 'Expected body background-color declaration in css baseline')
  return match[1].trim()
}

test.afterEach(() => {
  delete globalThis.window
  delete globalThis.document
})

test('host shell provides an MUI css baseline derived from shared theme mode', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const darkMarkup = renderHostMarkup(HostShellApp, createHostShellState, 'dark')
  const lightMarkup = renderHostMarkup(HostShellApp, createHostShellState, 'light')
  const darkCssBaseline = getCssBaselineRuleSet(darkMarkup)
  const lightCssBaseline = getCssBaselineRuleSet(lightMarkup)

  assert.match(darkMarkup, /data-emotion="css-global/)
  assert.match(darkCssBaseline, /color-scheme:dark/)
  assert.match(lightCssBaseline, /color-scheme:light/)
  assert.notEqual(getBodyBackgroundColor(darkCssBaseline), getBodyBackgroundColor(lightCssBaseline))
  assert.notEqual(getBodyBackgroundColor(darkCssBaseline), '#f7f8fc')
  assert.match(darkCssBaseline, /font-family:/)
})
