import React from 'react'

import type {
  PluginPageProps,
  PluginStorage,
  PluginToolPageHost,
  PluginWorkflowPageHost,
  WorkflowSettingsPageDefinition,
} from '@presto/contracts'
import type { PluginRuntimeIssue, PluginRuntimeListResult } from '@presto/sdk-runtime/clients/plugins'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginIssue,
  HostPluginOrigin,
  HostPluginRecord,
  HostPluginSettingsEntry,
  HostRenderedPluginPage,
} from './pluginHostTypes'
import type { PluginModuleNamespace } from './pluginHostModuleLoader'

export interface MountedPluginPage {
  pluginId: string
  pageId: string
  title: string
  mount: 'workspace' | 'tools'
  componentExport: string
}

type SettingsLoadFunction = (storage: PluginStorage) => Promise<Record<string, unknown>> | Record<string, unknown>
type SettingsSaveFunction = (
  storage: PluginStorage,
  settings: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>

function cloneSettingsValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function determineOrigin(pluginId: string): HostPluginOrigin {
  return pluginId.startsWith('official.') ? 'official' : 'installed'
}

export function createPluginRecords(plugins: PluginRuntimeListResult['plugins']): HostPluginRecord[] {
  return plugins.map((plugin) => ({
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
}

export function setPluginRecordStatus(
  pluginRecords: HostPluginRecord[],
  pluginId: string,
  status: HostPluginRecord['status'],
): void {
  const targetRecord = pluginRecords.find((record) => record.pluginId === pluginId)
  if (targetRecord) {
    targetRecord.status = status
  }
}

export function buildWorkflowHomeEntry(
  plugin: PluginRuntimeListResult['plugins'][number],
  page: {
    pluginId: string
    pageId: string
    title: string
  },
): HostPluginHomeEntry {
  return {
    pluginId: page.pluginId,
    pageId: page.pageId,
    title: page.title,
    description: plugin.manifest.description ?? `${plugin.displayName} plugin page.`,
    actionLabel: 'Open Plugin',
  }
}

export function formatPluginIssue(issue: PluginRuntimeIssue): HostPluginIssue {
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

export function createMountedPageEntry(input: {
  page: MountedPluginPage
  moduleNamespace: PluginModuleNamespace
  context: PluginPageProps['context']
  workflowHost: PluginWorkflowPageHost
  toolHost: PluginToolPageHost
  renderFailurePage(title: string, reason: string): () => React.ReactElement
}): { entry: HostRenderedPluginPage; issueReason?: string } {
  const { page, moduleNamespace, context, workflowHost, toolHost, renderFailurePage } = input
  const pageComponent = moduleNamespace[page.componentExport]
  if (typeof pageComponent !== 'function') {
    const reason = `missing_page_export:${page.componentExport}`
    return {
      issueReason: reason,
      entry: {
        pluginId: page.pluginId,
        pageId: page.pageId,
        title: page.title,
        mount: page.mount,
        render: renderFailurePage(page.title, reason),
      },
    }
  }

  const RenderPage = pageComponent as (props: PluginPageProps) => React.ReactElement
  const host = page.mount === 'tools' ? toolHost : workflowHost
  return {
    entry: {
      pluginId: page.pluginId,
      pageId: page.pageId,
      title: page.title,
      mount: page.mount,
      render: () =>
        React.createElement(RenderPage, {
          context,
          host: host as unknown as PluginPageProps['host'],
          params: {},
          searchParams: new URLSearchParams(),
        }),
    },
  }
}

export function createSettingsEntry(input: {
  pluginId: string
  extensionType: HostPluginSettingsEntry['extensionType']
  settingsPage: WorkflowSettingsPageDefinition
  moduleNamespace: PluginModuleNamespace
  storage: PluginStorage
}): { entry?: HostPluginSettingsEntry; issueReason?: string } {
  const { pluginId, extensionType, settingsPage, moduleNamespace, storage } = input
  const loadExport = moduleNamespace[settingsPage.loadExport]
  const saveExport = moduleNamespace[settingsPage.saveExport]
  if (typeof loadExport !== 'function') {
    return { issueReason: `missing_settings_export:${settingsPage.loadExport}` }
  }

  if (typeof saveExport !== 'function') {
    return { issueReason: `missing_settings_export:${settingsPage.saveExport}` }
  }

  const loadSettings = loadExport as SettingsLoadFunction
  const saveSettings = saveExport as SettingsSaveFunction
  return {
    entry: {
      pluginId,
      extensionType,
      pageId: settingsPage.pageId,
      title: settingsPage.title,
      order: settingsPage.order,
      storageKey: settingsPage.storageKey,
      defaults: cloneSettingsValue(settingsPage.defaults),
      sections: settingsPage.sections.map((section) => cloneSettingsValue(section)),
      async load() {
        const loadedValue = await loadSettings(storage)
        if (!isRecord(loadedValue)) {
          return cloneSettingsValue(settingsPage.defaults)
        }
        return cloneSettingsValue(loadedValue)
      },
      async save(nextValue) {
        const savedValue = await saveSettings(storage, cloneSettingsValue(nextValue))
        if (!isRecord(savedValue)) {
          return cloneSettingsValue(nextValue)
        }
        return cloneSettingsValue(savedValue)
      },
    },
  }
}

export function sortAutomationEntries(entries: HostAutomationEntry[]): HostAutomationEntry[] {
  return entries.sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
}

export function sortSettingsEntries(entries: HostPluginSettingsEntry[]): HostPluginSettingsEntry[] {
  return entries.sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
}
