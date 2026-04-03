import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

let mountingModulePromise = null

async function loadMountingModule() {
  if (!mountingModulePromise) {
    mountingModulePromise = (async () => {
      const entry = path.join(repoRoot, 'host-plugin-runtime/src/index.ts')
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
        throw new Error('Failed to compile host-plugin-runtime index.ts')
      }
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      return import(moduleUrl)
    })()
  }

  return mountingModulePromise
}

test('mountPluginPages keeps workspace pages only while settings metadata stays declarative', async () => {
  const { mountPluginPages, mountPluginNavigation } = await loadMountingModule()
  const manifest = {
    pluginId: 'plugin.settings.mount',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    supportedDaws: ['pro_tools'],
    uiRuntime: 'react18',
    displayName: 'Settings Mount',
    entry: 'dist/index.mjs',
    pages: [
      {
        pageId: 'page.workspace',
        path: '/plugin/settings/workspace',
        title: 'Workspace',
        mount: 'workspace',
        componentExport: 'WorkspacePage',
      },
    ],
    settingsPages: [
      {
        pageId: 'page.settings',
        title: 'Plugin Settings',
        order: 20,
        storageKey: 'settings.v1',
        loadExport: 'loadSettings',
        saveExport: 'saveSettings',
        defaults: {
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
            ],
          },
        ],
      },
    ],
    navigationItems: [
      {
        itemId: 'nav.workspace',
        title: 'Workspace',
        pageId: 'page.workspace',
        section: 'sidebar',
      },
    ],
    requiredCapabilities: ['system.health'],
  }

  const mountedPages = mountPluginPages(manifest)
  const mountedNavigation = mountPluginNavigation(manifest)

  assert.deepEqual(
    mountedPages.map((page) => ({ pageId: page.pageId, mount: page.mount })),
    [{ pageId: 'page.workspace', mount: 'workspace' }],
  )

  assert.deepEqual(
    mountedNavigation.map((item) => ({ itemId: item.itemId, section: item.section, order: item.order ?? null })),
    [{ itemId: 'nav.workspace', section: 'sidebar', order: null }],
  )

  assert.equal(manifest.settingsPages[0]?.fields, undefined)
  assert.equal(manifest.settingsPages[0]?.sections[0]?.fields[0]?.kind, 'toggle')
})
