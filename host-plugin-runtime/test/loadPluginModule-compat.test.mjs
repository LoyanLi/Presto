import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

let loadPluginModulePromise = null

async function loadLoadPluginModule() {
  if (!loadPluginModulePromise) {
    loadPluginModulePromise = (async () => {
      const entry = path.join(repoRoot, 'host-plugin-runtime/src/loading/loadPluginModule.ts')
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
        throw new Error('Failed to compile loadPluginModule.ts')
      }
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      const loaded = await import(moduleUrl)
      return loaded.loadPluginModule
    })()
  }

  return loadPluginModulePromise
}

async function createModuleFixture() {
  const pluginRoot = await mkdtemp(path.join(tmpdir(), 'presto-load-module-'))
  const distDir = path.join(pluginRoot, 'dist')
  await mkdir(distDir, { recursive: true })
  const entryPath = path.join(distDir, 'index.js')
  await writeFile(
    entryPath,
    `export const manifest = {
      pluginId: 'plugin.test.load',
      version: '1.0.0',
      hostApiVersion: '1.0.0',
      supportedDaws: ['pro_tools'],
      uiRuntime: 'react18',
      displayName: 'Load Test Plugin',
      entry: 'dist/index.js',
      pages: [],
      requiredCapabilities: ['system.health'],
    }
    export async function activate() {}
    `,
    'utf8',
  )
  return { entryPath }
}

test('loadPluginModule keeps existing entryPath behavior', async () => {
  const loadPluginModule = await loadLoadPluginModule()
  const { entryPath } = await createModuleFixture()

  const result = await loadPluginModule({ entryPath })
  assert.equal(result.ok, true)
  assert.equal(result.module?.manifest?.pluginId, 'plugin.test.load')
})

test('loadPluginModule supports renderer-style entryUrl with custom importer', async () => {
  const loadPluginModule = await loadLoadPluginModule()
  const { entryPath } = await createModuleFixture()
  const entryUrl = pathToFileURL(entryPath).href

  const result = await loadPluginModule({
    entryUrl,
    importModule: (specifier) => import(specifier),
  })

  assert.equal(result.ok, true)
  assert.equal(result.module?.manifest?.pluginId, 'plugin.test.load')
})

test('loadPluginModule returns structured issue when neither entryPath nor entryUrl is provided', async () => {
  const loadPluginModule = await loadLoadPluginModule()

  const result = await loadPluginModule({})
  assert.equal(result.ok, false)
  assert.equal(result.issue?.reason, 'entry_path_or_url_required')
})
