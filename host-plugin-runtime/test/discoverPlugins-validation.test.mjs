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
  const manifest = {
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
    ...manifestOverrides,
  }
  if (requiredRuntimeServices !== undefined) {
    manifest.requiredRuntimeServices = requiredRuntimeServices
  }
  if (!Object.prototype.hasOwnProperty.call(manifestOverrides, 'workflowDefinition') && manifest.extensionType === 'workflow') {
    manifest.workflowDefinition = {
      workflowId: 'plugin.discovery.validation.run',
      inputSchemaId: 'plugin.discovery.validation.input.v1',
      definitionEntry: 'dist/workflow-definition.json',
    }
  }
  await writeFile(
    path.join(pluginRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )
  await writeFile(
    path.join(distDir, 'workflow-definition.json'),
    JSON.stringify(
      {
        workflowId: 'plugin.discovery.validation.run',
        version: '1.0.0',
        inputSchemaId: 'plugin.discovery.validation.input.v1',
        steps: [
          {
            stepId: 'health',
            usesCapability: 'system.health',
            input: {},
            saveAs: 'health',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  )
  return pluginRoot
}

test('discoverPlugins rejects manifests that declare runtime services', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(['macAccessibility.preflight'])

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
        issue.reason === 'permission_validation:requiredRuntimeServices:unsupported_field',
    ),
  )
})

test('discoverPlugins accepts manifests without runtime service declarations', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture()

  const result = await discoverPlugins({
    roots: [pluginRoot],
    isHostApiVersionCompatible: () => true,
    currentDaw: 'pro_tools',
  })

  assert.deepEqual(result.issues, [])
  assert.equal(result.plugins.length, 1)
  assert.equal(result.plugins[0]?.pluginRoot, pluginRoot)
})

test('discoverPlugins rejects workflow manifests without workflow definition reference', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(undefined, {
    workflowDefinition: null,
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
        issue.reason === 'manifest_validation:workflowDefinition:required_for_workflow_plugins',
    ),
  )
})

test('discoverPlugins rejects workflow definitions that use undeclared capabilities', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(undefined, {
    requiredCapabilities: ['system.health'],
  })
  await writeFile(
    path.join(pluginRoot, 'dist', 'workflow-definition.json'),
    JSON.stringify(
      {
        workflowId: 'plugin.discovery.validation.run',
        version: '1.0.0',
        inputSchemaId: 'plugin.discovery.validation.input.v1',
        steps: [
          {
            stepId: 'rename',
            usesCapability: 'track.rename',
            input: { currentName: 'A', newName: 'B' },
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  )

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
        issue.reason === 'manifest_validation:workflowDefinition:uses_capability_not_declared:track.rename',
    ),
  )
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
  const pluginRoot = await createPluginFixture(undefined, {
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

test('discoverPlugins accepts import workflow manifests that require backend import capabilities', async () => {
  const discoverPlugins = await loadDiscoverPlugins()
  const pluginRoot = await createPluginFixture(undefined, {
    pluginId: 'plugin.import.backend-boundary',
    requiredCapabilities: ['system.health', 'import.analyze', 'import.cache.save'],
    capabilityRequirements: [
      { capabilityId: 'import.analyze', minVersion: '2025.10.0' },
      { capabilityId: 'import.cache.save', minVersion: '2025.10.0' },
    ],
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
