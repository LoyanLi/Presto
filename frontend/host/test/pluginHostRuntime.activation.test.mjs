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
    requiredCapabilities: ['export.run.start'],
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
