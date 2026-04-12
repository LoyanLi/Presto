import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let pluginHostRuntimePromise = null

async function loadPluginHostRuntime() {
  if (!pluginHostRuntimePromise) {
    pluginHostRuntimePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/pluginHostRuntime.ts',
      tempPrefix: '.tmp-plugin-host-runtime-test-',
      outfileName: 'plugin-host-runtime.mjs',
      loader: {
        '.css': 'text',
      },
    })
  }

  return pluginHostRuntimePromise
}

async function createWorkflowPluginFixture(root) {
  const pluginRoot = path.join(root, 'official.export-workflow')
  const entryPath = path.join(pluginRoot, 'dist/index.mjs')
  await mkdir(path.dirname(entryPath), { recursive: true })

  const manifest = {
    pluginId: 'official.export-workflow',
    extensionType: 'workflow',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    supportedDaws: ['pro_tools'],
    uiRuntime: 'react18',
    displayName: 'Export Workflow',
    description: 'Official export workflow plugin.',
    entry: 'dist/index.mjs',
    pages: [
      {
        pageId: 'export-workflow',
        path: '/plugins/export-workflow',
        title: 'Export Workflow',
        mount: 'workspace',
        componentExport: 'ExportWorkflowPage',
      },
    ],
    requiredCapabilities: ['daw.export.run.start'],
    adapterModuleRequirements: [],
    capabilityRequirements: [],
  }

  await writeFile(
    entryPath,
    `
      export const manifest = ${JSON.stringify(manifest, null, 2)}

      export async function activate() {}

      export function ExportWorkflowPage() {
        return null
      }
    `,
  )

  return {
    pluginId: manifest.pluginId,
    displayName: manifest.displayName,
    version: manifest.version,
    pluginRoot,
    entryPath,
    manifest,
    settingsPages: [],
    loadable: true,
  }
}

async function createAutomationPluginFixture(root) {
  const pluginRoot = path.join(root, 'installed.batch-ara-render')
  const entryPath = path.join(pluginRoot, 'dist/index.mjs')
  await mkdir(path.dirname(entryPath), { recursive: true })

  const manifest = {
    pluginId: 'installed.batch-ara-render',
    extensionType: 'automation',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    supportedDaws: ['pro_tools'],
    uiRuntime: 'react18',
    displayName: 'Batch ARA Render',
    description: 'Back up selected tracks and render ARA with a host-rendered automation card.',
    entry: 'dist/index.mjs',
    pages: [],
    automationItems: [
      {
        itemId: 'batch-ara-render.card',
        title: 'Batch ARA Render',
        automationType: 'batchAraRender',
        description: 'Duplicate, hide, inactivate, and render ARA.',
        order: 20,
        runnerExport: 'runBatchAraRender',
        optionsSchema: [
          {
            optionId: 'hideBackupTracks',
            kind: 'boolean',
            label: 'Hide backup tracks',
            defaultValue: true,
          },
          {
            optionId: 'renderPass',
            kind: 'select',
            label: 'Render pass',
            defaultValue: 'all',
            options: [
              { value: 'all', label: 'All passes' },
              { value: 'first', label: 'First pass only' },
            ],
          },
        ],
      },
    ],
    requiredCapabilities: ['daw.track.selection.get'],
    adapterModuleRequirements: [],
    capabilityRequirements: [],
  }

  await writeFile(
    entryPath,
    `
      export const manifest = ${JSON.stringify(manifest, null, 2)}

      export async function activate() {}

      export async function runBatchAraRender(context, input) {
        return {
          steps: [
            { id: 'preflight', status: 'succeeded', message: String(typeof context.macAccessibility?.preflight) },
            { id: 'input', status: 'succeeded', message: JSON.stringify(input) },
          ],
          summary: 'batch-ara-render-finished',
        }
      }
    `,
  )

  return {
    pluginId: manifest.pluginId,
    displayName: manifest.displayName,
    version: manifest.version,
    pluginRoot,
    entryPath,
    manifest,
    settingsPages: [],
    loadable: true,
  }
}

async function createToolPluginFixture(root) {
  const pluginRoot = path.join(root, 'installed.audio-tools')
  const entryPath = path.join(pluginRoot, 'dist/index.mjs')
  await mkdir(path.dirname(entryPath), { recursive: true })

  const manifest = {
    pluginId: 'installed.audio-tools',
    extensionType: 'tool',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    supportedDaws: ['pro_tools'],
    uiRuntime: 'react18',
    displayName: 'Audio Tools',
    description: 'Standalone host-side utility pages.',
    entry: 'dist/index.mjs',
    pages: [
      {
        pageId: 'tools.page.ec3',
        path: '/plugins/tools/ec3',
        title: 'EC3 Decode',
        mount: 'tools',
        componentExport: 'Ec3ToolPage',
      },
    ],
    tools: [
      {
        toolId: 'ec3-decode',
        pageId: 'tools.page.ec3',
        title: 'EC3 Decode',
        description: 'Decode EC3 assets.',
        runnerExport: 'runEc3Decode',
      },
    ],
    requiredCapabilities: [],
    adapterModuleRequirements: [],
    capabilityRequirements: [],
  }

  await writeFile(
    entryPath,
    `
      export const manifest = ${JSON.stringify(manifest, null, 2)}

      export async function activate() {}

      export async function runEc3Decode(context, input) {
        const execution = await context.process.execBundled('ec3-decode-script', ['--input', String(input.inputPath ?? '')])
        return {
          summary: 'ec3-decode-finished',
          result: {
            input,
            execution,
            hasDialog: typeof context.dialog?.openFile === 'function',
            hasFs: typeof context.fs?.readFile === 'function',
            hasShell: typeof context.shell?.openPath === 'function',
          },
        }
      }

      export function Ec3ToolPage() {
        return null
      }
    `,
  )

  return {
    pluginId: manifest.pluginId,
    displayName: manifest.displayName,
    version: manifest.version,
    pluginRoot,
    entryPath,
    manifest,
    settingsPages: [],
    loadable: true,
  }
}

test('loadHostPlugins keeps workflow plugins available when host only provides declared backend services', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRecord = await createWorkflowPluginFixture(sandbox)

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [pluginRecord],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {
      export: {
        run: {
          async start() {
            return { ok: true }
          },
        },
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/Exports'] }),
      },
    },
  })

  assert.deepEqual(result.managerModel.issues, [])
  assert.deepEqual(result.homeEntries, [
    {
      pluginId: 'official.export-workflow',
      pageId: 'export-workflow',
      title: 'Export Workflow',
      description: 'Official export workflow plugin.',
      actionLabel: 'Open Plugin',
    },
  ])
  assert.equal(result.managerModel.plugins[0]?.status, 'ready')
})

test('loadHostPlugins keeps disabled plugins in management while removing runtime surfaces', async () => {
  const { loadHostPlugins } = await loadPluginHostRuntime()

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: '/tmp/plugins',
      plugins: [
        {
          pluginId: 'official.import-workflow',
          displayName: 'Import Workflow',
          version: '1.0.0',
          pluginRoot: '/tmp/plugins/official.import-workflow',
          entryPath: '/tmp/plugins/official.import-workflow/dist/missing-entry.mjs',
          manifest: {
            pluginId: 'official.import-workflow',
            extensionType: 'workflow',
            version: '1.0.0',
            hostApiVersion: '0.1.0',
            supportedDaws: ['pro_tools'],
            uiRuntime: 'react18',
            displayName: 'Import Workflow',
            description: 'Official import workflow plugin.',
            entry: 'dist/missing-entry.mjs',
            pages: [
              {
                pageId: 'import-workflow.page.main',
                path: '/plugins/import-workflow',
                title: 'Import Workflow',
                mount: 'workspace',
                componentExport: 'ImportWorkflowPage',
              },
            ],
            settingsPages: [
              {
                pageId: 'import-workflow.page.settings',
                title: 'Import Workflow Settings',
                storageKey: 'workflow.import.settings',
                loadExport: 'loadSettings',
                saveExport: 'saveSettings',
                defaults: {
                  enabled: true,
                },
                sections: [],
              },
            ],
            requiredCapabilities: [],
            adapterModuleRequirements: [],
            capabilityRequirements: [],
          },
          settingsPages: [
            {
              pageId: 'import-workflow.page.settings',
              title: 'Import Workflow Settings',
              storageKey: 'workflow.import.settings',
              loadExport: 'loadSettings',
              saveExport: 'saveSettings',
              defaults: {
                enabled: true,
              },
              sections: [],
            },
          ],
          loadable: true,
          enabled: false,
        },
      ],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {},
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: true, paths: [] }),
      },
    },
  })

  assert.deepEqual(result.homeEntries, [])
  assert.deepEqual(result.automationEntries, [])
  assert.deepEqual(result.pages, [])
  assert.deepEqual(result.managerModel.settingsEntries, [])
  assert.deepEqual(result.managerModel.issues, [])
  assert.equal(result.managerModel.plugins[0]?.status, 'disabled')
  assert.equal(result.managerModel.plugins[0]?.enabled, false)
})

test('loadHostPlugins injects page-scoped host folder picking into workflow pages', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRecord = await createWorkflowPluginFixture(sandbox)

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [pluginRecord],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {},
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/Workflow/Exports'] }),
      },
    },
  })

  const renderedPage = result.pages[0]?.render()
  assert.equal(typeof renderedPage?.props?.host?.pickFolder, 'function')
  await assert.doesNotReject(() => renderedPage.props.host.pickFolder())
  await assert.deepEqual(await renderedPage.props.host.pickFolder(), {
    canceled: false,
    paths: ['/Workflow/Exports'],
  })
})

test('loadHostPlugins injects tool page host services and excludes tools from workflow home entries', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRecord = await createToolPluginFixture(sandbox)

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [pluginRecord],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {},
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/ignored'] }),
        openFile: async () => ({ canceled: false, paths: ['/input.wav'] }),
        openDirectory: async () => ({ canceled: false, paths: ['/output'] }),
      },
      fs: {
        readFile: async () => 'source',
        writeFile: async () => true,
        exists: async () => true,
        readdir: async () => ['a.wav'],
        deleteFile: async () => true,
      },
      shell: {
        openPath: async () => '',
        openExternal: async () => true,
      },
    },
  })

  assert.deepEqual(result.homeEntries, [])
  assert.equal(result.pages.length, 1)
  assert.equal(result.pages[0]?.mount, 'tools')
  const renderedPage = result.pages[0]?.render()
  assert.equal(typeof renderedPage?.props?.host?.dialog?.openFile, 'function')
  assert.equal(typeof renderedPage?.props?.host?.dialog?.openDirectory, 'function')
  assert.equal(typeof renderedPage?.props?.host?.fs?.readFile, 'function')
  assert.equal(typeof renderedPage?.props?.host?.shell?.openPath, 'function')
  await assert.deepEqual(await renderedPage?.props?.host?.dialog?.openFile(), {
    canceled: false,
    paths: ['/input.wav'],
  })
  await assert.deepEqual(await renderedPage?.props?.host?.dialog?.openDirectory(), {
    canceled: false,
    paths: ['/output'],
  })
})

test('loadHostPlugins runs tool pages through host-owned tool.run jobs', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRecord = await createToolPluginFixture(sandbox)
  const nowIso = new Date().toISOString()
  const jobsCreateCalls = []
  const jobsUpdateCalls = []
  const processCalls = []

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [pluginRecord],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {
      jobs: {
        async create(request) {
          jobsCreateCalls.push(request)
          return {
            job: {
              jobId: 'job-tool-1',
              capability: request.capability,
              targetDaw: request.targetDaw,
              state: request.state ?? 'queued',
              progress: request.progress ?? { phase: 'queued', current: 0, total: 1, percent: 0 },
              metadata: request.metadata,
              createdAt: nowIso,
            },
          }
        },
        async update(request) {
          jobsUpdateCalls.push(request)
          return {
            job: {
              jobId: request.jobId,
              capability: 'tool.run',
              targetDaw: 'pro_tools',
              state: request.state ?? 'running',
              progress: request.progress ?? { phase: 'running', current: 0, total: 1, percent: 10 },
              metadata: request.metadata,
              result: request.result,
              error: request.error,
              createdAt: nowIso,
              startedAt: request.startedAt,
              finishedAt: request.finishedAt,
            },
          }
        },
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/ignored'] }),
        openFile: async () => ({ canceled: false, paths: ['/input.wav'] }),
        openDirectory: async () => ({ canceled: false, paths: ['/output'] }),
      },
      fs: {
        readFile: async () => 'source',
        writeFile: async () => true,
        exists: async () => true,
        readdir: async () => ['a.wav'],
        deleteFile: async () => true,
      },
      shell: {
        openPath: async () => '',
        openExternal: async () => true,
      },
      process: {
        async execBundled(resourceId, args) {
          processCalls.push({ resourceId, args })
          return {
            ok: true,
            exitCode: 0,
            stdout: 'done',
            stderr: '',
          }
        },
      },
    },
  })

  const renderedPage = result.pages[0]?.render()
  assert.equal(typeof renderedPage?.props?.host?.runTool, 'function')

  const runResult = await renderedPage.props.host.runTool({
    toolId: 'ec3-decode',
    input: {
      inputPath: '/tmp/source.ec3',
    },
  })

  assert.equal(runResult.jobId, 'job-tool-1')
  assert.equal(runResult.job.capability, 'tool.run')
  assert.equal(runResult.job.state, 'succeeded')

  assert.equal(jobsCreateCalls.length, 1)
  assert.equal(jobsCreateCalls[0]?.capability, 'tool.run')
  assert.equal(jobsCreateCalls[0]?.metadata?.pluginId, 'installed.audio-tools')
  assert.equal(jobsCreateCalls[0]?.metadata?.toolId, 'ec3-decode')
  assert.equal(jobsCreateCalls[0]?.metadata?.toolTitle, 'EC3 Decode')
  assert.equal(jobsCreateCalls[0]?.metadata?.pageId, 'tools.page.ec3')

  assert.equal(jobsUpdateCalls.length, 2)
  assert.equal(jobsUpdateCalls[0]?.state, 'running')
  assert.equal(jobsUpdateCalls[1]?.state, 'succeeded')
  assert.equal(jobsUpdateCalls[1]?.result?.metrics?.toolId, 'ec3-decode')
  assert.equal(jobsUpdateCalls[1]?.result?.metrics?.toolLabel, 'EC3 Decode')

  assert.deepEqual(processCalls, [
    {
      resourceId: 'ec3-decode-script',
      args: ['--input', '/tmp/source.ec3'],
    },
  ])
})

test('loadHostPlugins keeps workflow library entries visible when the workflow page module fails to load', async () => {
  const { loadHostPlugins } = await loadPluginHostRuntime()

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: '/tmp/plugins',
      plugins: [
        {
          pluginId: 'official.export-workflow',
          displayName: 'Export Workflow',
          version: '1.0.0',
          pluginRoot: '/tmp/plugins/official.export-workflow',
          entryPath: '/tmp/plugins/official.export-workflow/dist/missing-entry.mjs',
          manifest: {
            pluginId: 'official.export-workflow',
            extensionType: 'workflow',
            version: '1.0.0',
            hostApiVersion: '0.1.0',
            supportedDaws: ['pro_tools'],
            uiRuntime: 'react18',
            displayName: 'Export Workflow',
            description: 'Official export workflow plugin.',
            entry: 'dist/missing-entry.mjs',
            pages: [
              {
                pageId: 'export-workflow.page.main',
                path: '/plugins/export-workflow',
                title: 'Export Workflow',
                mount: 'workspace',
                componentExport: 'ExportWorkflowPage',
              },
            ],
            settingsPages: [],
            requiredCapabilities: [],
            adapterModuleRequirements: [],
            capabilityRequirements: [],
          },
          settingsPages: [],
          loadable: true,
        },
      ],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {},
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: true, paths: [] }),
      },
    },
  })

  assert.deepEqual(result.homeEntries, [
    {
      pluginId: 'official.export-workflow',
      pageId: 'export-workflow.page.main',
      title: 'Export Workflow',
      description: 'Official export workflow plugin.',
      actionLabel: 'Open Plugin',
    },
  ])
  assert.equal(result.pages[0]?.pluginId, 'official.export-workflow')
  assert.equal(result.pages[0]?.pageId, 'export-workflow.page.main')
  assert.equal(result.managerModel.plugins[0]?.status, 'error')
  assert.match(result.managerModel.issues[0]?.reason ?? '', /missing-entry\.mjs|module_import_failed|Cannot find module/)
  assert.match(result.managerModel.issues[0]?.reason ?? '', /importUrl:/)
})

test('loadHostPlugins wires automation runner entries with host-rendered schema and macAccessibility runtime', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRecord = await createAutomationPluginFixture(sandbox)

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [pluginRecord],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {
      track: {
        selection: {
          async get() {
            return { trackNames: ['Lead Vox'] }
          },
        },
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/tmp'] }),
      },
      macAccessibility: {
        async preflight() {
          return { ok: true, trusted: true }
        },
        async runScript(script, args) {
          return { ok: true, stdout: JSON.stringify({ script, args }) }
        },
        async runFile(pathValue, args) {
          return { ok: true, stdout: JSON.stringify({ pathValue, args }) }
        },
      },
    },
  })

  assert.equal(result.automationEntries.length, 1)
  assert.deepEqual(result.automationEntries[0]?.optionsSchema, [
    {
      optionId: 'hideBackupTracks',
      kind: 'boolean',
      label: 'Hide backup tracks',
      defaultValue: true,
    },
    {
      optionId: 'renderPass',
      kind: 'select',
      label: 'Render pass',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'All passes' },
        { value: 'first', label: 'First pass only' },
      ],
    },
  ])

  const execution = await result.automationEntries[0]?.execute({
    hideBackupTracks: true,
    renderPass: 'first',
  })

  assert.deepEqual(execution, {
    steps: [
      { id: 'preflight', status: 'succeeded', message: 'function' },
      {
        id: 'input',
        status: 'succeeded',
        message: JSON.stringify({ hideBackupTracks: true, renderPass: 'first' }),
      },
    ],
    summary: 'batch-ara-render-finished',
  })
})

test('loadHostPlugins records successful automation runs through the host metrics recorder', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRecord = await createAutomationPluginFixture(sandbox)
  const metricsEvents = []

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [pluginRecord],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {
      track: {
        selection: {
          async get() {
            return { trackNames: ['Lead Vox'] }
          },
        },
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/tmp'] }),
      },
      macAccessibility: {
        async preflight() {
          return { ok: true, trusted: true }
        },
        async runScript(script, args) {
          return { ok: true, stdout: JSON.stringify({ script, args }) }
        },
        async runFile(pathValue, args) {
          return { ok: true, stdout: JSON.stringify({ pathValue, args }) }
        },
      },
    },
    metricsRecorder: {
      recordAutomationRunSuccess(input) {
        metricsEvents.push(input)
      },
    },
  })

  await result.automationEntries[0]?.execute({
    hideBackupTracks: true,
    renderPass: 'all',
  })

  assert.deepEqual(metricsEvents, [
    {
      automationKey: 'installed.batch-ara-render:batch-ara-render.card',
      label: 'Batch ARA Render',
    },
  ])
})

test('loadHostPlugins does not record failed automation runs', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-host-runtime-'))
  const pluginRoot = path.join(sandbox, 'installed.failed-automation')
  const entryPath = path.join(pluginRoot, 'dist/index.mjs')
  const metricsEvents = []

  t.after(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  await mkdir(path.dirname(entryPath), { recursive: true })
  await writeFile(
    entryPath,
    `
      export const manifest = ${JSON.stringify({
        pluginId: 'installed.failed-automation',
        extensionType: 'automation',
        version: '1.0.0',
        hostApiVersion: '0.1.0',
        supportedDaws: ['pro_tools'],
        uiRuntime: 'react18',
        displayName: 'Failed Automation',
        description: 'Always fails.',
        entry: 'dist/index.mjs',
        pages: [],
        automationItems: [
          {
            itemId: 'failed-automation.card',
            title: 'Failed Automation',
            automationType: 'failedAutomation',
            runnerExport: 'runFailedAutomation',
          },
        ],
        requiredCapabilities: [],
        adapterModuleRequirements: [],
        capabilityRequirements: [],
      }, null, 2)}

      export async function activate() {}

      export async function runFailedAutomation() {
        throw new Error('automation_failed')
      }
    `,
  )

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [
        {
          pluginId: 'installed.failed-automation',
          displayName: 'Failed Automation',
          version: '1.0.0',
          pluginRoot,
          entryPath,
          manifest: {
            pluginId: 'installed.failed-automation',
            extensionType: 'automation',
            version: '1.0.0',
            hostApiVersion: '0.1.0',
            supportedDaws: ['pro_tools'],
            uiRuntime: 'react18',
            displayName: 'Failed Automation',
            description: 'Always fails.',
            entry: 'dist/index.mjs',
            pages: [],
            automationItems: [
              {
                itemId: 'failed-automation.card',
                title: 'Failed Automation',
                automationType: 'failedAutomation',
                runnerExport: 'runFailedAutomation',
              },
            ],
            requiredCapabilities: [],
            adapterModuleRequirements: [],
            capabilityRequirements: [],
          },
          settingsPages: [],
          loadable: true,
        },
      ],
      issues: [],
    },
    locale: {
      locale: 'en',
      messages: {},
    },
    presto: {},
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: false, paths: ['/tmp'] }),
      },
    },
    metricsRecorder: {
      recordAutomationRunSuccess(input) {
        metricsEvents.push(input)
      },
    },
  })

  await assert.rejects(async () => result.automationEntries[0]?.execute({}), /automation_failed/)
  assert.deepEqual(metricsEvents, [])
})
