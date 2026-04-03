import assert from 'node:assert/strict'
import { access, cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

let installationModulePromise = null

async function loadInstallationModule() {
  if (!installationModulePromise) {
    installationModulePromise = (async () => {
      const entry = path.join(repoRoot, 'host-plugin-runtime/src/installation/pluginManagement.ts')
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
        throw new Error('Failed to compile pluginManagement.ts')
      }
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      return import(moduleUrl)
    })()
  }

  return installationModulePromise
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function createPluginFixture(parentDir, options = {}) {
  const pluginId = options.pluginId ?? 'plugin.test.install'
  const displayName = options.displayName ?? 'Plugin Install Test'
  const extensionType = options.extensionType ?? 'workflow'
  const entryFileContent =
    options.entryFileContent ??
    `export const manifest = ${JSON.stringify({
      pluginId,
      extensionType,
      version: '1.0.0',
      hostApiVersion: '1.0.0',
      supportedDaws: options.supportedDaws ?? ['pro_tools'],
      uiRuntime: 'react18',
      displayName,
      entry: 'dist/index.js',
      workflowDefinition: extensionType === 'workflow'
        ? {
            workflowId: `${pluginId}.run`,
            inputSchemaId: `${pluginId}.input.v1`,
            definitionEntry: 'dist/workflow-definition.json',
          }
        : undefined,
      pages: [
        {
          pageId: 'main',
          path: '/plugin',
          title: 'Plugin',
          mount: 'workspace',
          componentExport: 'MainPage',
        },
      ],
      requiredCapabilities: ['system.health'],
    })}\nexport async function activate() {}\nexport const MainPage = () => null\n`

  const pluginRoot = path.join(parentDir, options.folderName ?? pluginId)
  const distDir = path.join(pluginRoot, 'dist')
  await mkdir(distDir, { recursive: true })

  const manifest =
    options.manifest ??
    {
      pluginId,
      extensionType,
      version: '1.0.0',
      hostApiVersion: '1.0.0',
      supportedDaws: options.supportedDaws ?? ['pro_tools'],
      uiRuntime: 'react18',
      displayName,
      entry: 'dist/index.js',
      workflowDefinition: extensionType === 'workflow'
        ? {
            workflowId: `${pluginId}.run`,
            inputSchemaId: `${pluginId}.input.v1`,
            definitionEntry: 'dist/workflow-definition.json',
          }
        : undefined,
      pages: [
        {
          pageId: 'main',
          path: '/plugin',
          title: 'Plugin',
          mount: 'workspace',
          componentExport: 'MainPage',
        },
      ],
      requiredCapabilities: ['system.health'],
    }

  await writeFile(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  await writeFile(path.join(distDir, 'index.js'), entryFileContent, 'utf8')
  if (extensionType === 'workflow' && manifest.workflowDefinition) {
    await writeFile(
      path.join(distDir, 'workflow-definition.json'),
      options.workflowDefinitionSource ??
        JSON.stringify(
          {
            workflowId: manifest.workflowDefinition.workflowId,
            version: '1.0.0',
            inputSchemaId: manifest.workflowDefinition.inputSchemaId,
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
  }

  return { pluginRoot, pluginId }
}

test('installPluginFromDirectory installs a validated plugin into managed root', async () => {
  const { installPluginFromDirectory } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-dir-'))
  const sourceParent = path.join(workspaceRoot, 'source')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(sourceParent, { recursive: true })
  await mkdir(managedRoot, { recursive: true })
  const { pluginRoot, pluginId } = await createPluginFixture(sourceParent)

  const result = await installPluginFromDirectory({
    sourcePath: pluginRoot,
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
  })

  assert.equal(result.ok, true)
  assert.equal(result.plugin.manifest.pluginId, pluginId)
  assert.equal(
    await pathExists(path.join(managedRoot, pluginId, 'manifest.json')),
    true,
  )
})

test('installPluginFromDirectory returns manifest category issues for invalid manifests', async () => {
  const { installPluginFromDirectory } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-manifest-'))
  const sourceParent = path.join(workspaceRoot, 'source')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(sourceParent, { recursive: true })
  await mkdir(managedRoot, { recursive: true })
  const { pluginRoot } = await createPluginFixture(sourceParent, {
    manifest: {
      pluginId: 'plugin.bad.manifest',
      version: '1.0.0',
      hostApiVersion: '1.0.0',
      supportedDaws: ['pro_tools'],
      uiRuntime: 'react18',
      entry: 'dist/index.js',
      pages: [],
      requiredCapabilities: ['system.health'],
    },
  })

  const result = await installPluginFromDirectory({
    sourcePath: pluginRoot,
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
  })

  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.category === 'manifest'))
})

test('installPluginFromZip installs plugin from extracted staging directory', async () => {
  const { installPluginFromZip } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-zip-'))
  const sourceParent = path.join(workspaceRoot, 'source')
  const managedRoot = path.join(workspaceRoot, 'managed')
  const zipPath = path.join(workspaceRoot, 'plugin.zip')
  await mkdir(sourceParent, { recursive: true })
  await mkdir(managedRoot, { recursive: true })
  const { pluginRoot, pluginId } = await createPluginFixture(sourceParent, {
    pluginId: 'plugin.test.zip',
  })
  await writeFile(zipPath, 'stub zip payload', 'utf8')

  const result = await installPluginFromZip({
    zipPath,
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
    extractZip: async (_sourceZipPath, destinationRoot) => {
      await cp(pluginRoot, path.join(destinationRoot, path.basename(pluginRoot)), { recursive: true })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.plugin.manifest.pluginId, pluginId)
  assert.equal(await pathExists(path.join(managedRoot, pluginId, 'manifest.json')), true)
})

test('discoverInstalledPlugins classifies entry/load failures', async () => {
  const { discoverInstalledPlugins } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-discovery-'))
  const officialRoot = path.join(workspaceRoot, 'official')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(officialRoot, { recursive: true })
  await mkdir(managedRoot, { recursive: true })

  await createPluginFixture(officialRoot, { pluginId: 'plugin.valid.official' })
  const broken = await createPluginFixture(managedRoot, {
    pluginId: 'plugin.broken.load',
    entryFileContent: 'export const noop = true\n',
  })

  const result = await discoverInstalledPlugins({
    officialRoots: [officialRoot],
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
  })

  assert.equal(result.plugins.length, 1)
  assert.equal(result.plugins[0]?.manifest.pluginId, 'plugin.valid.official')
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.category === 'entry_load' &&
        issue.pluginRoot === broken.pluginRoot &&
        issue.reason.includes('module_does_not_export_workflow_plugin_module'),
    ),
  )
})

test('discoverInstalledPlugins includes both official and managed roots in discovery', async () => {
  const { discoverInstalledPlugins } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-roots-'))
  const officialRoot = path.join(workspaceRoot, 'official')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(officialRoot, { recursive: true })
  await mkdir(managedRoot, { recursive: true })

  await createPluginFixture(officialRoot, { pluginId: 'plugin.official.root' })
  await createPluginFixture(managedRoot, { pluginId: 'plugin.managed.root' })

  const result = await discoverInstalledPlugins({
    officialRoots: [officialRoot],
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
  })

  const pluginIds = result.plugins.map((plugin) => plugin.manifest.pluginId).sort()
  assert.deepEqual(pluginIds, ['plugin.managed.root', 'plugin.official.root'])
  assert.deepEqual(result.issues, [])
})

test('installPluginFromDirectory classifies unsupported daw mismatches', async () => {
  const { installPluginFromDirectory } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-daw-'))
  const sourceParent = path.join(workspaceRoot, 'source')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(sourceParent, { recursive: true })
  await mkdir(managedRoot, { recursive: true })

  const { pluginRoot } = await createPluginFixture(sourceParent, {
    pluginId: 'plugin.unsupported.daw',
    supportedDaws: ['logic_pro'],
  })

  const result = await installPluginFromDirectory({
    sourcePath: pluginRoot,
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
  })

  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.category === 'unsupported_daw'))
})

test('installPluginFromDirectory removes copied plugin when load validation fails', async () => {
  const { installPluginFromDirectory } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-load-failure-'))
  const sourceParent = path.join(workspaceRoot, 'source')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(sourceParent, { recursive: true })
  await mkdir(managedRoot, { recursive: true })
  const { pluginRoot, pluginId } = await createPluginFixture(sourceParent, {
    pluginId: 'plugin.load.failure.cleanup',
    entryFileContent: 'export const bad = true\n',
  })

  const result = await installPluginFromDirectory({
    sourcePath: pluginRoot,
    managedRoot,
    currentDaw: 'pro_tools',
    isHostApiVersionCompatible: () => true,
  })

  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.category === 'entry_load'))
  assert.equal(await pathExists(path.join(managedRoot, pluginId)), false)
})

test('installPluginFromZip reports extractor failures as discovery issues', async () => {
  const { installPluginFromZip } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-zip-fail-'))
  const managedRoot = path.join(workspaceRoot, 'managed')
  const zipPath = path.join(workspaceRoot, 'plugin.zip')
  await mkdir(managedRoot, { recursive: true })
  await writeFile(zipPath, 'stub zip payload', 'utf8')

  const result = await installPluginFromZip({
    zipPath,
    managedRoot,
    isHostApiVersionCompatible: () => true,
    extractZip: async () => {
      throw new Error('zip broken')
    },
  })

  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.category === 'discovery'))
  assert.ok(result.issues.some((issue) => issue.reason.includes('zip_extract_failed:zip broken')))
})

test('installPluginFromDirectory respects allowOverwrite=false for existing plugin ids', async () => {
  const { installPluginFromDirectory } = await loadInstallationModule()
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-overwrite-'))
  const sourceParent = path.join(workspaceRoot, 'source')
  const managedRoot = path.join(workspaceRoot, 'managed')
  await mkdir(sourceParent, { recursive: true })
  await mkdir(managedRoot, { recursive: true })
  const { pluginRoot, pluginId } = await createPluginFixture(sourceParent, {
    pluginId: 'plugin.install.overwrite',
    displayName: 'Source Plugin',
  })
  await createPluginFixture(managedRoot, {
    folderName: pluginId,
    pluginId,
    displayName: 'Existing Plugin',
  })

  const result = await installPluginFromDirectory({
    sourcePath: pluginRoot,
    managedRoot,
    isHostApiVersionCompatible: () => true,
    allowOverwrite: false,
  })

  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.reason.includes('plugin_already_installed')))
  const existingManifest = JSON.parse(await readFile(path.join(managedRoot, pluginId, 'manifest.json'), 'utf8'))
  assert.equal(existingManifest.displayName, 'Existing Plugin')
})
