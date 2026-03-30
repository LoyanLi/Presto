import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pluginModulePromise = null

function createPluginContext() {
  return {
    pluginId: 'official.import-workflow',
    locale: {
      requested: 'en',
      resolved: 'en',
    },
    presto: {
      import: {
        run: {
          start: async () => ({ jobId: 'job-test' }),
        },
      },
      track: {
        listNames: async () => ({ names: [] }),
        rename: async () => {},
        select: async () => {},
        color: {
          apply: async () => {},
        },
      },
      stripSilence: {
        open: async () => {},
        execute: async () => {},
      },
      clip: {
        selectAllOnTrack: async () => {},
      },
      session: {
        save: async () => {},
      },
      jobs: {
        get: async () => ({
          state: 'succeeded',
          progress: {
            current: 0,
            total: 0,
            percent: 0,
          },
        }),
        cancel: async () => {},
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: true, paths: [] }),
      },
      fs: {
        readFile: async () => null,
        writeFile: async () => {},
        ensureDir: async () => {},
        readdir: async () => [],
        stat: async () => ({ isDirectory: false }),
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

test('plugin module exports workflow manifest and page export', async () => {
  const pluginModule = await loadPluginModule()
  assert.equal(pluginModule.manifest.pluginId, 'official.import-workflow')
  assert.equal(pluginModule.manifest.entry, 'dist/entry.mjs')
  assert.equal(pluginModule.manifest.styleEntry, 'dist/import-workflow.css')
  assert.equal(pluginModule.manifest.pages[0]?.componentExport, 'ImportWorkflowPage')
  assert.equal(pluginModule.manifest.pages.length, 1)
  assert.equal(pluginModule.manifest.navigationItems.length, 1)
  assert.equal(pluginModule.manifest.settingsPages[0]?.pageId, 'import-workflow.page.settings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.loadExport, 'loadImportWorkflowSettings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.saveExport, 'saveImportWorkflowSettings')
  assert.equal(typeof pluginModule.activate, 'function')
  assert.equal(typeof pluginModule.ImportWorkflowPage, 'function')
  assert.equal(typeof pluginModule.loadImportWorkflowSettings, 'function')
  assert.equal(typeof pluginModule.saveImportWorkflowSettings, 'function')
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
      (item) => item.moduleId === 'import' && item.minVersion === '2025.10.0',
    ),
    true,
  )
  assert.equal(Array.isArray(fileManifest.capabilityRequirements), true)
  assert.equal(fileManifest.capabilityRequirements.length > 0, true)
  assert.equal(
    fileManifest.capabilityRequirements.some(
      (item) => item.capabilityId === 'import.run.start' && item.minVersion === '2025.10.0',
    ),
    true,
  )
  assert.deepEqual(fileManifest.settingsPages, pluginModule.manifest.settingsPages)
})

test('dist modules resolve React through a plugin-local shared helper', async () => {
  const [pageSource, entrySource, uiSource, helperSource] = await Promise.all([
    readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/react-shared.mjs', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pageSource, /from ['"]react['"]/)
  assert.doesNotMatch(uiSource, /from ['"]react['"]/)
  assert.match(pageSource, /react-shared\.mjs/)
  assert.doesNotMatch(entrySource, /ImportWorkflowSettingsPage/)
  assert.match(uiSource, /react-shared\.mjs/)
  assert.match(helperSource, /__PRESTO_PLUGIN_SHARED__/)
})

test('settings schema stays declarative and keeps the implemented import controls', async () => {
  const pluginModule = await loadPluginModule()
  const settingsPage = pluginModule.manifest.settingsPages[0]

  assert.equal(settingsPage.sections.length, 3)
  assert.equal(settingsPage.sections[0]?.title, 'AI naming')
  assert.equal(settingsPage.sections[1]?.title, 'Run defaults')
  assert.equal(settingsPage.sections[2]?.title, 'Categories and colors')
  assert.equal(settingsPage.sections[2]?.fields[0]?.kind, 'categoryList')
  assert.equal(settingsPage.sections[2]?.fields[0]?.path, 'categories')
  assert.equal(settingsPage.sections[0]?.fields.some((field) => field.path === 'aiConfig.prompt'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.analyzeCacheEnabled'), true)
  assert.equal(settingsPage.sections.flatMap((section) => section.fields).some((field) => field.path === 'silenceProfile.thresholdDb'), false)
})

test('main page does not render a plugin logs panel', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Analyze and edit/)
  assert.match(markup, /Strip setup/)
  assert.match(markup, /Run import/)
  assert.doesNotMatch(markup, /iw-title/)
  assert.doesNotMatch(markup, /Session overview/)
  assert.doesNotMatch(markup, /Select a folder or audio files to begin\./)
  assert.doesNotMatch(markup, /Logs/)
  assert.doesNotMatch(markup, /No log entries yet\./)
  assert.match(markup, /Pending/)
  assert.match(markup, /Ready/)
  assert.match(markup, /Failed/)
  assert.match(markup, /Skipped/)
  assert.match(markup, /Prepared files/)
  assert.doesNotMatch(markup, /Batch edit/)
  assert.match(markup, /Scan folder/)
  assert.match(markup, /Run AI analyze/)
  assert.match(markup, /Clear/)
  assert.match(markup, />Previous</)
  assert.match(markup, />Next: Strip setup</)
  assert.doesNotMatch(markup, />Back</)
  assert.doesNotMatch(markup, />Next</)
  assert.doesNotMatch(markup, /Column display/)
  assert.doesNotMatch(markup, /File width/)
  assert.doesNotMatch(markup, /Status width/)
  assert.doesNotMatch(markup, /Open Strip Silence/)
  assert.doesNotMatch(markup, /Execution uses public capabilities only/)
  assert.ok(markup.indexOf('iw-stepper') < markup.indexOf('Prepared files'))
  assert.ok(markup.indexOf('Prepared files') < markup.indexOf('Scan folder'))
})

test('main page renders localized strings through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const localizedContext = {
    ...createPluginContext(),
    locale: {
      requested: 'zh-CN',
      resolved: 'zh-CN',
    },
  }
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: localizedContext,
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /草稿概览/)
  assert.match(markup, /待导入文件/)
  assert.match(markup, /分析与编辑/)
})

test('settings schema does not expose log display preferences', async () => {
  const pluginModule = await loadPluginModule()
  const serialized = JSON.stringify(pluginModule.manifest.settingsPages)
  assert.doesNotMatch(serialized, /Collapse logs by default/)
})

test('main page can render Simplified Chinese through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
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

  assert.match(markup, /分析与编辑/)
  assert.match(markup, /草稿概览/)
  assert.match(markup, /待导入文件/)
  assert.match(markup, /扫描文件夹/)
  assert.match(markup, /下一步：Strip 设置/)
})

test('settings schema keeps AI naming and category editor semantics while page CSS stays single-column', async () => {
  const [entrySource, cssSource] = await Promise.all([
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8'),
  ])

  assert.match(entrySource, /title:\s*'AI naming'/)
  assert.match(entrySource, /kind:\s*'categoryList'/)
  assert.match(cssSource, /\.iw-settings-grid[\s\S]*grid-template-columns:\s*1fr/)
})

test('workflow page keeps bottom actions pinned while main content scrolls within page height', async () => {
  const pluginModule = await loadPluginModule()
  const [pageSource, cssSource] = await Promise.all([
    readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8'),
  ])
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(pageSource, /className:\s*'iw-main[^']*'/)
  assert.match(pageSource, /WorkflowActionBar/)
  assert.match(pageSource, /align:\s*'space-between'/)
  assert.match(markup, /class="iw-main[^"]*"[\s\S]*class="(?:iw-action-bar presto-workflow-action-bar|presto-workflow-action-bar iw-action-bar)[^"]*"/)
  assert.match(markup, /presto-workflow-action-bar__inner presto-workflow-action-bar__inner--space-between/)
  assert.match(cssSource, /\.iw-shell[\s\S]*display:\s*grid[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto[\s\S]*height:\s*100%/)
  assert.match(cssSource, /\.iw-main[\s\S]*overflow:\s*auto[\s\S]*min-height:\s*0/)
  assert.match(cssSource, /\.iw-action-bar[\s\S]*background:\s*transparent/)
  assert.match(cssSource, /\.iw-action-bar-inner[\s\S]*justify-content:\s*space-between/)
})

test('workflow action bar reflows on narrow windows instead of forcing horizontal overflow', async () => {
  const cssSource = await readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*\.iw-action-bar-inner[\s\S]*flex-wrap:\s*wrap/)
  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*\.iw-action-bar-inner > \*[\s\S]*flex:\s*1 1 140px/)
  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*\.iw-action-bar[\s\S]*padding:\s*10px 16px/)
})

test('main page source removes the checkbox column and table configuration ui while declarative settings stay schema-only', async () => {
  const [pageSource, entrySource, cssSource] = await Promise.all([
    readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pageSource, /type:\s*'checkbox'/)
  assert.doesNotMatch(pageSource, /h\('th', null, ''\)/)
  assert.doesNotMatch(pageSource, /iw-table-config/)
  assert.doesNotMatch(pageSource, /updatePreparedColumnVisibility/)
  assert.doesNotMatch(pageSource, /updatePreparedColumnWidth/)
  assert.doesNotMatch(pageSource, /Threshold/)
  assert.doesNotMatch(pageSource, /Add audio files/)
  assert.doesNotMatch(pageSource, /Start import/)
  assert.match(pageSource, /folderPaths:\s*sourceFolders/)
  assert.match(pageSource, /orderedFilePaths/)
  assert.match(pageSource, /rows:\s*sortedRows/)
  assert.match(pageSource, /persistCache\(next\)/)
  assert.match(entrySource, /kind:\s*'categoryList'/)
  assert.match(pageSource, /return next/)
  assert.doesNotMatch(pageSource, /const sorted = sortRowsForDisplay\(next, settings\.categories\)/)
  assert.match(pageSource, /page\.meta\.stage/)
  assert.match(pageSource, /page\.meta\.items/)
  assert.match(pageSource, /page\.meta\.job/)
  assert.match(pageSource, /page\.job\.na/)
  assert.doesNotMatch(pageSource, /Progress:\s*\$\{runState\.current\}\/\$\{runState\.total \|\| 0\}/)
  assert.match(entrySource, /title:\s*'AI naming'/)
  assert.match(entrySource, /title:\s*'Run defaults'/)
  assert.match(entrySource, /title:\s*'Categories and colors'/)
  assert.match(entrySource, /kind:\s*'categoryList'/)
  assert.doesNotMatch(entrySource, /ImportWorkflowSettingsPage/)
  assert.match(cssSource, /\.iw-settings-grid[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(cssSource, /\.iw-form-stack[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(cssSource, /\.iw-table-wrap[\s\S]*user-select:\s*none/)
  assert.match(cssSource, /\.iw-table-wrap--prepared[\s\S]*max-height:/)
  assert.match(cssSource, /\.iw-table-wrap input,[\s\S]*user-select:\s*text/)
  assert.match(pageSource, /className:\s*'iw-main iw-main--workflow'/)
  assert.match(pageSource, /className:\s*'iw-action-bar--workflow'/)
  assert.match(cssSource, /\.iw-shell[\s\S]*min-height:\s*0/)
  assert.match(cssSource, /\.iw-main--workflow[\s\S]*overflow:\s*auto/)
  assert.match(pageSource, /align:\s*'space-between'/)
  assert.match(cssSource, /\.iw-action-bar--workflow[\s\S]*padding-top:\s*14px/)
  assert.match(cssSource, /\.iw-stepper-row[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(cssSource, /\.iw-file-path[\s\S]*text-overflow:\s*ellipsis/)
})
