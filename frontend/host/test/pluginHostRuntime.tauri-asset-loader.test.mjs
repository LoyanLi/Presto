import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
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
      tempPrefix: '.tmp-plugin-host-runtime-tauri-test-',
      outfileName: 'plugin-host-runtime.mjs',
      loader: {
        '.css': 'text',
      },
    })
  }

  return pluginHostRuntimePromise
}

test('toRuntimeModuleUrl preserves sibling resolution for tauri workflow module graphs on macOS asset protocol', async () => {
  const { toRuntimeModuleUrl } = await loadPluginHostRuntime()
  const originalWindow = globalThis.window
  const originalIsTauri = globalThis.isTauri

  globalThis.window = {
    __TAURI_INTERNALS__: {
      convertFileSrc(filePath) {
        return `asset://localhost/${encodeURIComponent(filePath)}`
      },
    },
  }
  globalThis.isTauri = true

  try {
    const entryUrl = toRuntimeModuleUrl(
      '/Users/loyan/Library/Application Support/com.loyan.presto/extensions/official.export-workflow/dist/entry.mjs',
    )

    assert.equal(
      entryUrl,
      'asset://localhost/%2FUsers/loyan/Library/Application%20Support/com.loyan.presto/extensions/official.export-workflow/dist/entry.mjs',
    )
    assert.equal(
      new URL('./ExportWorkflowPage.mjs', entryUrl).href,
      'asset://localhost/%2FUsers/loyan/Library/Application%20Support/com.loyan.presto/extensions/official.export-workflow/dist/ExportWorkflowPage.mjs',
    )
  } finally {
    globalThis.window = originalWindow
    globalThis.isTauri = originalIsTauri
  }
})

test('loadHostPlugins resolves workflow pages in tauri from asset-backed module graphs with relative imports', async (t) => {
  const { loadHostPlugins } = await loadPluginHostRuntime()
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-plugin-tauri-asset-'))
  const pluginRoot = path.join(sandbox, 'official.export-workflow')
  const entryPath = path.join(pluginRoot, 'dist', 'entry.mjs')
  const pagePath = path.join(pluginRoot, 'dist', 'ExportWorkflowPage.mjs')
  const sharedReactPath = path.join(pluginRoot, 'dist', 'react-shared.mjs')

  await mkdir(path.dirname(entryPath), { recursive: true })
  await writeFile(
    entryPath,
    `
      import { ExportWorkflowPage } from './ExportWorkflowPage.mjs'
      export const manifest = {
        pluginId: 'official.export-workflow',
        extensionType: 'workflow',
        version: '1.0.0',
        hostApiVersion: '0.1.0',
        supportedDaws: ['pro_tools'],
        uiRuntime: 'react18',
        displayName: 'Export Workflow',
        description: 'Official export workflow plugin.',
        entry: 'dist/entry.mjs',
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
      }
      export function activate() {}
      export { ExportWorkflowPage }
    `,
  )
  await writeFile(
    pagePath,
    `
      import React from './react-shared.mjs'
      export function ExportWorkflowPage() {
        return React.createElement('div', null, 'Export Workflow Plugin Page')
      }
    `,
  )
  await writeFile(
    sharedReactPath,
    `
      const sharedReact = globalThis.window?.__PRESTO_PLUGIN_SHARED__?.React ?? globalThis.__PRESTO_PLUGIN_SHARED__?.React
      export default sharedReact
    `,
  )

  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const encodedAssetByPath = new Map()
  for (const filePath of [entryPath, pagePath, sharedReactPath]) {
    const content = await readFile(filePath, 'utf8')
    encodedAssetByPath.set(
      filePath,
      `data:text/javascript;base64,${Buffer.from(content, 'utf8').toString('base64')}`,
    )
  }

  globalThis.document = {
    getElementById() {
      return null
    },
    createElement() {
      return { id: '', rel: '', href: '' }
    },
    head: {
      append() {},
    },
  }
  globalThis.window = {
    isTauri: true,
    localStorage: {
      getItem() {
        return null
      },
      setItem() {},
      removeItem() {},
    },
    __TAURI_INTERNALS__: {
      convertFileSrc(filePath) {
        return encodedAssetByPath.get(filePath) ?? `data:text/javascript;base64,`
      },
    },
    __PRESTO_PLUGIN_SHARED__: {
      React: await import('react'),
      ui: {},
    },
  }
  t.after(async () => {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    await rm(sandbox, { recursive: true, force: true })
  })

  const result = await loadHostPlugins({
    catalog: {
      managedPluginsRoot: sandbox,
      plugins: [
        {
          pluginId: 'official.export-workflow',
          displayName: 'Export Workflow',
          version: '1.0.0',
          pluginRoot,
          entryPath,
          manifest: {
            pluginId: 'official.export-workflow',
            extensionType: 'workflow',
            version: '1.0.0',
            hostApiVersion: '0.1.0',
            supportedDaws: ['pro_tools'],
            uiRuntime: 'react18',
            displayName: 'Export Workflow',
            description: 'Official export workflow plugin.',
            entry: 'dist/entry.mjs',
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

  assert.deepEqual(result.managerModel.issues, [])
  assert.deepEqual(result.homeEntries, [
    {
      pluginId: 'official.export-workflow',
      pageId: 'export-workflow.page.main',
      title: 'Export Workflow',
      description: 'Official export workflow plugin.',
      actionLabel: 'Open Plugin',
    },
  ])
})
