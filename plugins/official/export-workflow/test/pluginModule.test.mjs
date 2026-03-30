import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pluginModulePromise = null

function createSampleSnapshot(overrides = {}) {
  return {
    id: 'snapshot-1',
    name: 'Verse Lead',
    trackStates: [
      {
        trackId: 'track-1',
        trackName: 'Lead Vox',
        is_soloed: true,
        is_muted: false,
        type: 'audio',
        color: '#ff4a90e2',
      },
    ],
    createdAt: '2026-03-25T00:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    ...overrides,
  }
}

function createRunningJobView(overrides = {}) {
  return {
    jobId: 'job-1',
    state: 'running',
    terminalStatus: 'running',
    progressPercent: 42,
    message: 'Exporting snapshot 1 of 1',
    currentSnapshot: 1,
    totalSnapshots: 1,
    currentSnapshotName: 'Verse Lead',
    currentMixSourceName: 'Ref Print (Stereo)',
    currentMixSourceIndex: 1,
    totalMixSources: 2,
    currentFileProgressPercent: 58,
    overallProgressPercent: 42,
    etaSeconds: 18,
    exportedCount: 0,
    lastExportedFile: '',
    exportedFiles: [],
    failedSnapshots: [],
    success: false,
    errorMessage: '',
    isTerminal: false,
    ...overrides,
  }
}

function createPluginContext() {
  return {
    pluginId: 'official.export-workflow',
    locale: {
      requested: 'en',
      resolved: 'en',
    },
    presto: {
      daw: {
        connection: {
          getStatus: async () => ({ connected: false }),
        },
      },
      session: {
        getInfo: async () => ({
          session: {
            sessionName: 'Demo Session',
            sessionPath: '/Sessions/Demo Session.ptx',
            sampleRate: 48000,
            bitDepth: 24,
          },
        }),
      },
      track: {
        list: async () => ({ tracks: [] }),
      },
      export: {
        mixSource: {
          list: async ({ sourceType }) => ({
            sourceType,
            sourceList:
              sourceType === 'physicalOut'
                ? [
                    'Music (Stereo)',
                    'All BV (Stereo)',
                    'All BV.L (Mono)',
                    'All BV.R (Mono)',
                    'LV SC (Mono)',
                  ]
                : ['Ref Print (Stereo)'],
          }),
        },
        run: {
          start: async () => ({ jobId: 'job-1', capability: 'export.run.start', state: 'queued' }),
        },
      },
      jobs: {
        get: async () => ({
          jobId: 'job-1',
          state: 'queued',
          progress: { percent: 0, current: 0, total: 1, message: 'queued' },
          metadata: {},
          result: {},
        }),
        cancel: async () => ({ cancelled: true, jobId: 'job-1' }),
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: true, paths: [] }),
      },
      mobileProgress: {
        createSession: async () => ({ ok: true, sessionId: 'mob-1', url: 'http://127.0.0.1:43123/mobile-progress/mob-1?token=test-token', qrSvg: '<svg></svg>' }),
        closeSession: async () => ({ ok: true }),
        getViewUrl: async () => ({ ok: true, sessionId: 'mob-1', url: 'http://127.0.0.1:43123/mobile-progress/mob-1?token=test-token', qrSvg: '<svg></svg>' }),
        updateSession: async () => ({ ok: true, sessionId: 'mob-1', updatedAt: '2026-03-28T10:00:00.000Z' }),
      },
      fs: {
        readFile: async () => null,
        writeFile: async () => {},
        ensureDir: async () => {},
        getHomePath: async () => '/Users/test',
      },
    },
    storage: {
      async get() {
        return null
      },
      async set() {},
      async delete() {},
    },
    logger: console,
  }
}

async function loadPluginModule() {
  if (!pluginModulePromise) {
    const previousWindow = globalThis.window
    globalThis.window = {
      __PRESTO_PLUGIN_SHARED__: {
        React,
      },
    }

    const entryUrl = new URL('../dist/entry.mjs', import.meta.url)
    entryUrl.searchParams.set('test', String(Date.now()))
    pluginModulePromise = import(entryUrl.href).finally(() => {
      if (previousWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = previousWindow
      }
    })
  }

  return pluginModulePromise
}

async function loadPageModuleWithStateOverrides(overrides) {
  const previousWindow = globalThis.window
  const originalUseState = React.useState
  let stateCallIndex = 0

  React.useState = (initialValue) => {
    stateCallIndex += 1
    if (Object.prototype.hasOwnProperty.call(overrides, stateCallIndex)) {
      return originalUseState(overrides[stateCallIndex])
    }
    return originalUseState(initialValue)
  }

  globalThis.window = {
    __PRESTO_PLUGIN_SHARED__: {
      React,
    },
  }

  try {
    const pageUrl = new URL('../dist/ExportWorkflowPage.mjs', import.meta.url)
    pageUrl.searchParams.set('test', String(Date.now()))
    pageUrl.searchParams.set('scenario', Math.random().toString(36).slice(2))
    return await import(pageUrl.href)
  } finally {
    React.useState = originalUseState
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
  }
}

test('plugin module exports manifest and page export', async () => {
  const pluginModule = await loadPluginModule()
  assert.equal(pluginModule.manifest.pluginId, 'official.export-workflow')
  assert.equal(pluginModule.manifest.entry, 'dist/entry.mjs')
  assert.equal(pluginModule.manifest.styleEntry, 'dist/export-workflow.css')
  assert.equal(pluginModule.manifest.pages[0]?.componentExport, 'ExportWorkflowPage')
  assert.equal(pluginModule.manifest.pages[0]?.mount, 'workspace')
  assert.equal(pluginModule.manifest.pages.length, 1)
  assert.equal(pluginModule.manifest.navigationItems.length, 1)
  assert.equal(pluginModule.manifest.settingsPages[0]?.pageId, 'export-workflow.page.settings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.loadExport, 'loadExportWorkflowSettings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.saveExport, 'saveExportWorkflowSettings')
  assert.equal(typeof pluginModule.activate, 'function')
  assert.equal(typeof pluginModule.ExportWorkflowPage, 'function')
  assert.equal(typeof pluginModule.loadExportWorkflowSettings, 'function')
  assert.equal(typeof pluginModule.saveExportWorkflowSettings, 'function')
})

test('manifest.json stays aligned with module manifest essentials', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.equal(fileManifest.styleEntry, pluginModule.manifest.styleEntry)
  assert.deepEqual(fileManifest.requiredCapabilities, pluginModule.manifest.requiredCapabilities)
  assert.deepEqual(fileManifest.adapterModuleRequirements, pluginModule.manifest.adapterModuleRequirements)
  assert.deepEqual(fileManifest.capabilityRequirements, pluginModule.manifest.capabilityRequirements)
  assert.equal(Array.isArray(fileManifest.adapterModuleRequirements), true)
  assert.equal(fileManifest.adapterModuleRequirements.length > 0, true)
  assert.equal(
    fileManifest.adapterModuleRequirements.some(
      (item) => item.moduleId === 'export' && item.minVersion === '2025.10.0',
    ),
    true,
  )
  assert.equal(Array.isArray(fileManifest.capabilityRequirements), true)
  assert.equal(fileManifest.capabilityRequirements.length > 0, true)
  assert.equal(
    fileManifest.capabilityRequirements.some(
      (item) => item.capabilityId === 'export.run.start' && item.minVersion === '2025.10.0',
    ),
    true,
  )
  assert.deepEqual(fileManifest.requiredRuntimeServices, pluginModule.manifest.requiredRuntimeServices)
  assert.deepEqual(fileManifest.settingsPages, pluginModule.manifest.settingsPages)
})

test('dist modules resolve React through a plugin-local shared helper', async () => {
  const [pageSource, entrySource, uiSource, helperSource] = await Promise.all([
    readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/react-shared.mjs', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pageSource, /from ['"]react['"]/)
  assert.doesNotMatch(uiSource, /from ['"]react['"]/)
  assert.match(pageSource, /react-shared\.mjs/)
  assert.doesNotMatch(entrySource, /ExportWorkflowSettingsPage/)
  assert.match(uiSource, /react-shared\.mjs/)
  assert.match(helperSource, /__PRESTO_PLUGIN_SHARED__/)
})

test('settings schema keeps the implemented export workflow controls', async () => {
  const pluginModule = await loadPluginModule()
  const settingsPage = pluginModule.manifest.settingsPages[0]

  assert.equal(settingsPage.sections.length, 2)
  assert.equal(settingsPage.sections[0]?.title, 'Default snapshot selection')
  assert.equal(settingsPage.sections[0]?.fields[0]?.path, 'defaultSnapshotSelection')
  assert.equal(settingsPage.sections[0]?.fields[0]?.kind, 'toggle')
  assert.equal(settingsPage.sections[0]?.fields[0]?.checkedValue, 'all')
  assert.equal(settingsPage.sections[0]?.fields[0]?.uncheckedValue, 'none')
  assert.equal(settingsPage.sections[1]?.title, 'Mobile progress QR')
  assert.equal(settingsPage.sections[1]?.fields[0]?.path, 'mobileProgressEnabled')
  assert.equal(settingsPage.sections[1]?.fields[0]?.kind, 'toggle')
})

test('main page can render Simplified Chinese through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ExportWorkflowPage, {
      context: {
        ...createPluginContext(),
        locale: {
          requested: 'zh-CN',
          resolved: 'zh-CN',
        },
      },
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /工程与轨道/)
  assert.match(markup, /工程/)
  assert.match(markup, /轨道列表/)
})

test('main page renders the formal three-step export workflow shell', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.doesNotMatch(markup, /Export Workflow/)
  assert.match(markup, /Session \+ tracks/)
  assert.match(markup, /Snapshots/)
  assert.match(markup, /Export settings/)
  assert.match(markup, /Session/)
  assert.match(markup, /Track list/)
  assert.match(markup, /Next: Snapshots/)
  assert.match(markup, /class="ew-stepper"/)
  assert.match(markup, /class="ew-stepper-row"/)
  assert.match(markup, /class="ew-step"/)
  assert.match(markup, /ew-step-shell ew-step-shell--session/)
  assert.match(markup, /ew-block-card ew-block-card--session/)
  assert.match(markup, /ew-block-card ew-block-card--tracks/)
  assert.match(markup, /class="ew-shell"/)
  assert.match(markup, /class="ew-main ew-main--workflow"/)
  assert.match(markup, /class="(?:ew-action-bar presto-workflow-action-bar|presto-workflow-action-bar ew-action-bar)"/)
  assert.match(markup, /presto-workflow-action-bar__inner presto-workflow-action-bar__inner--space-between/)
  assert.match(markup, /class="ew-action-slot" aria-hidden="true"><\/span>/)
  assert.doesNotMatch(markup, /Sample rate/)
  assert.doesNotMatch(markup, /Bit depth/)
  assert.doesNotMatch(markup, />Section</)
  assert.match(markup, /ew-table-wrap ew-table-wrap--tracks/)
  assert.match(markup, /class="ew-table"/)
  assert.match(markup, />Track Info<\/th>/)
  assert.match(markup, />Type<\/th>/)
  assert.match(markup, />Status<\/th>/)
})

test('session overview stays compact when live session metadata is available', async () => {
  const pageModule = await loadPageModuleWithStateOverrides({
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
        sampleRate: 48000,
        bitDepth: 24,
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Lead Vox',
          type: 'audio',
          color: '#ff4a90e2',
          is_soloed: true,
          is_muted: false,
        },
      ],
      error: '',
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Demo Session/)
  assert.match(markup, /\/Sessions\/Demo Session\.ptx/)
  assert.doesNotMatch(markup, /Sample rate/)
  assert.doesNotMatch(markup, /Bit depth/)
})

test('step 1 track list uses Status header and resolves camelCase mute\/solo flags', async () => {
  const pageModule = await loadPageModuleWithStateOverrides({
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Lead Vox',
          type: 'audio',
          color: '#ff4a90e2',
          isSoloed: true,
          isMuted: false,
        },
      ],
      error: '',
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, />Status<\/th>/)
  assert.doesNotMatch(markup, />M\/S<\/th>/)
  assert.match(markup, /ew-track-status-toggle is-soloed/)
})

test('step 2 markup keeps the legacy snapshot details action instead of inline rename controls', async () => {
  const pageModule = await loadPageModuleWithStateOverrides({
    1: 2,
    4: [createSampleSnapshot()],
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Create Snapshot/)
  assert.match(markup, /Details/)
  assert.doesNotMatch(markup, /Rename/)
  assert.match(markup, /ew-step-shell ew-step-shell--snapshots/)
  assert.match(markup, /ew-block-card ew-block-card--snapshots/)
  assert.match(markup, /ew-table-wrap ew-table-wrap--snapshots/)
  assert.match(markup, /class="ew-table"/)
  assert.match(markup, />Snapshot<\/th>/)
  assert.match(markup, />Track state<\/th>/)
  assert.match(markup, />Actions<\/th>/)
})

test('step 3 markup keeps the legacy export controls and labels', async () => {
  const idleModule = await loadPageModuleWithStateOverrides({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [
        { name: 'Ref Print', type: 'physicalOut' },
        { name: 'LV SC (Mono)', type: 'physicalOut' },
      ],
      online_export: false,
      file_prefix: 'Demo Session_',
      output_path: '/Exports',
    },
    11: [
      {
        id: 'preset-1',
        name: 'TV Mix',
        file_format: 'wav',
        mix_source_name: 'Ref Print',
        mix_source_type: 'PhysicalOut',
      },
    ],
    32: {
      physicalOut: [
        'Music (Stereo)',
        'All BV (Stereo)',
        'All BV.L (Mono)',
        'All BV.R (Mono)',
        'LV SC (Mono)',
      ],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const idleMarkup = renderToStaticMarkup(
    React.createElement(idleModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(idleMarkup, /Select snapshots to export/)
  assert.match(idleMarkup, /File Format/)
  assert.match(idleMarkup, /Mix Source/)
  assert.match(idleMarkup, /Ref Print/)
  assert.match(idleMarkup, /LV SC \(Mono\)/)
  assert.match(idleMarkup, /ew-mix-source-stack/)
  assert.match(idleMarkup, /ew-mix-source-row/)
  assert.doesNotMatch(idleMarkup, /Output Mix Source Name/)
  assert.doesNotMatch(idleMarkup, /Output Mix Source Type/)
  assert.match(idleMarkup, /<optgroup label="Physical Out">/)
  assert.match(idleMarkup, /<option value="physicalOut::All BV \(Stereo\)">All BV \(Stereo\)<\/option>/)
  assert.match(idleMarkup, /All BV \(Stereo\)/)
  assert.match(idleMarkup, /<option value="physicalOut::All BV\.L \(Mono\)">All BV\.L \(Mono\)<\/option>/)
  assert.match(idleMarkup, /<option value="physicalOut::All BV\.R \(Mono\)">All BV\.R \(Mono\)<\/option>/)
  assert.match(idleMarkup, /LV SC \(Mono\)/)
  assert.doesNotMatch(idleMarkup, /\\u00A0\\u00A0\\u00A0/)
  assert.doesNotMatch(idleMarkup, /Mix Source Type/)
  assert.match(idleMarkup, /File Prefix/)
  assert.match(idleMarkup, /Output Path/)
  assert.match(idleMarkup, /Online Export/)
  assert.doesNotMatch(idleMarkup, /Export Presets/)
  assert.doesNotMatch(idleMarkup, /Save Export Preset/)
  assert.doesNotMatch(idleMarkup, /Import Export Presets/)
  assert.doesNotMatch(idleMarkup, /Use the legacy export controls, preset workflow, and execution feedback inside the current plugin shell\./)
  assert.doesNotMatch(idleMarkup, /Keep the legacy export naming controls, grouped like the import workflow forms\./)
  assert.doesNotMatch(idleMarkup, /Choose the folder that should receive rendered files\./)
  assert.doesNotMatch(idleMarkup, /Keep the existing export-mode toggle without changing runtime behavior\./)
  assert.doesNotMatch(idleMarkup, /Bounce mode/)
  assert.doesNotMatch(idleMarkup, /Output folder/)
  assert.match(idleMarkup, /ew-step-shell ew-step-shell--export/)
  assert.match(idleMarkup, /ew-export-layout/)
  assert.match(idleMarkup, /ew-export-main/)
  assert.match(idleMarkup, /ew-export-side/)
  assert.match(idleMarkup, /ew-block-card ew-block-card--settings/)
  assert.match(idleMarkup, /ew-block-card ew-block-card--selection/)
  assert.doesNotMatch(idleMarkup, /ew-block-card ew-block-card--result/)
  assert.doesNotMatch(idleMarkup, /Mobile progress QR/)
  assert.match(idleMarkup, /ew-table-wrap ew-table-wrap--selection/)
  assert.match(idleMarkup, /class="ew-table"/)
  assert.doesNotMatch(idleMarkup, />Selection<\/th>/)
  assert.match(idleMarkup, /ew-selection-check/)
  assert.match(idleMarkup, />Start Export</)
  assert.doesNotMatch(idleMarkup, /snapshot-1/)
})

test('step 3 renders collapsed mobile progress entry that can show qr details when enabled', async () => {
  const runningModule = await loadPageModuleWithStateOverrides({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    6: {
      defaultSnapshotSelection: 'all',
      mobileProgressEnabled: true,
    },
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print (Stereo)', type: 'physicalOut' }],
      online_export: false,
      file_prefix: 'Demo Session_',
      output_path: '/Exports',
    },
    14: createRunningJobView(),
    15: 'job-1',
    32: {
      physicalOut: ['Ref Print (Stereo)'],
      bus: [],
      output: [],
      renderer: [],
    },
    35: {
      loading: false,
      sessionId: 'mob-1',
      url: 'http://127.0.0.1:43123/mobile-progress/mob-1?token=test-token',
      qrSvg: '<svg viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff"/></svg>',
      error: '',
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(runningModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Mobile progress QR/)
  assert.match(markup, /<details class="ew-mobile-progress-flyout">/)
  assert.match(markup, /<summary class="ew-mobile-progress-trigger ew-icon-button-fallback"/)
  assert.match(markup, /aria-label="Mobile progress QR"/)
  assert.match(markup, /ew-mobile-progress-popover/)
  assert.match(markup, /ew-mobile-progress-qr/)
  assert.doesNotMatch(markup, /ew-mobile-progress-popover-title/)
  assert.doesNotMatch(markup, /ew-mobile-progress-copy/)
  assert.doesNotMatch(markup, /ew-mobile-progress-url/)
  assert.doesNotMatch(markup, /ew-mobile-progress-live-grid/)
  assert.match(markup, /ew-progress-panel/)
  assert.match(markup, /ew-progress-breakdown/)
  assert.match(markup, /ew-progress-current-file/)
  assert.match(markup, /ew-progress-overall/)
  assert.match(markup, /ew-progress-shell ew-progress-shell--file/)
  assert.match(markup, /ew-progress-shell ew-progress-shell--overall/)
  assert.match(markup, /Ref Print \(Stereo\)/)
})

test('step 3 keeps export result visible after completion instead of jumping back to export settings', async () => {
  const completedModule = await loadPageModuleWithStateOverrides({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print (Stereo)', type: 'physicalOut' }],
      online_export: false,
      file_prefix: 'Demo Session_',
      output_path: '/Exports',
    },
    14: createRunningJobView({
      state: 'succeeded',
      terminalStatus: 'completed',
      progressPercent: 100,
      message: 'Export complete',
      exportedCount: 1,
      exportedFiles: ['/Exports/Verse Lead.wav'],
      success: true,
      isTerminal: true,
    }),
    15: 'job-1',
    32: {
      physicalOut: ['Ref Print (Stereo)'],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(completedModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Export complete/)
  assert.match(markup, /Export Completed!/)
  assert.match(markup, /Continue Export/)
  assert.match(markup, /Open Folder/)
  assert.match(markup, /ew-progress-panel/)
  assert.doesNotMatch(markup, /Select snapshots to export/)
})

test('snapshot detail modal renders redesigned modal sections in the live page markup', async () => {
  const snapshot = createSampleSnapshot({
    trackStates: [
      {
        trackId: 'track-1',
        trackName: 'Lead Vox',
        is_soloed: true,
        is_muted: false,
        type: 'audio',
        color: '#ff4a90e2',
      },
      {
        trackId: 'track-2',
        trackName: 'FX Stem',
        is_soloed: false,
        is_muted: true,
        type: 'aux',
        color: '#ff33cc77',
      },
    ],
  })
  const pageModule = await loadPageModuleWithStateOverrides({
    1: 2,
    4: [snapshot],
    19: snapshot.id,
    20: true,
    21: snapshot.name,
    22: snapshot.trackStates,
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /ew-modal-surface ew-modal-sheet is-wide/)
  assert.match(markup, /ew-modal-header-actions/)
  assert.match(markup, /ew-modal-body ew-modal-body--detail ew-modal-stack/)
  assert.match(markup, /ew-detail-stats ew-modal-section ew-modal-section--detail-stats/)
  assert.match(markup, /ew-stats-inline/)
  assert.match(markup, /ew-stats-inline__item/)
  assert.match(markup, /ew-detail-table-shell ew-modal-section ew-modal-section--detail-table/)
  assert.match(markup, /ew-table-wrap ew-table-wrap--detail/)
  assert.match(markup, /class="ew-detail-table ew-table"/)
  assert.match(markup, /Snapshot Track Information/)
  assert.match(markup, /Edit Name/)
  assert.doesNotMatch(markup, /ew-detail-title/)
  assert.doesNotMatch(markup, /ew-modal-section--detail-name/)
  assert.doesNotMatch(markup, /Snapshot ID:/)
  assert.doesNotMatch(markup, /track-1/)
  assert.doesNotMatch(markup, /track-2/)
  assert.match(markup, />Track Info<\/th>/)
  assert.doesNotMatch(markup, />Track<\/th>/)
  assert.match(markup, />Status<\/th>/)
})

test('page source removes preset workflow affordances from the export page', async () => {
  const pageSource = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(pageSource, /Export Presets/)
  assert.doesNotMatch(pageSource, /Save Export Preset/)
  assert.doesNotMatch(pageSource, /Import Export Presets/)
  assert.doesNotMatch(pageSource, /Preset Name/)
})

test('export page source preserves current export workflow labels and modal surfaces', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /page\.card\.selectSnapshots/)
  assert.match(source, /page\.label\.fileFormat/)
  assert.match(source, /page\.label\.mixSource/)
  assert.match(source, /MIX_SOURCE_GROUP_ORDER/)
  assert.match(source, /page\.option\.mixSourceGroup\.\$\{group\}/)
  assert.match(source, /optgroup/)
  assert.doesNotMatch(source, /\\u00A0\\u00A0\\u00A0/)
  assert.doesNotMatch(source, /page\.label\.mixSourceGroup/)
  assert.match(source, /page\.label\.filePrefix/)
  assert.match(source, /page\.label\.outputPath/)
  assert.match(source, /page\.label\.onlineExport/)
  assert.match(source, /page\.button\.startExport/)
  assert.match(source, /page\.button\.stopExport/)
  assert.match(source, /page\.button\.details/)
  assert.match(source, /failedSnapshotDetails/)
  assert.match(source, /page\.label\.status/)
  assert.match(source, /ew-table-wrap ew-table-wrap--snapshots/)
  assert.match(source, /ew-table-wrap ew-table-wrap--selection/)
  assert.match(source, /className:\s*'ew-export-layout'/)
  assert.match(source, /className:\s*'ew-export-main'/)
  assert.match(source, /className:\s*'ew-export-side'/)
  assert.match(source, /align:\s*'space-between'/)
  assert.match(source, /className:\s*'ew-action-bar'/)
  assert.match(source, /className:\s*'ew-action-slot'/)
})

test('export page source uses real track-type icon components instead of placeholder glyph characters', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /function AudioTrackIcon\(/)
  assert.match(source, /function MidiTrackIcon\(/)
  assert.match(source, /function AuxTrackIcon\(/)
  assert.match(source, /function MasterTrackIcon\(/)
  assert.match(source, /function InstrumentTrackIcon\(/)
  assert.doesNotMatch(source, /from ['"]@mui\/icons-material\//)
  assert.doesNotMatch(source, /const glyphByType = \{/)
})

test('export page source removes simplified replacements that diverge from old UI flow', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /'Rename'/)
  assert.doesNotMatch(source, /'Cancel export'/)
  assert.doesNotMatch(source, /'Apply preset'/)
  assert.doesNotMatch(source, /'Save preset'/)
})

test('snapshot step source does not render the file storage callout copy', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /File Storage/)
  assert.doesNotMatch(source, /resolve the snapshot file path/)
})

test('export page source keeps the live track list in sync while the session step is open', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /TRACK_LIST_SYNC_MS/)
  assert.match(source, /loadWorkflowState\(\{ tracksOnly: true \}\)/)
  assert.match(source, /currentStep !== 1/)
})

test('export page source loads plugin-local settings and applies the default snapshot selection policy', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /loadExportWorkflowSettings\(context\.storage\)/)
  assert.match(source, /defaultSnapshotSelection/)
  assert.match(source, /mobileProgressEnabled/)
  assert.match(source, /context\.runtime\?\.mobileProgress/)
  assert.match(source, /ew-mobile-progress-trigger/)
  assert.match(source, /page\.mobileProgress\.title/)
  assert.match(source, /ensureMobileProgressSession\(targetJobId\)/)
  assert.match(source, /mobileProgressRuntime\.updateSession\(mobileProgressView\.sessionId,\s*jobView\)/)
  assert.match(source, /currentFileProgressPercent/)
  assert.match(source, /overallProgressPercent/)
  assert.match(source, /currentMixSourceName/)
})

test('export page source resets active export state immediately after cancel', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /const resetActiveExportState = useCallback\(/)
  assert.match(source, /await context\.presto\.jobs\.cancel\(runningJobId\)/)
  assert.match(source, /resetActiveExportState\(\)/)
  assert.doesNotMatch(source, /await context\.presto\.jobs\.cancel\(runningJobId\)[\s\S]*void pollJob\(runningJobId\)/)
})

test('export css keeps import-style shell classes for cards, sections, and modals', async () => {
  const cssSource = await readFile(new URL('../dist/export-workflow.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.ew-step-shell\s*\{/)
  assert.match(cssSource, /\.ew-block-card/)
  assert.match(cssSource, /\.ew-section-panel/)
  assert.match(cssSource, /\.ew-modal-sheet/)
  assert.match(cssSource, /\.ew-modal-section/)
  assert.match(cssSource, /\.ew-settings-grid/)
  assert.match(cssSource, /\.ew-stepper-row/)
  assert.match(cssSource, /\.ew-step\s*\{/)
  assert.match(cssSource, /\.ew-table-wrap/)
  assert.match(cssSource, /\.ew-table/)
  assert.match(cssSource, /\.ew-stats-inline__item/)
  assert.match(cssSource, /\.ew-modal-header-actions/)
  assert.match(cssSource, /\.ew-modal-body--detail/)
  assert.match(cssSource, /\.ew-export-layout\s*\{/)
  assert.match(cssSource, /\.ew-export-main,\s*[\s\S]*\.ew-export-side\s*\{/)
  assert.match(cssSource, /\.ew-shell\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/)
  assert.match(cssSource, /\.ew-action-slot\s*\{/)
  assert.match(cssSource, /\.ew-row\.is-selected\s*\{[\s\S]*background:/)
  assert.doesNotMatch(cssSource, /Import-style redesign overrides/)
  assert.doesNotMatch(cssSource, /\.ew-overlay-panel/)
  assert.doesNotMatch(cssSource, /\.ew-storage-callout/)
  assert.doesNotMatch(cssSource, /\.ew-preset-launch-row/)
})

test('export css keeps the plugin stepper horizontal on narrow widths and truncates tables instead of enabling horizontal scroll', async () => {
  const cssSource = await readFile(new URL('../dist/export-workflow.css', import.meta.url), 'utf8')

  assert.doesNotMatch(cssSource, /@media \(max-width: 800px\)\s*\{[\s\S]*\.ew-stepper-row\s*\{[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(cssSource, /@media \(max-width: 800px\)\s*\{[\s\S]*\.ew-stepper-label\s*\{[\s\S]*display:\s*none;/)
  assert.doesNotMatch(cssSource, /\.ew-table\s*\{[\s\S]*min-width:\s*680px;/)
  assert.match(cssSource, /\.ew-table-wrap\s*\{[\s\S]*overflow-x:\s*hidden;/)
  assert.match(cssSource, /\.ew-main\s*\{[\s\S]*scrollbar-gutter:\s*stable;/)
})
