import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const execFile = promisify(execFileCallback)

let pluginModulePromise = null

function createSharedUiMock() {
  return {
    Panel({ title, description, actions, children, className }) {
      return React.createElement(
        'section',
        { className: ['ui-panel', className].filter(Boolean).join(' ') },
        title || description || actions
          ? React.createElement(
              'header',
              { className: 'ui-panel__header' },
              React.createElement(
                'div',
                { className: 'ui-panel__header-main' },
                title ? React.createElement('h2', { className: 'ui-panel__title' }, title) : null,
                description ? React.createElement('p', { className: 'ui-panel__description' }, description) : null,
              ),
              actions ? React.createElement('div', { className: 'ui-panel__actions' }, actions) : null,
            )
          : null,
        React.createElement('div', { className: 'ui-panel__body' }, children),
      )
    },
    Input({ label, hint, className, ...props }) {
      return React.createElement(
        'label',
        { className: ['ui-input', className].filter(Boolean).join(' ') },
        label ? React.createElement('span', null, label) : null,
        React.createElement('input', props),
        hint ? React.createElement('span', null, hint) : null,
      )
    },
    Button({ children, className, ...props }) {
      return React.createElement(
        'button',
        {
          ...props,
          type: props.type ?? 'button',
          className: ['ui-button', className].filter(Boolean).join(' '),
        },
        children,
      )
    },
    StatChip({ label, value, className }) {
      return React.createElement(
        'div',
        { className: ['ui-stat-chip', className].filter(Boolean).join(' ') },
        React.createElement('span', null, label),
        React.createElement('strong', null, String(value)),
      )
    },
  }
}

function createHostMock(overrides = {}) {
  return {
    dialog: {
      openDirectory: async () => ({ canceled: true, paths: [] }),
      ...(overrides.dialog ?? {}),
    },
    fs: {
      exists: async () => false,
      ...(overrides.fs ?? {}),
    },
    shell: {
      openPath: async () => 'ok',
      ...(overrides.shell ?? {}),
    },
    runTool: async () => ({
      jobId: 'job-tool-run',
      job: {
        jobId: 'job-tool-run',
        capability: 'tool.run',
        state: 'succeeded',
        progress: { current: 1, total: 1, percent: 100 },
        result: {
          summary: 'Music mix project created.',
          result: {
            createdRoot: '/tmp/mixes/260501_Blue Sky',
            createdDirectories: ['01_Received'],
            createdFiles: [],
          },
        },
      },
    }),
    ...overrides,
  }
}

async function loadPluginModule() {
  if (!pluginModulePromise) {
    const previousWindow = globalThis.window
    globalThis.window = {
      __PRESTO_PLUGIN_SHARED__: {
        React,
        ui: createSharedUiMock(),
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

async function loadPageModuleWithHookHarness(overrides = {}) {
  const previousWindow = globalThis.window
  const originals = {
    useState: React.useState,
    useMemo: React.useMemo,
    useCallback: React.useCallback,
    useEffect: React.useEffect,
  }
  let stateCallIndex = 0

  React.useState = (initialValue) => {
    stateCallIndex += 1
    const resolvedInitialValue = typeof initialValue === 'function' ? initialValue() : initialValue
    const resolvedValue = Object.prototype.hasOwnProperty.call(overrides, stateCallIndex)
      ? overrides[stateCallIndex]
      : resolvedInitialValue
    return [resolvedValue, () => {}]
  }
  React.useMemo = (factory) => factory()
  React.useCallback = (callback) => callback
  React.useEffect = () => {}

  globalThis.window = {
    __PRESTO_PLUGIN_SHARED__: {
      React,
      ui: createSharedUiMock(),
    },
  }

  const restore = () => {
    React.useState = originals.useState
    React.useMemo = originals.useMemo
    React.useCallback = originals.useCallback
    React.useEffect = originals.useEffect
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
  }

  try {
    const pageUrl = new URL('../dist/MusicMixProjectToolPage.mjs', import.meta.url)
    pageUrl.searchParams.set('test', String(Date.now()))
    pageUrl.searchParams.set('scenario', Math.random().toString(36).slice(2))
    const pageModule = await import(pageUrl.href)
    return { pageModule, restore }
  } catch (error) {
    restore()
    throw error
  }
}

function getElementText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(getElementText).join('')
  }
  return getElementText(node.props?.children)
}

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') {
    return null
  }
  if (predicate(node)) {
    return node
  }
  const children = node.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElement(child, predicate)
      if (found) {
        return found
      }
    }
    return null
  }
  return findElement(children, predicate)
}

test('music mix project tool manifest stays aligned between file and entry export', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.equal(fileManifest.styleEntry, pluginModule.manifest.styleEntry)
  assert.equal(fileManifest.extensionType, 'tool')
  assert.deepEqual(fileManifest.supportedDaws, [])
  assert.deepEqual(fileManifest.pages, pluginModule.manifest.pages)
  assert.deepEqual(fileManifest.tools, pluginModule.manifest.tools)
  assert.deepEqual(fileManifest.toolRuntimePermissions, pluginModule.manifest.toolRuntimePermissions)
  assert.deepEqual(fileManifest.bundledResources, pluginModule.manifest.bundledResources)
  assert.deepEqual(fileManifest.requiredCapabilities, [])
})

test('tool manifest declares only the required permissions and bundled script resource', async () => {
  const pluginModule = await loadPluginModule()

  assert.equal(pluginModule.manifest.pluginId, 'loyan.music-mix-project-tool')
  assert.equal(pluginModule.manifest.pages[0]?.path, '/tools/music-mix-project-tool')
  assert.equal(pluginModule.manifest.pages[0]?.mount, 'tools')
  assert.equal(pluginModule.manifest.tools[0]?.runnerExport, 'runMusicMixProjectTool')
  assert.deepEqual(pluginModule.manifest.toolRuntimePermissions, [
    'dialog.openDirectory',
    'fs.read',
    'shell.openPath',
    'process.execBundled',
  ])
  assert.deepEqual(
    pluginModule.manifest.bundledResources.map((resource) => resource.resourceId),
    ['music-mix-project-script'],
  )
})

test('tool page renders required inputs, checkboxes, storage-backed copy, and preview', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: '/tmp/mixes',
    2: '2026-05-01',
    3: 'Blue Sky',
    4: ['01_Received', '02_DAW_Projects', '03_Exports', '04_Documents', '05_Archive'],
    5: '',
    6: false,
    7: null,
  })

  try {
    const markup = renderToStaticMarkup(
      React.createElement(pageModule.MusicMixProjectToolPage, {
        context: {
          locale: { requested: 'en', resolved: 'en' },
          storage: {
            async get() {
              return null
            },
            async set() {},
          },
        },
        host: createHostMock(),
      }),
    )

    assert.match(markup, /Base Root/)
    assert.match(markup, /Date/)
    assert.match(markup, /Song Name/)
    assert.match(markup, /01_Received/)
    assert.match(markup, /02_DAW_Projects/)
    assert.match(markup, /03_Exports/)
    assert.match(markup, /04_Documents/)
    assert.match(markup, /05_Archive/)
    assert.match(markup, /260501_Blue Sky/)
    assert.match(markup, /\/tmp\/mixes\/260501_Blue Sky/)
    assert.match(markup, /Create Project/)
    assert.match(markup, /Remembered as the default base root/)
  } finally {
    restore()
  }
})

test('tool page source routes create actions through host.runTool and plugin-local storage', async () => {
  const [pageSource, cssSource] = await Promise.all([
    readFile(new URL('../dist/MusicMixProjectToolPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/music-mix-project-tool.css', import.meta.url), 'utf8'),
  ])

  assert.match(pageSource, /host\.runTool/)
  assert.match(pageSource, /context\.storage/)
  assert.match(pageSource, /shell\.openPath/)
  assert.match(cssSource, /\.mmpt-preview-path\s*\{/)
  assert.match(cssSource, /\.mmpt-section-grid\s*\{/)
})

test('create action calls host.runTool with the normalized project payload', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: '/tmp/mixes',
    2: '2026-05-01',
    3: 'Blue Sky',
    4: ['01_Received', '04_Documents'],
    5: '',
    6: false,
    7: null,
  })
  const calls = []
  const host = createHostMock({
    runTool: async (request) => {
      calls.push(request)
      return {
        jobId: 'job-music-mix-create',
        job: {
          jobId: 'job-music-mix-create',
          capability: 'tool.run',
          state: 'succeeded',
          progress: { current: 1, total: 1, percent: 100 },
          result: {
            summary: 'Music mix project created.',
            result: {
              createdRoot: '/tmp/mixes/260501_Blue Sky',
              createdDirectories: ['01_Received', '04_Documents'],
              createdFiles: [
                '/tmp/mixes/260501_Blue Sky/04_Documents/00_Project_Notes.md',
                '/tmp/mixes/260501_Blue Sky/04_Documents/01_Revision_Log.md',
              ],
            },
          },
        },
      }
    },
  })

  try {
    const tree = pageModule.MusicMixProjectToolPage({
      context: {
        locale: { requested: 'en', resolved: 'en' },
        storage: {
          async get() {
            return null
          },
          async set() {},
        },
      },
      host,
    })
    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Create Project',
    )

    assert.ok(runButton, 'expected the page to expose a Create Project action')
    await runButton.props.onClick()
  } finally {
    restore()
  }

  assert.deepEqual(calls, [
    {
      toolId: 'music-mix-project-tool',
      input: {
        baseRoot: '/tmp/mixes',
        date: '260501',
        songName: 'Blue Sky',
        sections: ['01_Received', '04_Documents'],
      },
    },
  ])
})

test('runner blocks when the target path already exists', async () => {
  const pluginModule = await loadPluginModule()
  let execCalls = 0

  await assert.rejects(
    () =>
      pluginModule.runMusicMixProjectTool(
        {
          fs: {
            async exists() {
              return true
            },
          },
          process: {
            async execBundled() {
              execCalls += 1
              throw new Error('runner should not execute when the folder already exists')
            },
          },
          locale: { requested: 'en', resolved: 'en' },
        },
        {
          baseRoot: '/tmp/mixes',
          date: '2026-05-01',
          songName: 'Blue Sky',
          sections: ['01_Received'],
        },
      ),
    /already exists/i,
  )

  assert.equal(execCalls, 0)
})

test('runner executes the bundled create-project script with the expected args', async () => {
  const pluginModule = await loadPluginModule()

  const calls = []
  const result = await pluginModule.runMusicMixProjectTool(
    {
      fs: {
        async exists() {
          return false
        },
      },
      process: {
        async execBundled(resourceId, args) {
          calls.push({ resourceId, args })
          return {
            ok: true,
            exitCode: 0,
            stdout: [
              'CREATED_ROOT=/tmp/mixes/260501_Blue Sky',
              'CREATED_DIR=/tmp/mixes/260501_Blue Sky/01_Received',
              'CREATED_DIR=/tmp/mixes/260501_Blue Sky/04_Documents',
              'CREATED_FILE=/tmp/mixes/260501_Blue Sky/04_Documents/00_Project_Notes.md',
              'CREATED_FILE=/tmp/mixes/260501_Blue Sky/04_Documents/01_Revision_Log.md',
            ].join('\n'),
            stderr: '',
          }
        },
      },
      locale: { requested: 'en', resolved: 'en' },
    },
    {
      baseRoot: '/tmp/mixes',
      date: '2026-05-01',
      songName: 'Blue Sky',
      sections: ['01_Received', '04_Documents'],
    },
  )

  assert.deepEqual(calls, [
    {
      resourceId: 'music-mix-project-script',
      args: [
        '--base-root',
        '/tmp/mixes',
        '--folder-name',
        '260501_Blue Sky',
        '--section',
        '01_Received',
        '--section',
        '04_Documents',
      ],
    },
  ])
  assert.equal(result.result.createdRoot, '/tmp/mixes/260501_Blue Sky')
  assert.deepEqual(result.result.createdDirectories, [
    '/tmp/mixes/260501_Blue Sky/01_Received',
    '/tmp/mixes/260501_Blue Sky/04_Documents',
  ])
  assert.deepEqual(result.result.createdFiles, [
    '/tmp/mixes/260501_Blue Sky/04_Documents/00_Project_Notes.md',
    '/tmp/mixes/260501_Blue Sky/04_Documents/01_Revision_Log.md',
  ])
})

test('bundled shell script creates the expected directories and document files', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'music-mix-project-tool-'))
  const scriptPath = fileURLToPath(new URL('../resources/scripts/create_project.sh', import.meta.url))

  try {
    const execution = await execFile('bash', [
      scriptPath,
      '--base-root',
      tempRoot,
      '--folder-name',
      '260501_Blue Sky',
      '--section',
      '01_Received',
      '--section',
      '04_Documents',
      '--section',
      '05_Archive',
    ])

    const createdRoot = path.join(tempRoot, '260501_Blue Sky')
    const projectNotesPath = path.join(createdRoot, '04_Documents', '00_Project_Notes.md')
    const revisionLogPath = path.join(createdRoot, '04_Documents', '01_Revision_Log.md')

    await access(path.join(createdRoot, '01_Received'))
    await access(path.join(createdRoot, '04_Documents'))
    await access(path.join(createdRoot, '05_Archive'))
    await access(projectNotesPath)
    await access(revisionLogPath)

    const notesSource = await readFile(projectNotesPath, 'utf8')
    const revisionSource = await readFile(revisionLogPath, 'utf8')

    assert.match(execution.stdout, /CREATED_ROOT=/)
    assert.match(execution.stdout, /CREATED_DIR=.*01_Received/)
    assert.match(execution.stdout, /CREATED_FILE=.*00_Project_Notes\.md/)
    assert.match(notesSource, /Project Notes/)
    assert.match(revisionSource, /Revision Log/)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
