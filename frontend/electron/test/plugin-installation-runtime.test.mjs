import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const serviceEntry = path.join(repoRoot, 'frontend/electron/runtime/pluginHostService.ts')

let serviceModulePromise = null

async function loadServiceModule() {
  if (!serviceModulePromise) {
    serviceModulePromise = (async () => {
      const outDir = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-runtime-test-'))
      const outfile = path.join(outDir, 'pluginHostService.mjs')
      await esbuild.build({
        entryPoints: [serviceEntry],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        outfile,
      })
      return import(pathToFileURL(outfile).href)
    })()
  }
  return serviceModulePromise
}

async function writePluginFixture(pluginRoot, pluginId = 'plugin.zip.import') {
  await mkdir(path.join(pluginRoot, 'dist'), { recursive: true })
  await writeFile(
    path.join(pluginRoot, 'manifest.json'),
    JSON.stringify(
      {
        pluginId,
        extensionType: 'workflow',
        version: '1.0.0',
        hostApiVersion: '0.1.0',
        supportedDaws: ['pro_tools'],
        uiRuntime: 'react18',
        displayName: 'Zip Plugin',
        entry: 'dist/index.mjs',
        workflowDefinition: {
          workflowId: `${pluginId}.run`,
          inputSchemaId: `${pluginId}.input.v1`,
          definitionEntry: 'dist/workflow-definition.json',
        },
        pages: [
          {
            pageId: 'page.main',
            path: '/plugin/zip',
            title: 'Zip Plugin',
            mount: 'workspace',
            componentExport: 'ZipPluginPage',
          },
        ],
        requiredCapabilities: ['system.health'],
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(pluginRoot, 'dist/index.mjs'),
    `
export const manifest = { pluginId: ${JSON.stringify(pluginId)} }
export async function activate() {}
`,
  )
  await writeFile(
    path.join(pluginRoot, 'dist/workflow-definition.json'),
    JSON.stringify(
      {
        workflowId: `${pluginId}.run`,
        version: '1.0.0',
        inputSchemaId: `${pluginId}.input.v1`,
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
  )
}

test('plugin host service installs from zip through injected unzip implementation', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-install-zip-'))
  const managedRoot = path.join(sandbox, 'managed')
  const zipPath = path.join(sandbox, 'import-plugin.zip')
  const sourceRoot = path.join(sandbox, 'zip-source')
  const sourcePluginRoot = path.join(sourceRoot, 'plugin-from-zip')

  await mkdir(sourcePluginRoot, { recursive: true })
  await writePluginFixture(sourcePluginRoot, 'plugin.zip.workflow')
  await writeFile(zipPath, 'fake zip payload')

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
    unzip: async (_sourceZipPath, outputDir) => {
      await mkdir(outputDir, { recursive: true })
      const destination = path.join(outputDir, 'plugin-from-zip')
      await mkdir(destination, { recursive: true })
      await writePluginFixture(destination, 'plugin.zip.workflow')
    },
  })

  const result = await service.installFromZip({ zipPath })
  assert.equal(result.ok, true)
  assert.equal(result.plugin?.pluginId, 'plugin.zip.workflow')
  const manifestText = await readFile(path.join(managedRoot, 'plugin.zip.workflow', 'manifest.json'), 'utf8')
  assert.match(manifestText, /"pluginId": "plugin.zip.workflow"/)
})

test('plugin host service reports install error when unzip fails', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-install-zip-fail-'))
  const managedRoot = path.join(sandbox, 'managed')
  const zipPath = path.join(sandbox, 'broken-plugin.zip')
  await writeFile(zipPath, 'broken archive')

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    unzip: async () => {
      throw new Error('unzip_failed_for_test')
    },
  })

  const result = await service.installFromZip({ zipPath })
  assert.equal(result.ok, false)
  assert.equal(result.issues.some((issue) => issue.category === 'install'), true)
  assert.equal(result.issues.some((issue) => issue.reason.includes('unzip_failed_for_test')), true)
})
