import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pluginModulePromise = null

function createSharedUiMock() {
  return {
    Panel({ title, description, children, className }) {
      return React.createElement(
        'section',
        { className: ['ui-panel', className].filter(Boolean).join(' ') },
        title || description
          ? React.createElement(
              'header',
              { className: 'ui-panel__header' },
              React.createElement('h2', { className: 'ui-panel__title' }, title),
              description ? React.createElement('p', { className: 'ui-panel__description' }, description) : null,
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
    Select({ label, options = [], className, ...props }) {
      return React.createElement(
        'label',
        { className: ['ui-select', className].filter(Boolean).join(' ') },
        label ? React.createElement('span', null, label) : null,
        React.createElement(
          'select',
          props,
          options.map((option) =>
            React.createElement('option', { key: option.value, value: option.value }, option.label),
          ),
        ),
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

test('time calculator manifest stays aligned between file and entry export', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.equal(fileManifest.styleEntry, pluginModule.manifest.styleEntry)
  assert.deepEqual(fileManifest.pages, pluginModule.manifest.pages)
  assert.deepEqual(fileManifest.requiredCapabilities, [])
  assert.equal(pluginModule.manifest.pages[0]?.mount, 'tools')
  assert.equal(typeof pluginModule.TimeCalculatorToolPage, 'function')
})

test('time calculator plugin resolves zh-CN manifest strings inside the plugin', async () => {
  const pluginModule = await loadPluginModule()
  const localizedManifest = pluginModule.resolveManifest({
    requested: 'zh-CN',
    resolved: 'zh-CN',
  })

  assert.equal(localizedManifest.displayName, '时间计算器')
  assert.equal(localizedManifest.pages[0]?.title, '时间计算器')
})

test('time calculator page renders bpm, reverse bpm, and reverb sections in tools style', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.TimeCalculatorToolPage, {
      context: {
        locale: {
          requested: 'en',
          resolved: 'en',
        },
      },
    }),
  )

  assert.match(markup, /BPM to Time/)
  assert.match(markup, /Time to BPM/)
  assert.match(markup, /Reverb \/ Pre-delay/)
  assert.match(markup, /500 ms/)
  assert.match(markup, /4 s/)
  assert.match(markup, /ui-panel/)
  assert.doesNotMatch(markup, /tc-header/)
})

test('time calculator page renders Simplified Chinese through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.TimeCalculatorToolPage, {
      context: {
        locale: {
          requested: 'zh-CN',
          resolved: 'zh-CN',
        },
      },
    }),
  )

  assert.match(markup, /BPM 转时间/)
  assert.match(markup, /时间反推 BPM/)
  assert.match(markup, /混响 \/ 预延迟/)
  assert.doesNotMatch(markup, /tc-header/)
})

test('time calculator css keeps common durations in a scrollable list region', async () => {
  const cssSource = await readFile(new URL('../dist/time-calculator-tool.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.tc-duration-list\s*\{[\s\S]*max-height:\s*240px;[\s\S]*overflow-y:\s*auto;/)
})
