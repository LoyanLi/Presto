import React from 'react'
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'

import type {
  PluginAutomationItemDefinition,
  PluginAutomationRunner,
  PluginAutomationRunnerContext,
  PluginLocaleContext,
  PluginLogger,
  PluginPageHost,
  PluginPageProps,
  PluginStorage,
  PrestoClient,
  WorkflowPluginModule,
} from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type {
  PluginRuntimeIssue,
  PluginRuntimeListResult,
} from '@presto/sdk-runtime/clients/plugins'
import {
  activatePlugin,
  createPluginRuntime,
  mountPluginCommands,
  mountPluginNavigation,
  mountPluginPages,
} from '../../host-plugin-runtime/browser'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginIssue,
  HostPluginManagerModel,
  HostPluginOrigin,
  HostPluginRecord,
  HostPluginSettingsEntry,
  HostRenderedPluginPage,
} from './pluginHostTypes'

export interface LoadedHostPlugins {
  automationEntries: HostAutomationEntry[]
  homeEntries: HostPluginHomeEntry[]
  pages: HostRenderedPluginPage[]
  managerModel: HostPluginManagerModel
}

export interface LoadHostPluginsInput {
  catalog: PluginRuntimeListResult
  locale: PluginLocaleContext
  presto: PrestoClient
  runtime: Pick<PrestoRuntime, 'dialog'> & Partial<Pick<PrestoRuntime, 'macAccessibility'>>
}

type PluginModuleNamespace = WorkflowPluginModule & Record<string, unknown>
type SettingsLoadFunction = (storage: PluginStorage) => Promise<Record<string, unknown>> | Record<string, unknown>
type SettingsSaveFunction = (
  storage: PluginStorage,
  settings: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>

const unavailableMacAccessibility = {
  async preflight() {
    return {
      ok: false,
      trusted: false,
      error: 'macAccessibility runtime is unavailable in this host shell.',
    }
  },
  async runScript() {
    return {
      ok: false,
      stdout: '',
      error: {
        code: 'MAC_ACCESSIBILITY_UNAVAILABLE',
        message: 'macAccessibility runtime is unavailable in this host shell.',
      },
    }
  },
  async runFile() {
    return {
      ok: false,
      stdout: '',
      error: {
        code: 'MAC_ACCESSIBILITY_UNAVAILABLE',
        message: 'macAccessibility runtime is unavailable in this host shell.',
      },
    }
  },
}

const inMemoryStorage = new Map<string, string>()

function encodeTauriAssetPath(pathValue: string): string {
  const normalizedPath = pathValue.replace(/\\/g, '/')
  const hasLeadingSlash = normalizedPath.startsWith('/')
  const segments = normalizedPath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment))

  if (!hasLeadingSlash) {
    return `/${segments.join('/')}`
  }

  const [firstSegment = '', ...remainingSegments] = segments
  const encodedRootedFirstSegment = encodeURIComponent(`/${decodeURIComponent(firstSegment)}`)
  return `/${[encodedRootedFirstSegment, ...remainingSegments].join('/')}`
}

function toRuntimeAssetUrl(pathValue: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(pathValue)) {
    return pathValue
  }

  if (isTauri()) {
    return convertFileSrc(pathValue)
  }

  return new URL(pathValue, 'file://').href
}

export function toRuntimeModuleUrl(pathValue: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(pathValue)) {
    return pathValue
  }

  if (isTauri()) {
    const runtimeAssetUrl = convertFileSrc(pathValue)
    return new URL(encodeTauriAssetPath(pathValue), runtimeAssetUrl).href
  }

  return new URL(pathValue, 'file://').href
}

function createHostPluginStorage(): PluginStorage {
  const storageApi = typeof window !== 'undefined' ? window.localStorage : null

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = storageApi ? storageApi.getItem(key) : inMemoryStorage.get(key) ?? null
      if (!raw) {
        return null
      }

      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      const encoded = JSON.stringify(value)
      if (storageApi) {
        storageApi.setItem(key, encoded)
        return
      }
      inMemoryStorage.set(key, encoded)
    },
    async delete(key: string): Promise<void> {
      if (storageApi) {
        storageApi.removeItem(key)
        return
      }
      inMemoryStorage.delete(key)
    },
  }
}

function createHostPluginLogger(): PluginLogger {
  return {
    debug(message, meta) {
      console.debug(message, meta)
    },
    info(message, meta) {
      console.info(message, meta)
    },
    warn(message, meta) {
      console.warn(message, meta)
    },
    error(message, meta) {
      console.error(message, meta)
    },
  }
}

function cloneSettingsValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function determineOrigin(pluginId: string): HostPluginOrigin {
  return pluginId.startsWith('official.') ? 'official' : 'installed'
}

function buildWorkflowHomeEntry(plugin: LoadHostPluginsInput['catalog']['plugins'][number], page: {
  pluginId: string
  pageId: string
  title: string
}): HostPluginHomeEntry {
  return {
    pluginId: page.pluginId,
    pageId: page.pageId,
    title: page.title,
    description: plugin.manifest.description ?? `${plugin.displayName} plugin page.`,
    actionLabel: 'Open Plugin',
  }
}

function renderPluginLoadFailurePage(title: string, message: string): () => React.ReactElement {
  return () =>
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gap: 12,
          padding: 24,
          borderRadius: 24,
          border: '1px solid rgba(188, 195, 208, 0.9)',
          background: 'rgba(244, 246, 251, 0.96)',
        },
      },
      React.createElement(
        'div',
        { style: { display: 'grid', gap: 6 } },
        React.createElement('h2', { style: { margin: 0, fontSize: 20, fontWeight: 600 } }, title),
        React.createElement(
          'p',
          { style: { margin: 0, fontSize: 14, lineHeight: 1.5, color: 'rgba(80, 88, 102, 0.95)' } },
          'This workflow failed to load in the renderer.',
        ),
      ),
      React.createElement(
        'pre',
        {
          style: {
            margin: 0,
            padding: 12,
            borderRadius: 16,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            lineHeight: 1.5,
            background: 'rgba(255, 255, 255, 0.92)',
          },
        },
        message,
      ),
    )
}

function formatPluginIssue(issue: PluginRuntimeIssue): HostPluginIssue {
  if (issue.reason.startsWith('manifest_validation:')) {
    const [, field = 'manifest', detail = 'validation_failed'] = issue.reason.split(':')
    return {
      scope: 'manifest',
      message: `${field}: ${detail}`,
      reason: issue.reason,
      pluginRoot: issue.pluginRoot,
    }
  }

  if (issue.reason.startsWith('permission_validation:')) {
    const [, field = 'permissions', detail = 'validation_failed'] = issue.reason.split(':')
    return {
      scope: 'permission',
      message: `${field}: ${detail}`,
      reason: issue.reason,
      pluginRoot: issue.pluginRoot,
    }
  }

  if (issue.reason.startsWith('daw_support_validation:')) {
    const [, field = 'supportedDaws', detail = 'validation_failed'] = issue.reason.split(':')
    return {
      scope: 'daw_support',
      message: `${field}: ${detail}`,
      reason: issue.reason,
      pluginRoot: issue.pluginRoot,
    }
  }

  return {
    scope: issue.category,
    message: issue.reason,
    reason: issue.reason,
    pluginRoot: issue.pluginRoot,
  }
}

function extractStaticModuleImports(sourceText: string): string[] {
  const importMatches = sourceText.matchAll(/import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g)
  return Array.from(new Set(Array.from(importMatches, (match) => match[1]).filter(Boolean)))
}

async function inspectModuleImportFailure(entryPath: string, importUrl: string, error: unknown): Promise<string> {
  const diagnostics: string[] = []
  const message = error instanceof Error ? error.message : 'module_import_failed'
  diagnostics.push(message)
  diagnostics.push(`entryPath: ${entryPath}`)
  diagnostics.push(`importUrl: ${importUrl}`)

  if (isTauri()) {
    diagnostics.push(`assetUrl: ${convertFileSrc(entryPath)}`)
  }

  if (typeof fetch === 'function') {
    try {
      const response = await fetch(importUrl)
      diagnostics.push(`fetch.ok: ${response.ok}`)
      diagnostics.push(`fetch.status: ${response.status}`)
      diagnostics.push(`fetch.contentType: ${response.headers.get('content-type') ?? 'unknown'}`)
      const sourceText = await response.text()
      diagnostics.push(`fetch.length: ${sourceText.length}`)
      const staticImports = extractStaticModuleImports(sourceText)
      if (staticImports.length > 0) {
        diagnostics.push(`entryImports: ${staticImports.join(', ')}`)
      }
    } catch (fetchError) {
      diagnostics.push(`fetchError: ${fetchError instanceof Error ? fetchError.message : 'unknown_fetch_error'}`)
    }
  }

  return diagnostics.join('\n')
}

async function loadRendererPluginModule(entryPath: string): Promise<{
  ok: boolean
  module?: PluginModuleNamespace
  issue?: PluginRuntimeIssue
}> {
  const importUrl = toRuntimeModuleUrl(entryPath)

  try {
    const moduleNamespace = (await import(/* @vite-ignore */ importUrl)) as PluginModuleNamespace
    if (typeof moduleNamespace.activate !== 'function' || typeof moduleNamespace.manifest !== 'object') {
      return {
        ok: false,
        issue: {
          category: 'entry_load',
          reason: 'module_does_not_export_workflow_plugin_module',
        },
      }
    }

    return {
      ok: true,
      module: moduleNamespace,
    }
  } catch (error) {
    return {
      ok: false,
      issue: {
        category: 'entry_load',
        reason: await inspectModuleImportFailure(entryPath, importUrl, error),
      },
    }
  }
}

function ensurePluginStyle(pluginId: string, styleEntryPath: string | undefined, pluginRoot: string): void {
  if (!styleEntryPath) {
    return
  }

  const styleId = `presto-plugin-style:${pluginId}`
  if (document.getElementById(styleId)) {
    return
  }

  const link = document.createElement('link')
  link.id = styleId
  link.rel = 'stylesheet'
  link.href = toRuntimeAssetUrl(`${pluginRoot}/${styleEntryPath}`.replace(/\/+/g, '/'))
  document.head.append(link)
}

function createAutomationRunnerContext(
  context: ReturnType<typeof createPluginRuntime>,
  runtime: LoadHostPluginsInput['runtime'],
): PluginAutomationRunnerContext {
  return {
    ...context,
    macAccessibility: runtime.macAccessibility ?? unavailableMacAccessibility,
  }
}

export async function loadHostPlugins(input: LoadHostPluginsInput): Promise<LoadedHostPlugins> {
  const automationEntries: HostAutomationEntry[] = []
  const homeEntries: HostPluginHomeEntry[] = []
  const pages: HostRenderedPluginPage[] = []
  const settingsEntries: HostPluginSettingsEntry[] = []
  const issues: HostPluginIssue[] = input.catalog.issues.map(formatPluginIssue)
  const pluginRecords: HostPluginRecord[] = input.catalog.plugins.map((plugin) => ({
    pluginId: plugin.pluginId,
    extensionType: plugin.manifest.extensionType,
    displayName: plugin.displayName,
    version: plugin.version,
    origin: determineOrigin(plugin.pluginId),
    status: plugin.enabled === false ? 'disabled' : plugin.loadable ? 'ready' : 'error',
    enabled: plugin.enabled !== false,
    description: plugin.manifest.description,
    pluginRoot: plugin.pluginRoot,
    loadable: plugin.loadable,
    supportedDaws: plugin.manifest.supportedDaws,
    adapterModuleRequirements: plugin.manifest.adapterModuleRequirements,
    capabilityRequirements: plugin.manifest.capabilityRequirements,
  }))

  const storage = createHostPluginStorage()
  const logger = createHostPluginLogger()
  const host: PluginPageHost = {
    async pickFolder() {
      return input.runtime.dialog.openFolder()
    },
  }

  for (const plugin of input.catalog.plugins) {
    if (plugin.enabled === false) {
      continue
    }

    const mountedPages = mountPluginPages(plugin.manifest)
    const loaded = await loadRendererPluginModule(plugin.entryPath)
    if (!loaded.ok || !loaded.module) {
      const reason = loaded.issue?.reason ?? 'module_import_failed'
      issues.push(
        formatPluginIssue({
          category: 'entry_load',
          reason,
          pluginRoot: plugin.pluginRoot,
        }),
      )
      const targetRecord = pluginRecords.find((record) => record.pluginId === plugin.pluginId)
      if (targetRecord) {
        targetRecord.status = 'error'
      }
      for (const page of mountedPages) {
        pages.push({
          pluginId: page.pluginId,
          pageId: page.pageId,
          title: page.title,
          mount: page.mount,
          render: renderPluginLoadFailurePage(page.title, reason),
        })
        if (page.mount === 'workspace') {
          homeEntries.push(buildWorkflowHomeEntry(plugin, page))
        }
      }
      continue
    }

    const context = createPluginRuntime(plugin.manifest, {
      locale: input.locale,
      presto: input.presto,
      storage,
      logger,
    })
    const activation = await activatePlugin({
      module: loaded.module,
      context,
    })

    if (!activation.ok) {
      issues.push(
        formatPluginIssue({
          category: 'entry_load',
          reason: activation.issue?.reason ?? 'plugin_activation_failed',
          pluginRoot: plugin.pluginRoot,
        }),
      )
      const targetRecord = pluginRecords.find((record) => record.pluginId === plugin.pluginId)
      if (targetRecord) {
        targetRecord.status = 'error'
      }
      continue
    }

    ensurePluginStyle(plugin.pluginId, plugin.manifest.styleEntry, plugin.pluginRoot)
    mountPluginNavigation(plugin.manifest)
    mountPluginCommands(plugin.manifest)
    const automationRunnerContext = createAutomationRunnerContext(context, input.runtime)

    for (const automationItem of (plugin.manifest.automationItems ?? []) as PluginAutomationItemDefinition[]) {
      const runner = loaded.module[automationItem.runnerExport]
      if (typeof runner !== 'function') {
        issues.push(
          formatPluginIssue({
            category: 'entry_load',
            reason: `missing_automation_runner_export:${automationItem.runnerExport}`,
            pluginRoot: plugin.pluginRoot,
          }),
        )
        const targetRecord = pluginRecords.find((record) => record.pluginId === plugin.pluginId)
        if (targetRecord) {
          targetRecord.status = 'error'
        }
        continue
      }

      automationEntries.push({
        pluginId: plugin.pluginId,
        itemId: automationItem.itemId,
        title: automationItem.title,
        description: automationItem.description,
        automationType: automationItem.automationType,
        order: automationItem.order,
        optionsSchema: automationItem.optionsSchema ?? [],
        execute: async (automationInput) =>
          (runner as PluginAutomationRunner)(automationRunnerContext, automationInput),
      })
    }

    for (const page of mountedPages) {
      const pageComponent = loaded.module[page.componentExport]
      if (typeof pageComponent !== 'function') {
        const reason = `missing_page_export:${page.componentExport}`
        issues.push(
          formatPluginIssue({
            category: 'entry_load',
            reason,
            pluginRoot: plugin.pluginRoot,
          }),
        )
        const targetRecord = pluginRecords.find((record) => record.pluginId === plugin.pluginId)
        if (targetRecord) {
          targetRecord.status = 'error'
        }
        pages.push({
          pluginId: page.pluginId,
          pageId: page.pageId,
          title: page.title,
          mount: page.mount,
          render: renderPluginLoadFailurePage(page.title, reason),
        })
        if (page.mount === 'workspace') {
          homeEntries.push(buildWorkflowHomeEntry(plugin, page))
        }
        continue
      }

      const RenderPage = pageComponent as (props: PluginPageProps) => React.ReactElement
      pages.push({
        pluginId: page.pluginId,
        pageId: page.pageId,
        title: page.title,
        mount: page.mount,
        render: () =>
          React.createElement(RenderPage, {
            context,
            host,
            params: {},
            searchParams: new URLSearchParams(),
          }),
      })

      if (page.mount === 'workspace') {
        homeEntries.push(buildWorkflowHomeEntry(plugin, page))
      }
    }

    for (const settingsPage of plugin.settingsPages ?? plugin.manifest.settingsPages ?? []) {
      const loadExport = loaded.module[settingsPage.loadExport]
      const saveExport = loaded.module[settingsPage.saveExport]
      if (typeof loadExport !== 'function') {
        issues.push(
          formatPluginIssue({
            category: 'entry_load',
            reason: `missing_settings_export:${settingsPage.loadExport}`,
            pluginRoot: plugin.pluginRoot,
          }),
        )
        continue
      }

      if (typeof saveExport !== 'function') {
        issues.push(
          formatPluginIssue({
            category: 'entry_load',
            reason: `missing_settings_export:${settingsPage.saveExport}`,
            pluginRoot: plugin.pluginRoot,
          }),
        )
        continue
      }

      const loadSettings = loadExport as SettingsLoadFunction
      const saveSettings = saveExport as SettingsSaveFunction
      settingsEntries.push({
        pluginId: plugin.pluginId,
        extensionType: plugin.manifest.extensionType,
        pageId: settingsPage.pageId,
        title: settingsPage.title,
        order: settingsPage.order,
        storageKey: settingsPage.storageKey,
        defaults: cloneSettingsValue(settingsPage.defaults),
        sections: settingsPage.sections.map((section) => cloneSettingsValue(section)),
        async load() {
          const loadedValue = await loadSettings(context.storage)
          if (!isRecord(loadedValue)) {
            return cloneSettingsValue(settingsPage.defaults)
          }
          return cloneSettingsValue(loadedValue)
        },
        async save(nextValue) {
          const savedValue = await saveSettings(context.storage, cloneSettingsValue(nextValue))
          if (!isRecord(savedValue)) {
            return cloneSettingsValue(nextValue)
          }
          return cloneSettingsValue(savedValue)
        },
      })
    }
  }

  return {
    automationEntries: automationEntries.sort((left, right) => {
      const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
      const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    }),
    homeEntries,
    pages,
    managerModel: {
      managedRoot: input.catalog.managedPluginsRoot,
      plugins: pluginRecords,
      issues,
      settingsEntries: settingsEntries.sort((left, right) => {
        const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
        const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder
        }
        return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
      }),
    },
  }
}
