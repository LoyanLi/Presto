import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

let discoverPluginsPromise = null

async function loadDiscoverPlugins() {
  if (!discoverPluginsPromise) {
    discoverPluginsPromise = (async () => {
      const entry = path.join(repoRoot, 'host-plugin-runtime/src/discovery/discoverPlugins.ts')
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
        throw new Error('Failed to compile discoverPlugins.ts')
      }
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      const loaded = await import(moduleUrl)
      return loaded.discoverPlugins
    })()
  }

  return discoverPluginsPromise
}

async function createPluginFixture(requiredRuntimeServices, manifestOverrides = {}) {
  const pluginRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-discovery-'))
  const distDir = path.join(pluginRoot, 'dist')
  await mkdir(distDir, { recursive: true })
  await writeFile(path.join(distDir, 'index.js'), 'export const MainPage = () => null\n', 'utf8')
  await writeFile(
    path.join(pluginRoot, 'manifest.json'),
    JSON.stringify({
      pluginId: 'plugin.discovery.validation',
      extensionType: 'workflow',
      version: '1.0.0',
      hostApiVersion: '1.0.0',
      supportedDaws: ['pro_tools'],
      uiRuntime: 'react18',
      displayName: 'Validation Test Plugin',
      entry: 'dist/index.js',
      pages: [
        {
          pageId: 'main',
          path: '/validation',
          title: 'Validation',
          mount: 'workspace',
          componentExport: 'MainPage',
        },
      ],
      requiredCapabilities: ['system.health'],
      requiredRuntimeServices,
      ...manifestOverrides,
    }, null, 2),
    'utf8',
  )
  return pluginRoot
}

test('discoverPlugins rejects manifests that declare unsupported runtime services', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(['macAccessibility.unsupported'])

  const result = await discoverPlugins({
    roots: [pluginRoot],
    isHostApiVersionCompatible: () => true,
    currentDaw: 'pro_tools',
  })

  assert.equal(result.plugins.length, 0)
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.pluginRoot === pluginRoot &&
        issue.reason === 'permission_validation:requiredRuntimeServices:unsupported_runtime_service:macAccessibility.unsupported',
    ),
  )
})

test('discoverPlugins accepts manifests that only declare formal runtime services', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture([
    'macAccessibility.preflight',
    'fs.readFile',
    'shell.openPath',
    'mobileProgress.updateSession',
  ])

  const result = await discoverPlugins({
    roots: [pluginRoot],
    isHostApiVersionCompatible: () => true,
    currentDaw: 'pro_tools',
  })

  assert.deepEqual(result.issues, [])
  assert.equal(result.plugins.length, 1)
  assert.equal(result.plugins[0]?.pluginRoot, pluginRoot)
})

test('discoverPlugins rejects manifests with malformed adapter module requirements', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(['fs.readFile'], {
    adapterModuleRequirements: [{ moduleId: 123, minVersion: true }],
  })

  const result = await discoverPlugins({
    roots: [pluginRoot],
    isHostApiVersionCompatible: () => true,
    currentDaw: 'pro_tools',
  })

  assert.equal(result.plugins.length, 0)
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.pluginRoot === pluginRoot &&
        issue.reason === 'manifest_validation:adapterModuleRequirements[0].moduleId:must_be_string',
    ),
  )
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.pluginRoot === pluginRoot &&
        issue.reason === 'manifest_validation:adapterModuleRequirements[0].minVersion:must_be_string',
    ),
  )
})

test('discoverPlugins accepts manifests with formal adapter and capability requirements', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(['fs.readFile'], {
    adapterModuleRequirements: [{ moduleId: 'export', minVersion: '2025.10.0' }],
    capabilityRequirements: [{ capabilityId: 'export.start', minVersion: '2025.10.0' }],
  })

  const result = await discoverPlugins({
    roots: [pluginRoot],
    isHostApiVersionCompatible: () => true,
    currentDaw: 'pro_tools',
  })

  assert.deepEqual(result.issues, [])
  assert.equal(result.plugins.length, 1)
  assert.equal(result.plugins[0]?.pluginRoot, pluginRoot)
})

test('discoverPlugins accepts manifests that request automation runtime services', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture([
    'automation.listDefinitions',
    'automation.runDefinition',
    'fs.readFile',
  ])

  const result = await discoverPlugins({
    roots: [pluginRoot],
    isHostApiVersionCompatible: () => true,
    currentDaw: 'pro_tools',
  })

  assert.deepEqual(result.issues, [])
  assert.equal(result.plugins.length, 1)
  assert.equal(result.plugins[0]?.pluginRoot, pluginRoot)
})
