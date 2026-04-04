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

async function loadHostModule() {
  if (!hostModulePromise) {
    hostModulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/index.ts',
      tempPrefix: '.tmp-host-shell-plugin-test-',
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
        optionsSchema: [],
        execute: async () => ({ steps: [], summary: 'split done' }),
      },
      {
        pluginId: 'installed.batch-ara-render',
        itemId: 'batch-ara-render.card',
        title: 'Batch ARA Render',
        automationType: 'batchAraRender',
        description: 'Duplicate selected tracks, hide backups, then render ARA.',
        order: 20,
        optionsSchema: [
          {
            optionId: 'hideBackupTracks',
            kind: 'boolean',
            label: 'Hide backup tracks',
            defaultValue: true,
          },
        ],
        execute: async () => ({ steps: [], summary: 'ara done' }),
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
          adapterModuleRequirements: [{ moduleId: 'import', minVersion: '2025.10.0' }],
        },
        {
          pluginId: 'official.export-workflow',
          extensionType: 'workflow',
          displayName: 'Export Workflow',
          version: '1.0.0',
          origin: 'official',
          status: 'ready',
          description: 'Official export workflow plugin.',
          adapterModuleRequirements: [{ moduleId: 'export', minVersion: '2026.1.0' }],
        },
        {
          pluginId: 'installed.audio.cleanup',
          extensionType: 'workflow',
          displayName: 'Audio Cleanup',
          version: '1.2.0',
          origin: 'installed',
          status: 'ready',
          description: 'Installed cleanup utility.',
          pluginRoot: '/Users/test/Library/Application Support/Presto/extensions/installed.audio.cleanup',
          adapterModuleRequirements: [{ moduleId: 'export', minVersion: '2026.1.0' }],
        },
        {
          pluginId: 'official.split-stereo-to-mono-automation',
          extensionType: 'automation',
          displayName: 'Split Stereo To Mono',
          version: '1.0.0',
          origin: 'official',
          status: 'ready',
          description: 'Split the selected stereo track into mono and keep the chosen channel.',
          adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
        },
        {
          pluginId: 'installed.batch-ara-render',
          extensionType: 'automation',
          displayName: 'Batch ARA Render',
          version: '1.0.0',
          origin: 'installed',
          status: 'ready',
          description: 'Duplicate selected tracks, hide backups, then render ARA.',
          pluginRoot: '/Users/test/Library/Application Support/Presto/extensions/installed.batch-ara-render',
          adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
        },
      ],
      issues: [
        {
          scope: 'manifest',
          pluginRoot: '/Users/test/bad-plugin',
          message: 'manifest validation failed',
        },
      ],
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
        },
      ],
    },
    onInstallPluginDirectory: () => {},
    onInstallPluginZip: () => {},
    onRefreshPlugins: () => {},
  }
}

test('home surface renders plugin launch cards and settings surface renders plugin management', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const sharedProps = {
    developerPresto: {},
    developerRuntime: {},
    ...createPluginProps(),
  }

  const homeMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('home'),
      ...sharedProps,
    }),
  )

  assert.match(homeMarkup, /Presto/)
  assert.match(homeMarkup, /Host overview/)
  assert.match(homeMarkup, /Recommended starting point/)
  assert.doesNotMatch(homeMarkup, /Choose an area from the navigation/)
  assert.match(homeMarkup, /data:image\/png;base64/)
  assert.match(homeMarkup, /aria-label="Collapse navigation"/)
  assert.doesNotMatch(homeMarkup, /Sidebar options/)
  assert.doesNotMatch(homeMarkup, /⌂|↳|◫|⟲|⚙/)
  assert.match(homeMarkup, /grid-template-columns:272px minmax\(0,\s*1fr\)/)
  assert.match(homeMarkup, />Workflows</)
  assert.match(homeMarkup, />Automation</)
  assert.match(homeMarkup, />Runs</)
  assert.doesNotMatch(homeMarkup, />Navigate</)
  assert.doesNotMatch(homeMarkup, /Studio \/ Main Workspace/)
  assert.doesNotMatch(homeMarkup, /Quick Search/)
  assert.doesNotMatch(homeMarkup, /Sync OK/)
  assert.doesNotMatch(homeMarkup, /Kai Operator/)
  assert.doesNotMatch(homeMarkup, /studio-main@presto\.local/)

  const workflowsMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('workflows'),
      ...sharedProps,
    }),
  )

  assert.match(workflowsMarkup, /Workflow library/)
  assert.match(workflowsMarkup, /Import Workflow/)
  assert.match(workflowsMarkup, /Export Workflow/)

  const workspaceMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('workflows'),
      ...sharedProps,
      initialWorkspacePageRoute: {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow',
      },
    }),
  )

  assert.match(workspaceMarkup, /Import Workflow Plugin Page/)
  assert.match(workspaceMarkup, /Plugin Settings/)
  assert.doesNotMatch(workspaceMarkup, />All Workflows</)
  assert.match(workspaceMarkup, /grid-template-rows:minmax\(0,\s*1fr\)/)
  assert.match(workspaceMarkup, /overflow:hidden/)
  assert.doesNotMatch(workspaceMarkup, /presto-plugin-frame--workspace/)
  assert.doesNotMatch(workspaceMarkup, /Plugin workspace page mounted through the host runtime\./)

  const settingsMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      ...sharedProps,
      initialSettingsPageRoute: {
        kind: 'builtin',
        pageId: 'workflowExtensions',
      },
    }),
  )

  assert.doesNotMatch(homeMarkup, /Open Developer/)
  assert.match(settingsMarkup, /Workflow Extensions/)
  assert.match(settingsMarkup, /Install Local Directory/)
  assert.match(settingsMarkup, /Install Local Zip/)
  assert.match(settingsMarkup, /Automation/)
  assert.match(settingsMarkup, /Import Workflow/)
  assert.doesNotMatch(settingsMarkup, /Audio Cleanup/)
  assert.doesNotMatch(settingsMarkup, /Split Stereo To Mono/)
  assert.match(settingsMarkup, />More</)
  assert.doesNotMatch(settingsMarkup, /Version: 1\.0\.0/)
  assert.doesNotMatch(settingsMarkup, /Source: official/)
  assert.doesNotMatch(settingsMarkup, /official\.import-workflow/)
  assert.doesNotMatch(settingsMarkup, /Uninstall Audio Cleanup/)
  assert.doesNotMatch(settingsMarkup, /Plugin Details/)
  assert.doesNotMatch(settingsMarkup, /Plugin issues/)
  assert.doesNotMatch(settingsMarkup, /manifest validation failed/)

  const automationSettingsMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      ...sharedProps,
      initialSettingsPageRoute: {
        kind: 'builtin',
        pageId: 'automationExtensions',
      },
    }),
  )

  assert.match(automationSettingsMarkup, /Automation Extensions/)
  assert.match(automationSettingsMarkup, /Install Local Directory/)
  assert.match(automationSettingsMarkup, /Install Local Zip/)
  assert.match(automationSettingsMarkup, /Split Stereo To Mono/)
  assert.match(automationSettingsMarkup, /Import Workflow/)

  const automationMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('automation'),
      ...sharedProps,
    }),
  )

  assert.match(automationMarkup, /Automation/)
  assert.doesNotMatch(automationMarkup, /Single-shot automation tools live here/)
})

test('automation surface renders installed automation entries instead of a split-stereo hardcode', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const sharedProps = {
    developerPresto: {},
    developerRuntime: {},
    ...createPluginProps(),
  }

  const automationMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('automation'),
      ...sharedProps,
    }),
  )

  assert.match(automationMarkup, /Split Stereo To Mono/)
  assert.match(automationMarkup, /Batch ARA Render/)
  assert.match(automationMarkup, /Hide backup tracks/)

  const automationSurfaceSource = await readFile(
    path.join(repoRoot, 'frontend/host/automation/AutomationSurface.tsx'),
    'utf8',
  )
  assert.doesNotMatch(automationSurfaceSource, /automationType === 'splitStereoToMono'/)
  assert.match(automationSurfaceSource, /automationEntries\.map/)
})

test('workflow and automation entries stay visible even when the live daw adapter snapshot lacks required modules', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()
  const sharedProps = {
    developerPresto: {},
    developerRuntime: {},
    ...createPluginProps(),
    dawAdapterSnapshot: {
      targetDaw: 'pro_tools',
      adapterVersion: '2025.10.0',
      hostVersion: '2025.10',
      modules: [
        { moduleId: 'import', version: '2025.10.0' },
        { moduleId: 'automation', version: '2025.10.0' },
      ],
      capabilities: [],
    },
  }

  const workflowsMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('workflows'),
      ...sharedProps,
    }),
  )

  assert.match(workflowsMarkup, /Import Workflow/)
  assert.match(workflowsMarkup, /Export Workflow/)
  assert.doesNotMatch(workflowsMarkup, /Audio Cleanup/)

  const automationMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('automation'),
      ...sharedProps,
    }),
  )

  assert.match(automationMarkup, /Split Stereo To Mono/)
  assert.doesNotMatch(automationMarkup, /Audio Cleanup/)

  const workspaceMarkup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('workflows'),
      ...sharedProps,
      initialWorkspacePageRoute: {
        pluginId: 'official.export-workflow',
        pageId: 'export-workflow',
      },
    }),
  )

  assert.match(workspaceMarkup, /Export Workflow Plugin Page/)
})

test('plugins settings source requires confirmation before uninstalling a plugin', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/settings/ExtensionsSettingsPage.tsx'), 'utf8')

  assert.match(source, /window\.confirm\(/)
  assert.match(source, /Remove extension from Presto\?/)
  assert.match(source, /expandedPluginId/)
  assert.match(source, /translateHost\(locale, 'extensions\.more'\)/)
  assert.doesNotMatch(source, /title=\"Extension Details\"/)
})

test('plugin settings surface shows Back when opened from a workspace route', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('settings'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialWorkspacePageRoute: {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow',
      },
      initialSettingsPageRoute: {
        kind: 'plugin',
        pluginId: 'official.import-workflow',
        pageId: 'settings',
      },
    }),
  )

  assert.match(markup, />Back</)
  assert.doesNotMatch(markup, /Find a setting/)
  assert.match(markup, /AI naming/)
  assert.match(markup, /Enable AI naming/)
  assert.doesNotMatch(markup, /Import Workflow Settings Page/)
  assert.doesNotMatch(markup, /presto-plugin-frame--settings/)
})

test('workspace surface keeps the Workflows sidebar item clickable so it can return to the workflow home page', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('workflows'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      initialWorkspacePageRoute: {
        pluginId: 'official.import-workflow',
        pageId: 'import-workflow',
      },
    }),
  )

  assert.match(markup, /aria-label="Workflows"/)
  assert.doesNotMatch(markup, /disabled="" aria-label="Workflows"/)
})

test('workspace surface uses a fixed shell row layout so plugin content does not push actions below the viewport', async () => {
  const [homeSource, sidebarSource] = await Promise.all([
    readFile(path.join(repoRoot, 'frontend/host/HostHomeSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostPrimarySidebar.tsx'), 'utf8'),
  ])

  assert.match(homeSource, /const screenFrameStyle = \(sidebarCollapsed: boolean\): CSSProperties => \(\{[\s\S]*gridTemplateColumns:\s*`\$\{sidebarCollapsed \? 72 : 272\}px minmax\(0, 1fr\)`/)
  assert.match(homeSource, /const screenFrameStyle = \(sidebarCollapsed: boolean\): CSSProperties => \(\{[\s\S]*height:\s*'100vh'/)
  assert.match(homeSource, /const mainPaneStyle:[\s\S]*overflow:\s*'hidden'/)
  assert.match(homeSource, /const contentStyle:[\s\S]*overflowY:\s*'auto'/)
  assert.match(homeSource, /const contentStyle:[\s\S]*minHeight:\s*0/)
  assert.match(homeSource, /const summaryGridStyle:[\s\S]*gridTemplateColumns:\s*'repeat\(auto-fit, minmax\(260px, 1fr\)\)'/)
  assert.match(homeSource, /const workflowGridStyle:[\s\S]*gridTemplateColumns:\s*'repeat\(auto-fit, minmax\(260px, 1fr\)\)'/)
  assert.match(homeSource, /<HostPrimarySidebar[\s\S]*collapsed=\{sidebarCollapsed\}[\s\S]*onToggleCollapse=\{onToggleSidebar\}/)
  assert.doesNotMatch(homeSource, /Choose an area from the navigation/)
  assert.doesNotMatch(homeSource, /Workflow plugins stay mounted inside the host shell/)
  assert.doesNotMatch(homeSource, /Import and export plugins open from this page/)
  assert.doesNotMatch(homeSource, /All Workflows/)
  assert.match(homeSource, /activeWorkspacePage\s*\?\s*activeWorkspacePage\.render\(\)/)
  assert.doesNotMatch(homeSource, /presto-plugin-frame--workspace/)
  assert.match(sidebarSource, /HOST_SIDEBAR_EXPANDED_WIDTH\s*=\s*272/)
  assert.match(sidebarSource, /HOST_SIDEBAR_COLLAPSED_WIDTH\s*=\s*72/)
  assert.match(sidebarSource, /width:\s*collapsed \? HOST_SIDEBAR_COLLAPSED_WIDTH : HOST_SIDEBAR_EXPANDED_WIDTH/)
  assert.match(sidebarSource, /height:\s*'100vh'/)
  assert.doesNotMatch(sidebarSource, /Navigate/)
  assert.doesNotMatch(sidebarSource, /Sidebar options/)
})

test('primary sidebar source reserves a footer connection indicator area', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostPrimarySidebar.tsx'), 'utf8')

  assert.match(source, /gridTemplateRows:\s*'auto minmax\(0, 1fr\) auto'/)
  assert.match(source, /connection/i)
  assert.match(source, /left bottom/i)
})

test('home keeps workflow plugin rows out of the host overview surface', async () => {
  const { HostShellApp, createHostShellState } = await loadHostModule()

  const markup = renderToStaticMarkup(
    React.createElement(HostShellApp, {
      state: createHostShellState('home'),
      developerPresto: {},
      developerRuntime: {},
      ...createPluginProps(),
      pluginHomeEntries: [
        {
          pluginId: 'official.import-workflow',
          pageId: 'import-workflow',
          title: 'Import Workflow',
          description: 'Launch the official import workflow plugin.',
          actionLabel: 'Open workspace ->',
        },
        {
          pluginId: 'official.export-workflow',
          pageId: 'export-workflow',
          title: 'Export Workflow',
          description: 'Launch the export workflow extension.',
          actionLabel: 'Open extension ->',
        },
      ],
    }),
  )

  assert.match(markup, /Host overview/)
  assert.doesNotMatch(markup, /Workflow Extensions/)
  assert.doesNotMatch(markup, /Open extension -&gt;/)
  assert.doesNotMatch(markup, /Export Workflow/)
})

test('desktop host renderer seeds a startup shell before the app mounts', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/renderHostShellApp.tsx'), 'utf8')

  assert.match(source, /Launching Presto/)
  assert.match(source, /Preparing desktop runtime/)
  assert.match(source, /container\.innerHTML =/)
  assert.match(source, /data-presto-theme/)
  assert.match(source, /'#0c0e17'/)
  assert.match(source, /'#f7f8fc'/)
  assert.doesNotMatch(source, /background:var\(--md-sys-color-background\)/)
})
