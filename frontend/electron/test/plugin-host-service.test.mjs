import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const serviceEntry = path.join(repoRoot, 'frontend/runtime/pluginHostService.ts')

let serviceModulePromise = null

async function loadServiceModule() {
  if (!serviceModulePromise) {
    serviceModulePromise = (async () => {
      const outDir = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-service-test-'))
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

async function createPluginFixture(root, options = {}) {
  const pluginRoot = path.join(root, options.folderName ?? 'plugin')
  await mkdir(path.join(pluginRoot, 'dist'), { recursive: true })
  const pluginId = options.pluginId ?? 'plugin.example.import'
  const requiredCapabilities = options.requiredCapabilities ?? ['system.health']
  const supportedDaws = options.supportedDaws ?? ['pro_tools']
  const pages =
    options.pages ??
    [
      {
        pageId: 'page.main',
        path: '/plugin/example',
        title: 'Example',
        mount: 'workspace',
        componentExport: 'ExamplePage',
      },
    ]
  const navigationItems = options.navigationItems ?? []
  const entrySource =
    options.entrySource ??
    `
export const manifest = { pluginId: ${JSON.stringify(pluginId)} }
export async function activate() {}
`

  const manifest = {
    pluginId,
    extensionType: options.extensionType ?? 'workflow',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    supportedDaws,
    uiRuntime: 'react18',
    displayName: options.displayName ?? 'Plugin Example',
    entry: 'dist/index.mjs',
    pages,
    automationItems: options.automationItems ?? [],
    settingsPages: options.settingsPages ?? [],
    navigationItems,
    workflowDefinition:
      options.extensionType === 'automation'
        ? undefined
        : (options.workflowDefinition ?? {
            workflowId: `${pluginId}.run`,
            inputSchemaId: `${pluginId}.input.v1`,
            definitionEntry: 'dist/workflow-definition.json',
          }),
    requiredCapabilities,
    adapterModuleRequirements: options.adapterModuleRequirements ?? [],
    capabilityRequirements: options.capabilityRequirements ?? [],
  }

  await writeFile(path.join(pluginRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
  await writeFile(path.join(pluginRoot, 'dist/index.mjs'), entrySource)
  if (manifest.extensionType === 'workflow') {
    await writeFile(
      path.join(pluginRoot, 'dist/workflow-definition.json'),
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
    )
  }
  return pluginRoot
}

test('plugin host service lists plugins and exposes structured issues', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-list-'))
  const managedRoot = path.join(sandbox, 'managed')
  const extrasRoot = path.join(sandbox, 'extras')
  await mkdir(extrasRoot, { recursive: true })

  await createPluginFixture(managedRoot, { folderName: 'good-plugin', pluginId: 'plugin.good' })
  await createPluginFixture(extrasRoot, {
    folderName: 'perm-plugin',
    pluginId: 'plugin.perm',
    requiredCapabilities: ['system.health', '__unsupported.capability__'],
  })
  await createPluginFixture(extrasRoot, {
    folderName: 'daw-plugin',
    pluginId: 'plugin.daw',
    supportedDaws: ['logic_pro'],
  })
  await createPluginFixture(extrasRoot, {
    folderName: 'load-plugin',
    pluginId: 'plugin.load',
    entrySource: `throw new Error('broken_entry_load')`,
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    discoveryRoots: [extrasRoot],
    currentDaw: 'pro_tools',
  })

  const result = await service.listPlugins()
  assert.equal(result.managedPluginsRoot, path.resolve(managedRoot))
  assert.equal(result.plugins.some((plugin) => plugin.pluginId === 'plugin.good'), true)
  assert.equal(result.plugins.some((plugin) => plugin.pluginId === 'plugin.load' && plugin.loadable === false), true)
  assert.equal(result.issues.some((issue) => issue.category === 'permission'), true)
  assert.equal(result.issues.some((issue) => issue.category === 'daw_support'), true)
  assert.equal(result.issues.some((issue) => issue.category === 'entry_load'), true)
})

test('plugin host service installs from local directory and reports root path', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-install-dir-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })
  const sourcePluginRoot = await createPluginFixture(sourceRoot, {
    folderName: 'import-plugin',
    pluginId: 'plugin.import.workflow',
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  assert.equal(service.getManagedPluginsRoot(), path.resolve(managedRoot))
  const installed = await service.installFromDirectory({ selectedPath: sourcePluginRoot })
  assert.equal(installed.ok, true)
  assert.equal(installed.plugin?.pluginId, 'plugin.import.workflow')

  const installedManifestPath = path.join(managedRoot, 'plugin.import.workflow', 'manifest.json')
  const manifestRaw = await readFile(installedManifestPath, 'utf8')
  assert.match(manifestRaw, /"pluginId": "plugin.import.workflow"/)
})

test('plugin host service copies installed workflow extensions into the managed extensions root', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-managed-root-'))
  const managedRoot = path.join(sandbox, 'extensions')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })
  const sourcePluginRoot = await createPluginFixture(sourceRoot, {
    folderName: 'export-plugin',
    pluginId: 'plugin.export.workflow',
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  const installed = await service.installFromDirectory({ selectedPath: sourcePluginRoot })
  assert.equal(installed.ok, true)
  assert.equal(installed.managedPluginsRoot, path.resolve(managedRoot))

  const copiedManifestPath = path.join(managedRoot, 'plugin.export.workflow', 'manifest.json')
  const copiedManifestRaw = await readFile(copiedManifestPath, 'utf8')
  assert.match(copiedManifestRaw, /"pluginId": "plugin.export.workflow"/)
})

test('plugin host service exposes declarative workflow settings schemas without settings-mounted pages', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-settings-meta-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })

  await createPluginFixture(sourceRoot, {
    folderName: 'settings-plugin',
    pluginId: 'plugin.settings.example',
    pages: [
      {
        pageId: 'page.workspace',
        path: '/plugin/settings-example',
        title: 'Settings Example',
        mount: 'workspace',
        componentExport: 'ExamplePage',
      },
    ],
    settingsPages: [
      {
        pageId: 'page.settings',
        title: 'Settings Example',
        order: 30,
        storageKey: 'settings.v1',
        loadExport: 'loadSettings',
        saveExport: 'saveSettings',
        defaults: {
          mode: 'fast',
          enabled: true,
        },
        sections: [
          {
            sectionId: 'defaults',
            title: 'Defaults',
            fields: [
              {
                fieldId: 'enabled',
                kind: 'toggle',
                label: 'Enabled',
                path: 'enabled',
              },
              {
                fieldId: 'mode',
                kind: 'select',
                label: 'Mode',
                path: 'mode',
                options: [
                  { value: 'fast', label: 'Fast' },
                  { value: 'safe', label: 'Safe' },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    discoveryRoots: [sourceRoot],
    currentDaw: 'pro_tools',
  })

  const result = await service.listPlugins()
  const plugin = result.plugins.find((item) => item.pluginId === 'plugin.settings.example')

  assert.ok(plugin)
  assert.deepEqual(plugin.settingsPages, [
    {
      pageId: 'page.settings',
      title: 'Settings Example',
      order: 30,
      storageKey: 'settings.v1',
      loadExport: 'loadSettings',
      saveExport: 'saveSettings',
      defaults: {
        mode: 'fast',
        enabled: true,
      },
      sections: [
        {
          sectionId: 'defaults',
          title: 'Defaults',
          fields: [
            {
              fieldId: 'enabled',
              kind: 'toggle',
              label: 'Enabled',
              path: 'enabled',
            },
            {
              fieldId: 'mode',
              kind: 'select',
              label: 'Mode',
              path: 'mode',
              options: [
                { value: 'fast', label: 'Fast' },
                { value: 'safe', label: 'Safe' },
              ],
            },
          ],
        },
      ],
    },
  ])
  assert.equal('settingsNavigationItems' in plugin, false)
})

test('plugin host service preserves adapter and capability requirements from plugin manifests', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-requirements-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })

  await createPluginFixture(sourceRoot, {
    folderName: 'requirements-plugin',
    pluginId: 'plugin.requirements.example',
    adapterModuleRequirements: [{ moduleId: 'session', minVersion: '2025.10.0' }],
    capabilityRequirements: [{ capabilityId: 'session.getInfo', minVersion: '2025.10.0' }],
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    discoveryRoots: [sourceRoot],
    currentDaw: 'pro_tools',
  })

  const result = await service.listPlugins()
  const plugin = result.plugins.find((item) => item.pluginId === 'plugin.requirements.example')

  assert.ok(plugin)
  assert.deepEqual(plugin.manifest.adapterModuleRequirements, [{ moduleId: 'session', minVersion: '2025.10.0' }])
  assert.deepEqual(plugin.manifest.capabilityRequirements, [{ capabilityId: 'session.getInfo', minVersion: '2025.10.0' }])
})

test('plugin host service persists enabled state for managed plugins', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-enabled-state-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })

  const sourcePluginRoot = await createPluginFixture(sourceRoot, {
    folderName: 'managed-plugin',
    pluginId: 'plugin.managed.toggle',
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  const installed = await service.installFromDirectory({ selectedPath: sourcePluginRoot })
  assert.equal(installed.ok, true)
  assert.equal(installed.plugin?.enabled, true)

  const initialList = await service.listPlugins()
  assert.equal(initialList.plugins.find((plugin) => plugin.pluginId === 'plugin.managed.toggle')?.enabled, true)

  const disabled = await service.setEnabled('plugin.managed.toggle', false)
  assert.equal(disabled.ok, true)
  assert.equal(disabled.enabled, false)

  const disabledList = await service.listPlugins()
  assert.equal(disabledList.plugins.find((plugin) => plugin.pluginId === 'plugin.managed.toggle')?.enabled, false)

  const reloadedService = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })
  const persistedList = await reloadedService.listPlugins()
  assert.equal(persistedList.plugins.find((plugin) => plugin.pluginId === 'plugin.managed.toggle')?.enabled, false)

  const reenabled = await reloadedService.setEnabled('plugin.managed.toggle', true)
  assert.equal(reenabled.ok, true)
  assert.equal(reenabled.enabled, true)

  const finalList = await reloadedService.listPlugins()
  assert.equal(finalList.plugins.find((plugin) => plugin.pluginId === 'plugin.managed.toggle')?.enabled, true)
})

test('plugin host service uninstalls managed plugins and blocks official plugin uninstall', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-uninstall-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  const extrasRoot = path.join(sandbox, 'extras')
  await mkdir(sourceRoot, { recursive: true })
  await mkdir(extrasRoot, { recursive: true })

  const installedSourcePluginRoot = await createPluginFixture(sourceRoot, {
    folderName: 'managed-plugin',
    pluginId: 'plugin.managed.cleanup',
  })
  await createPluginFixture(extrasRoot, {
    folderName: 'official-plugin',
    pluginId: 'official.reference',
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  const installed = await service.installFromDirectory({ selectedPath: installedSourcePluginRoot })
  assert.equal(installed.ok, true)

  await service.syncOfficialExtensions({ officialExtensionsRoot: extrasRoot })

  const uninstallResult = await service.uninstall('plugin.managed.cleanup')
  assert.equal(uninstallResult.ok, true)
  assert.equal(uninstallResult.pluginId, 'plugin.managed.cleanup')

  const postUninstall = await service.listPlugins()
  assert.equal(postUninstall.plugins.some((plugin) => plugin.pluginId === 'plugin.managed.cleanup'), false)
  assert.equal(postUninstall.plugins.some((plugin) => plugin.pluginId === 'official.reference'), true)

  const officialUninstall = await service.uninstall('official.reference')
  assert.equal(officialUninstall.ok, false)
  assert.equal(officialUninstall.pluginId, 'official.reference')
  assert.equal(officialUninstall.issues.some((issue) => issue.reason === 'official_plugin_cannot_be_uninstalled'), true)

  const postOfficialUninstall = await service.listPlugins()
  assert.equal(postOfficialUninstall.plugins.some((plugin) => plugin.pluginId === 'official.reference'), true)
})

test('plugin host service reseeds official extensions when the managed copy is missing', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-official-seed-'))
  const managedRoot = path.join(sandbox, 'managed')
  const officialRoot = path.join(sandbox, 'official')
  await mkdir(officialRoot, { recursive: true })

  await createPluginFixture(officialRoot, {
    folderName: 'official-import',
    pluginId: 'official.import-workflow',
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  await service.syncOfficialExtensions({ officialExtensionsRoot: officialRoot })

  const seededManifest = await readFile(path.join(managedRoot, 'official.import-workflow', 'manifest.json'), 'utf8')
  assert.match(seededManifest, /"pluginId": "official.import-workflow"/)

  await rm(path.join(managedRoot, 'official.import-workflow'), { recursive: true, force: true })
  await service.syncOfficialExtensions({ officialExtensionsRoot: officialRoot })

  const reseededManifest = await readFile(path.join(managedRoot, 'official.import-workflow', 'manifest.json'), 'utf8')
  assert.match(reseededManifest, /"pluginId": "official.import-workflow"/)
})

test('plugin host service refreshes seeded official extensions when package contents change without a version bump', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-official-refresh-'))
  const managedRoot = path.join(sandbox, 'managed')
  const officialRoot = path.join(sandbox, 'official')
  const pluginRoot = await createPluginFixture(officialRoot, {
    folderName: 'official-import',
    pluginId: 'official.import-workflow',
    requiredCapabilities: ['import.run.start'],
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  await service.syncOfficialExtensions({ officialExtensionsRoot: officialRoot })

  await writeFile(
    path.join(pluginRoot, 'manifest.json'),
    JSON.stringify(
      {
        pluginId: 'official.import-workflow',
        extensionType: 'workflow',
        version: '1.0.0',
        hostApiVersion: '0.1.0',
        supportedDaws: ['pro_tools'],
        uiRuntime: 'react18',
        displayName: 'Plugin Example',
        entry: 'dist/index.mjs',
        workflowDefinition: {
          workflowId: 'official.import-workflow.run',
          inputSchemaId: 'official.import-workflow.input.v1',
          definitionEntry: 'dist/workflow-definition.json',
        },
        pages: [
          {
            pageId: 'page.main',
            path: '/plugin/example',
            title: 'Example',
            mount: 'workspace',
            componentExport: 'ExamplePage',
          },
        ],
        automationItems: [],
        settingsPages: [],
        navigationItems: [],
        requiredCapabilities: ['system.health', 'import.analyze', 'import.cache.save', 'import.run.start'],
        adapterModuleRequirements: [],
        capabilityRequirements: [],
      },
      null,
      2,
    ),
  )

  await service.syncOfficialExtensions({ officialExtensionsRoot: officialRoot })

  const refreshedManifest = await readFile(path.join(managedRoot, 'official.import-workflow', 'manifest.json'), 'utf8')
  assert.match(refreshedManifest, /"import\.analyze"/)
  assert.match(refreshedManifest, /"import\.cache\.save"/)
})

test('plugin host service refreshes official extensions when legacy seed state stores only version strings', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-official-legacy-seed-'))
  const managedRoot = path.join(sandbox, 'managed')
  const officialRoot = path.join(sandbox, 'official')
  const pluginRoot = await createPluginFixture(officialRoot, {
    folderName: 'official-import',
    pluginId: 'official.import-workflow',
    requiredCapabilities: ['import.run.start'],
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  await mkdir(path.join(managedRoot, 'official.import-workflow', 'dist'), { recursive: true })
  await writeFile(
    path.join(managedRoot, 'official.import-workflow', 'manifest.json'),
    JSON.stringify(
      {
        pluginId: 'official.import-workflow',
        extensionType: 'workflow',
        version: '1.0.0',
        hostApiVersion: '0.1.0',
        supportedDaws: ['pro_tools'],
        uiRuntime: 'react18',
        displayName: 'Plugin Example',
        entry: 'dist/index.mjs',
        workflowDefinition: {
          workflowId: 'official.import-workflow.run',
          inputSchemaId: 'official.import-workflow.input.v1',
          definitionEntry: 'dist/workflow-definition.json',
        },
        pages: [],
        automationItems: [],
        settingsPages: [],
        navigationItems: [],
        requiredCapabilities: ['legacy.capability'],
        adapterModuleRequirements: [],
        capabilityRequirements: [],
      },
      null,
      2,
    ),
  )
  await writeFile(path.join(managedRoot, '.presto-official-extension-seed-state.json'), JSON.stringify({
    'official.import-workflow': '1.0.0',
  }))

  await writeFile(
    path.join(pluginRoot, 'manifest.json'),
    JSON.stringify(
      {
        pluginId: 'official.import-workflow',
        extensionType: 'workflow',
        version: '1.0.0',
        hostApiVersion: '0.1.0',
        supportedDaws: ['pro_tools'],
        uiRuntime: 'react18',
        displayName: 'Plugin Example',
        entry: 'dist/index.mjs',
        workflowDefinition: {
          workflowId: 'official.import-workflow.run',
          inputSchemaId: 'official.import-workflow.input.v1',
          definitionEntry: 'dist/workflow-definition.json',
        },
        pages: [
          {
            pageId: 'page.main',
            path: '/plugin/example',
            title: 'Example',
            mount: 'workspace',
            componentExport: 'ExamplePage',
          },
        ],
        automationItems: [],
        settingsPages: [],
        navigationItems: [],
        requiredCapabilities: ['import.run.start', 'track.rename'],
        adapterModuleRequirements: [],
        capabilityRequirements: [],
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(pluginRoot, 'dist/index.mjs'),
    `
export const manifest = {
  pluginId: 'official.import-workflow',
  extensionType: 'workflow',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: ['pro_tools'],
  uiRuntime: 'react18',
  displayName: 'Plugin Example',
  entry: 'dist/index.mjs',
  workflowDefinition: {
    workflowId: 'official.import-workflow.run',
    inputSchemaId: 'official.import-workflow.input.v1',
    definitionEntry: 'dist/workflow-definition.json',
  },
  pages: [
    {
      pageId: 'page.main',
      path: '/plugin/example',
      title: 'Example',
      mount: 'workspace',
      componentExport: 'ExamplePage',
    },
  ],
  automationItems: [],
  settingsPages: [],
  navigationItems: [],
  requiredCapabilities: ['import.run.start', 'track.rename'],
  adapterModuleRequirements: [],
  capabilityRequirements: [],
}

export async function activate() {}
`,
  )
  await writeFile(
    path.join(pluginRoot, 'dist/workflow-definition.json'),
    JSON.stringify(
      {
        workflowId: 'official.import-workflow.run',
        version: '1.0.0',
        inputSchemaId: 'official.import-workflow.input.v1',
        steps: [
          {
            stepId: 'rename',
            usesCapability: 'track.rename',
            input: {
              currentName: { $ref: 'input.currentName' },
              newName: { $ref: 'input.newName' },
            },
          },
        ],
      },
      null,
      2,
    ),
  )

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  await service.syncOfficialExtensions({ officialExtensionsRoot: officialRoot })

  const refreshedManifest = await readFile(path.join(managedRoot, 'official.import-workflow', 'manifest.json'), 'utf8')
  assert.match(refreshedManifest, /"track\.rename"/)
  assert.doesNotMatch(refreshedManifest, /"legacy\.capability"/)
})

test('plugin host service resolves trusted workflow execution payload from installed plugin metadata', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-workflow-resolution-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })
  const sourcePluginRoot = await createPluginFixture(sourceRoot, {
    folderName: 'import-plugin',
    pluginId: 'official.import-workflow',
    requiredCapabilities: ['workflow.run.start', 'track.rename', 'session.save'],
    workflowDefinitionSource: JSON.stringify(
      {
        workflowId: 'official.import-workflow.run',
        version: '1.0.0',
        inputSchemaId: 'official.import-workflow.input.v1',
        steps: [
          {
            stepId: 'rename',
            usesCapability: 'track.rename',
            input: {
              currentName: { $ref: 'input.currentName' },
              newName: { $ref: 'input.newName' },
            },
          },
          {
            stepId: 'save',
            usesCapability: 'session.save',
            input: {},
          },
        ],
      },
      null,
      2,
    ),
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  const installed = await service.installFromDirectory({ selectedPath: sourcePluginRoot })
  assert.equal(installed.ok, true)

  const resolved = await service.resolveWorkflowExecution({
    pluginId: 'official.import-workflow',
    workflowId: 'official.import-workflow.run',
  })

  assert.deepEqual(resolved.allowedCapabilities, ['workflow.run.start', 'track.rename', 'session.save'])
  assert.equal(resolved.definition.workflowId, 'official.import-workflow.run')
  assert.equal(resolved.definition.steps[0]?.usesCapability, 'track.rename')
  assert.equal(resolved.definition.steps[1]?.usesCapability, 'session.save')
})

test('plugin host service blocks workflow execution resolution for disabled plugins', async (t) => {
  const { createPluginHostService } = await loadServiceModule()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-disabled-workflow-'))
  const managedRoot = path.join(sandbox, 'managed')
  const sourceRoot = path.join(sandbox, 'source')
  await mkdir(sourceRoot, { recursive: true })

  const sourcePluginRoot = await createPluginFixture(sourceRoot, {
    folderName: 'workflow-plugin',
    pluginId: 'plugin.workflow.disabled',
    requiredCapabilities: ['workflow.run.start'],
    workflowDefinition: {
      workflowId: 'plugin.workflow.disabled.run',
      inputSchemaId: 'plugin.workflow.disabled.input.v1',
      definitionEntry: 'dist/workflow-definition.json',
    },
    workflowDefinitionSource: JSON.stringify(
      {
        workflowId: 'plugin.workflow.disabled.run',
        version: '1.0.0',
        inputSchemaId: 'plugin.workflow.disabled.input.v1',
        steps: [
          {
            stepId: 'run',
            usesCapability: 'workflow.run.start',
            input: {},
          },
        ],
      },
      null,
      2,
    ),
  })

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const service = createPluginHostService({
    managedPluginsRoot: managedRoot,
    currentDaw: 'pro_tools',
  })

  const installed = await service.installFromDirectory({ selectedPath: sourcePluginRoot })
  assert.equal(installed.ok, true)

  const disabled = await service.setEnabled('plugin.workflow.disabled', false)
  assert.equal(disabled.ok, true)

  await assert.rejects(
    () =>
      service.resolveWorkflowExecution({
        pluginId: 'plugin.workflow.disabled',
        workflowId: 'plugin.workflow.disabled.run',
      }),
    /plugin_disabled:plugin\.workflow\.disabled/,
  )
})
