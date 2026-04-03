import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let hostModulePromise = null

class MemoryStorage {
  #store = new Map()

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null
  }

  setItem(key, value) {
    this.#store.set(key, String(value))
  }

  removeItem(key) {
    this.#store.delete(key)
  }

  clear() {
    this.#store.clear()
  }
}

function installWindowStub() {
  const storage = new MemoryStorage()
  globalThis.localStorage = storage
  globalThis.matchMedia = () => ({ matches: false })
  return storage
}

async function loadHostModule() {
  if (!hostModulePromise) {
    hostModulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/index.ts',
      tempPrefix: '.tmp-host-shell-ia-test-',
      outfileName: 'host-index.mjs',
      loader: {
        '.css': 'text',
      },
    })
  }

  return hostModulePromise
}

function createPluginProps() {
  return {
    pluginHomeEntries: [
      {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow',
        title: 'Import Workflow',
        description: 'Launch the official import workflow plugin.',
        actionLabel: 'Open Plugin',
      },
      {
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow',
        title: 'Export Workflow',
        description: 'Launch the official export workflow plugin.',
        actionLabel: 'Open Plugin',
      },
    ],
    pluginPages: [
      {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow',
        title: 'Import Workflow',
        mount: 'workspace',
        render: () => React.createElement('div', null, 'Import Workflow Plugin Page'),
      },
      {
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow',
        title: 'Export Workflow',
        mount: 'workspace',
        render: () => React.createElement('div', null, 'Export Workflow Plugin Page'),
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
          pageId: 'settings',
          title: 'Import Workflow',
          storageKey: 'workflow.import.settings',
          defaults: {
            aiConfig: {
              enabled: false,
              model: 'gpt-4o-mini',
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
          ],
          async load() {
            return this.defaults
          },
          async save(nextValue) {
            return nextValue
          },
        },
      ],
    },
    onInstallPluginDirectory: () => {},
    onInstallPluginZip: () => {},
    onRefreshPlugins: () => {},
  }
}

test.afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'localStorage')
  Reflect.deleteProperty(globalThis, 'matchMedia')
})

test('home exposes a settings entry point but no direct developer launch action', async () => {
  installWindowStub()
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('home'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.doesNotMatch(markup, /presto-page-header__meta/)
  assert.match(markup, /Presto/)
  assert.match(markup, />Home</)
  assert.match(markup, />Workflows</)
  assert.match(markup, />Automation</)
  assert.match(markup, />Runs</)
  assert.match(markup, />Settings</)
  assert.doesNotMatch(markup, />Navigate</)
  assert.match(markup, /Host overview/)
  assert.doesNotMatch(markup, /Choose an area from the navigation/)
  assert.doesNotMatch(markup, /Studio \/ Main Workspace/)
  assert.doesNotMatch(markup, /Host<\/div>/)
  assert.doesNotMatch(markup, /Quick Search/)
  assert.doesNotMatch(markup, /Sync OK/)
  assert.doesNotMatch(markup, />KO</)
  assert.doesNotMatch(markup, /Kai Operator/)
  assert.doesNotMatch(markup, /studio-main@presto\.local/)
  assert.doesNotMatch(markup, /presto-host-mark/)
  assert.match(markup, /aria-label="Collapse navigation"/)
  assert.doesNotMatch(markup, /⌂|↳|◫|⟲|⚙/)
  assert.doesNotMatch(markup, />Open Developer</)
  assert.doesNotMatch(markup, /Sidebar options/)
})

test('primary sidebar source uses the custom P logo and keeps the original small Presto wordmark', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostPrimarySidebar.tsx'), 'utf8')

  assert.match(source, /import prestoLogoPng from '\.\.\/\.\.\/assets\/PrestoLogoPng\.png'/)
  assert.match(source, /<img src=\{prestoLogoPng\}/)
  assert.match(source, /filter:\s*'var\(--presto-logo-filter,\s*none\)'/)
  assert.match(source, /const logoRowStyle =[\s\S]*gap:\s*12/)
  assert.match(source, /fontSize:\s*14/)
  assert.doesNotMatch(source, /function PrestoHostMark/)
})

test('settings shell source keeps the settings viewport and columns scrollable', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8')

  assert.match(source, /const settingsViewportStyle:[\s\S]*overflowY:\s*'auto'/)
  assert.match(source, /const navStyle:[\s\S]*overflowY:\s*'auto'/)
  assert.match(source, /const contentStyle:[\s\S]*overflowY:\s*'auto'/)
})

test('workflows page centralizes import and export plugin entry points', async () => {
  installWindowStub()
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('workflows'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.match(markup, /Workflow library/)
  assert.match(markup, /Import Workflow/)
  assert.match(markup, /Export Workflow/)
  assert.match(markup, /Launch the official import workflow plugin\./)
  assert.match(markup, /Launch the official export workflow plugin\./)
  assert.doesNotMatch(markup, /Import and export plugins open from this page/)
  assert.doesNotMatch(markup, /Quick Search/)
  assert.doesNotMatch(markup, /Sync OK/)
})

test('automation renders the split stereo tool card while runs stays a placeholder', async () => {
  installWindowStub()
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const automationMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('automation'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  const runsMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('runs'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.match(automationMarkup, /Automation/)
  assert.match(automationMarkup, /Split Stereo To Mono/)
  assert.match(automationMarkup, /Use the current Pro Tools track selection/)
  assert.match(automationMarkup, /Run Automation/)
  assert.doesNotMatch(automationMarkup, /Target Track|Lead Vox|placeholder=/)
  assert.match(runsMarkup, /Runs/)
  assert.match(runsMarkup, /This section is not populated yet\./)
})

test('settings defaults to General and keeps Developer hidden until developer mode is enabled', async () => {
  installWindowStub()
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.doesNotMatch(markup, /presto-page-header__meta/)
  assert.match(markup, />Settings</)
  assert.match(markup, /Configuration/)
  assert.match(markup, /General/)
  assert.match(markup, /Extensions/)
  assert.match(markup, /Workflow Extensions/)
  assert.match(markup, /Automation Extensions/)
  assert.match(markup, /Developer/)
  assert.match(markup, /Developer Mode/)
  assert.match(markup, /Import Workflow/)
  assert.doesNotMatch(markup, /Split Stereo To Mono/)
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
  assert.doesNotMatch(markup, /Default Import Directory/)
  assert.doesNotMatch(markup, /Export Naming Rule/)
  assert.doesNotMatch(markup, /Operator Notes Template/)
  assert.doesNotMatch(markup, /Recovery Snapshot Location/)
  assert.match(markup, /DAW/)
  assert.match(markup, /Pro Tools/)
  assert.match(markup, /Check Connection/)
  assert.match(markup, /Disconnected/)
  assert.match(markup, /Turn this on to reveal diagnostics and the developer console\./)
  assert.doesNotMatch(markup, /Set host identity, launch behavior, file handling rules, and safety confirmations/)
  assert.doesNotMatch(markup, /Changes apply to this host and affect every operator workspace using these defaults\./)
  assert.doesNotMatch(markup, />Reset</)
  assert.doesNotMatch(markup, /Restore Defaults/)
  assert.doesNotMatch(markup, />Save Changes</)
  assert.match(markup, /Theme/)
  assert.doesNotMatch(markup, /<md-[^>]+><span>Developer<\/span><\/md-[^>]+>/)
})

test('settings reveals a dedicated Developer entry when developer mode is enabled', async () => {
  const storage = installWindowStub()
  storage.setItem('presto.host.shell.preferences', JSON.stringify({
    language: 'en',
    developerMode: true,
  }))
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.match(markup, />Developer</)
})

test('developer surface also omits the page-header metadata bar', async () => {
  const storage = installWindowStub()
  storage.setItem('presto.host.shell.preferences', JSON.stringify({
    language: 'en',
    developerMode: true,
  }))
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('developer'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
    }),
  )

  assert.doesNotMatch(markup, /presto-page-header__meta/)
  assert.match(markup, /Command Registry/)
  assert.match(markup, /Search commands/)
  assert.match(markup, /Summary/)
  assert.match(markup, /Payload/)
  assert.match(markup, /Output/)
  assert.match(markup, /Reset to Default/)
  assert.match(markup, /Select a command/)
  assert.doesNotMatch(markup, /Developer Console/)
  assert.doesNotMatch(markup, /Host Status/)
  assert.doesNotMatch(markup, /Session Context/)
  assert.doesNotMatch(markup, /Smoke & Validation/)
  assert.doesNotMatch(markup, /Capability Console/)
  assert.doesNotMatch(markup, /Developer Overview/)
  assert.doesNotMatch(markup, /Internal tools for capability validation and smoke execution\./)
})

test('primary sidebar resets workflow workspace state before reopening the workflows home surface', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostShellApp.tsx'), 'utf8')

  assert.match(
    source,
    /const openPrimarySurface = \(nextSurface: HostPrimarySidebarRoute\): void => \{[\s\S]*if \(nextSurface === 'settings'\) \{[\s\S]*openSettings\(\)[\s\S]*return[\s\S]*\}[\s\S]*setWorkspacePageRoute\(null\)[\s\S]*setSurface\(nextSurface\)/,
  )
  assert.doesNotMatch(source, /if \(nextSurface !== 'workflows'\)/)
})
