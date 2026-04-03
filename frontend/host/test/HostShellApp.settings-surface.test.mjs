import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let hostModulePromise = null

async function loadHostModule() {
  if (!hostModulePromise) {
    hostModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-host-settings-test-'))
      const outfile = path.join(tempDir, 'host-index.mjs')
      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
        await esbuild.build({
          entryPoints: [path.join(repoRoot, 'frontend/host/index.ts')],
          bundle: true,
          format: 'esm',
          platform: 'node',
          jsx: 'automatic',
          target: 'node20',
          outfile,
          external: ['react', 'react-dom', 'react-dom/server', 'electron', '@mui/*', '@emotion/*'],
          loader: {
            '.ts': 'ts',
            '.tsx': 'tsx',
            '.css': 'text',
            '.png': 'dataurl',
          },
        })

        return await import(pathToFileURL(outfile).href)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })()
  }

  return hostModulePromise
}

function createPluginProps() {
  return {
    pluginHomeEntries: [
      {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow.page.main',
        title: 'Import Workflow',
        description: 'Launch import workflow.',
        actionLabel: 'Open Plugin',
      },
      {
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow.page.main',
        title: 'Export Workflow',
        description: 'Launch export workflow.',
        actionLabel: 'Open Plugin',
      },
    ],
    pluginPages: [
      {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow.page.main',
        title: 'Import Workflow',
        mount: 'workspace',
        render: () => React.createElement('div', null, 'Import Workflow Workspace Page'),
      },
      {
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow.page.main',
        title: 'Export Workflow',
        mount: 'workspace',
        render: () => React.createElement('div', null, 'Export Workflow Workspace Page'),
      },
    ],
    automationEntries: [
      {
        pluginId: 'official.split-stereo-to-mono-automation',
        itemId: 'split-stereo-to-mono.card',
        title: 'Split Stereo To Mono',
        automationType: 'splitStereoToMono',
        description: 'Use the current Pro Tools selection and keep the chosen channel.',
        order: 10,
      },
    ],
    pluginManagerModel: {
      managedRoot: '/Users/test/Library/Application Support/Presto/extensions',
      plugins: [
        {
          pluginId: 'official.import-workflow',
          extensionType: 'workflow',
          displayName: 'Import Workflow',
          version: '1.0.0',
          origin: 'official',
          status: 'ready',
          description: 'Official import workflow plugin.',
        },
        {
          pluginId: 'official.export-workflow',
          extensionType: 'workflow',
          displayName: 'Export Workflow',
          version: '1.0.0',
          origin: 'official',
          status: 'ready',
          description: 'Official export workflow plugin.',
        },
        {
          pluginId: 'official.split-stereo-to-mono-automation',
          extensionType: 'automation',
          displayName: 'Split Stereo To Mono',
          version: '1.0.0',
          origin: 'official',
          status: 'ready',
          description: 'Split the selected stereo track into mono and keep the chosen channel.',
        },
      ],
      issues: [],
      settingsEntries: [
        {
          pluginId: 'official.import-workflow',
          extensionType: 'workflow',
          pageId: 'import-workflow.page.settings',
          title: 'Import Workflow',
          order: 20,
          storageKey: 'workflow.import.settings',
          defaults: {
            aiConfig: {
              enabled: false,
              model: 'gpt-4o-mini',
            },
            ui: {
              stripAfterImport: true,
            },
          },
          sections: [
            {
              sectionId: 'ai-naming',
              title: 'AI naming',
              fields: [
                {
                  fieldId: 'ai-enabled',
                  kind: 'toggle',
                  label: 'Enable AI naming',
                  path: 'aiConfig.enabled',
                },
                {
                  fieldId: 'ai-model',
                  kind: 'text',
                  label: 'Model',
                  path: 'aiConfig.model',
                },
              ],
            },
            {
              sectionId: 'categories',
              title: 'Categories',
              fields: [
                {
                  fieldId: 'categories-editor',
                  kind: 'categoryList',
                  label: 'Categories',
                  path: 'categories',
                },
              ],
            },
          ],
        },
        {
          pluginId: 'official.export-workflow',
          extensionType: 'workflow',
          pageId: 'export-workflow.page.settings',
          title: 'Export Workflow',
          order: 40,
          storageKey: 'workflow.export.settings',
          defaults: {
            defaultSnapshotSelection: 'all',
            mobileProgressEnabled: false,
          },
          sections: [
            {
              sectionId: 'default-snapshot-selection',
              title: 'Default snapshot selection',
              fields: [
                {
                  fieldId: 'default-snapshot-selection',
                  kind: 'toggle',
                  label: 'Select all snapshots by default',
                  path: 'defaultSnapshotSelection',
                  checkedValue: 'all',
                  uncheckedValue: 'none',
                },
              ],
            },
            {
              sectionId: 'mobile-progress-qr',
              title: 'Mobile progress QR',
              fields: [
                {
                  fieldId: 'mobile-progress-enabled',
                  kind: 'toggle',
                  label: 'Enable mobile progress QR',
                  path: 'mobileProgressEnabled',
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

function countMatches(input, pattern) {
  return [...input.matchAll(pattern)].length
}

test('settings surface renders second-level navigation with required entries', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  globalThis.window = {
    localStorage: {
      getItem() {
        return JSON.stringify({
          language: 'system',
          developerMode: false,
          dawTarget: 'pro_tools',
        })
      },
      setItem() {},
    },
    navigator: {
      languages: ['en-US'],
      language: 'en-US',
    },
    matchMedia: () => ({ matches: false }),
  }
  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.match(markup, />Settings</)
  assert.match(markup, /General/)
  assert.match(markup, /Extensions/)
  assert.match(markup, /Import Workflow/)
  assert.match(markup, /Export Workflow/)
  assert.match(markup, /Developer/)
  assert.match(markup, /Developer Mode/)
  assert.doesNotMatch(markup, /Find a setting/)
  assert.doesNotMatch(markup, /Updated just now/)
  assert.doesNotMatch(markup, />Workspace</)
  assert.doesNotMatch(markup, />Audio</)
  assert.doesNotMatch(markup, />Exports</)
  assert.doesNotMatch(markup, />Shortcuts</)
  assert.doesNotMatch(markup, />Advanced</)
  assert.doesNotMatch(markup, /Application Identity/)
  assert.doesNotMatch(markup, /Behavior/)
  assert.doesNotMatch(markup, /File Handling/)
  assert.doesNotMatch(markup, /Safety/)
  assert.doesNotMatch(markup, /Application Name/)
  assert.doesNotMatch(markup, /Default Workspace/)
  assert.doesNotMatch(markup, /Export Naming Rule/)
  assert.doesNotMatch(markup, /Operator Notes Template/)
  assert.doesNotMatch(markup, /Recovery Snapshot Location/)
  assert.match(markup, /DAW/)
  assert.match(markup, /Language/)
  assert.match(markup, /Follow System/)
  assert.match(markup, /简体中文/)
  assert.match(markup, /English/)
  assert.match(markup, /Pro Tools/)
  assert.match(markup, /Check Connection/)
  assert.match(markup, /Current version: -/)
  assert.match(markup, /Latest release: not checked/)
  assert.match(markup, /Check for Updates/)
  assert.match(markup, /View Log/)
  assert.doesNotMatch(markup, /Export Logs/)
  assert.match(markup, /Disconnected/)
  assert.match(markup, /Developer/)
  assert.match(markup, /Developer Mode/)
  assert.doesNotMatch(markup, /Set host identity, launch behavior, file handling rules, and safety confirmations/)
  assert.doesNotMatch(markup, />Reset</)
  assert.doesNotMatch(markup, /Restore Defaults/)
  assert.doesNotMatch(markup, />Save Changes</)
  assert.doesNotMatch(markup, />Theme</)
})

test('settings keeps log access inside general settings instead of opening a dedicated host page', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {
        app: {
          viewLog: async () => ({
            ok: true,
            filePath: '/tmp/current.log',
          }),
        },
      },
      ...createPluginProps(),
    }),
  )

  assert.match(markup, /View Log/)
  assert.doesNotMatch(markup, />Logs</)
  assert.doesNotMatch(markup, /Recent Logs/)
  assert.doesNotMatch(markup, /Refresh/)
})

test('extensions settings page groups installed workflow and automation extensions separately', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialSettingsPageRoute: {
        kind: 'builtin',
        pageId: 'workflowExtensions',
      },
    }),
  )

  assert.match(markup, /Workflow Extensions/)
  assert.match(markup, /Automation Extensions/)
  assert.match(markup, /Workflows/)
  assert.match(markup, /Automation/)
  assert.match(markup, /Import Workflow/)
  assert.match(markup, /Export Workflow/)
  assert.doesNotMatch(markup, /Split Stereo To Mono/)
  assert.doesNotMatch(markup, /Plugin management/)
  assert.doesNotMatch(markup, /Installed Plugins/)
})

test('automation extensions settings page keeps full management controls and workflow page navigation visible', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialSettingsPageRoute: {
        kind: 'builtin',
        pageId: 'automationExtensions',
      },
    }),
  )

  assert.match(markup, /Automation Extensions/)
  assert.match(markup, /Split Stereo To Mono/)
  assert.match(markup, /Install Local Directory/)
  assert.match(markup, /Install Local Zip/)
  assert.match(markup, /Import Workflow/)
  assert.match(markup, /Export Workflow/)
})

test('settings surface renders declarative workflow settings through shared host fields', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const importMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialSettingsPageRoute: {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow.page.settings',
      },
    }),
  )

  const exportMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialSettingsPageRoute: {
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow.page.settings',
      },
    }),
  )

  assert.match(importMarkup, /AI naming/)
  assert.match(importMarkup, /Enable AI naming/)
  assert.match(importMarkup, /Model/)
  assert.match(importMarkup, /Categories/)
  assert.doesNotMatch(importMarkup, /Import Workflow Settings Page/)

  assert.match(exportMarkup, /Default snapshot selection/)
  assert.match(exportMarkup, /Select all snapshots by default/)
  assert.match(exportMarkup, /Mobile progress QR/)
  assert.match(exportMarkup, /Enable mobile progress QR/)
  assert.doesNotMatch(exportMarkup, /<select[^>]*aria-label="Default snapshot selection"/)
  assert.doesNotMatch(exportMarkup, /Export Workflow Settings Page/)
})

test('workflow settings page keeps save actions floating without reserving inline footer space', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/settings/WorkflowSettingsPage.tsx'), 'utf8')

  assert.match(source, /position:\s*'sticky'/)
  assert.match(source, /bottom:\s*24/)
  assert.match(source, /justifyContent:\s*'flex-end'/)
  assert.match(source, /background:\s*'transparent'/)
  assert.match(source, /hostShellColors\.accent/)
})

test('settings surface only shows Back for plugin settings opened from a workflow page', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialSettingsPageRoute: {
        kind: 'plugin',
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow.page.settings',
      },
    }),
  )

  assert.doesNotMatch(markup, />Back</)
  assert.equal(countMatches(markup, />Home</g), 1)
})

test('settings surface uses a fixed viewport shell so only the content column scrolls', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8')

  assert.match(source, /const appShellStyle = \(sidebarCollapsed: boolean\): CSSProperties => \(\{[\s\S]*height:\s*'100vh'/)
  assert.match(source, /const screenFrameStyle:[\s\S]*height:\s*'100vh'/)
  assert.match(source, /const bodyStyle:[\s\S]*minHeight:\s*0/)
  assert.match(source, /const contentStyle:[\s\S]*overflowY:\s*'auto'/)
  assert.match(source, /const navStyle:[\s\S]*overflowY:\s*'auto'/)
})

test('host shell settings surfaces share centralized host color tokens', async () => {
  const [settingsSource, sidebarSource, homeSource] = await Promise.all([
    readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostPrimarySidebar.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostHomeSurface.tsx'), 'utf8'),
  ])

  assert.match(settingsSource, /from '\.\/hostShellColors'/)
  assert.match(sidebarSource, /from '\.\/hostShellColors'/)
  assert.match(homeSource, /from '\.\/hostShellColors'/)
})

test('settings surface no longer renders a dedicated framed topbar header', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8')

  assert.doesNotMatch(source, /const topbarStyle:/)
  assert.doesNotMatch(source, /const topbarTitleStyle:/)
  assert.match(source, /const screenFrameStyle: CSSProperties = \{[\s\S]*gridTemplateRows: 'minmax\(0, 1fr\)'/)
})

test('host shell does not force-jump plugin settings routes back to general when entries are filtered', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostShellApp.tsx'), 'utf8')

  assert.doesNotMatch(source, /setSettingsRoute\(\{\s*kind:\s*'builtin',\s*pageId:\s*'general'\s*\}\)/)
})
