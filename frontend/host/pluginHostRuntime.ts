import type {
  PluginAutomationItemDefinition,
  PluginAutomationRunner,
  PluginLocaleContext,
  PrestoClient,
} from '@presto/contracts'
import type { PluginRuntimeListResult } from '@presto/sdk-runtime/clients/plugins'
import {
  activatePlugin,
  createPluginRuntime,
  mountPluginPages,
} from '@presto/host-plugin-runtime/browser'
import {
  buildWorkflowHomeEntry,
  createMountedPageEntry,
  createPluginRecords,
  createSettingsEntry,
  formatPluginIssue,
  setPluginRecordStatus,
  sortAutomationEntries,
  sortSettingsEntries,
  type MountedPluginPage,
} from './pluginHostAssembly'
import { ensurePluginStyle, loadRendererPluginModule, renderPluginLoadFailurePage } from './pluginHostModuleLoader'
import { toRuntimeModuleUrl } from './pluginHostAssetUrls'
import {
  createAutomationRunnerContext,
  createHostPluginLogger,
  createHostPluginStorage,
  createPluginPageHost,
  type PluginHostRuntime,
} from './pluginHostServices'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginIssue,
  HostPluginManagerModel,
  HostPluginSettingsEntry,
  HostRenderedPluginPage,
} from './pluginHostTypes'

export { toRuntimeModuleUrl }

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
  runtime: PluginHostRuntime
  metricsRecorder?: {
    recordAutomationRunSuccess?(input: {
      automationKey: string
      label?: string
    }): void
    recordCommandSuccess?(capabilityId: string): void
    recordWorkflowJobSuccess?(input: {
      jobId: string
      workflowId: string
      pluginId: string
      label?: string
      commandCounts: Record<string, number>
      at?: string
    }): void
  }
}

export async function loadHostPlugins(input: LoadHostPluginsInput): Promise<LoadedHostPlugins> {
  const automationEntries: HostAutomationEntry[] = []
  const homeEntries: HostPluginHomeEntry[] = []
  const pages: HostRenderedPluginPage[] = []
  const settingsEntries: HostPluginSettingsEntry[] = []
  const issues: HostPluginIssue[] = input.catalog.issues.map(formatPluginIssue)
  const pluginRecords = createPluginRecords(input.catalog.plugins)
  const storage = createHostPluginStorage()
  const logger = createHostPluginLogger()
  const host = createPluginPageHost(input.runtime)

  for (const plugin of input.catalog.plugins) {
    if (plugin.enabled === false) {
      continue
    }

    const mountedPages = mountPluginPages(plugin.manifest) as MountedPluginPage[]
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
      setPluginRecordStatus(pluginRecords, plugin.pluginId, 'error')
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
        metricsRecorder: input.metricsRecorder
        ? {
            recordCommandSuccess: input.metricsRecorder.recordCommandSuccess,
            recordWorkflowJobSuccess: input.metricsRecorder.recordWorkflowJobSuccess,
          }
        : undefined,
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
      setPluginRecordStatus(pluginRecords, plugin.pluginId, 'error')
      continue
    }

    ensurePluginStyle(plugin.pluginId, plugin.manifest.styleEntry, plugin.pluginRoot)
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
        setPluginRecordStatus(pluginRecords, plugin.pluginId, 'error')
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
        execute: async (automationInput) => {
          const result = await (runner as PluginAutomationRunner)(automationRunnerContext, automationInput)
          input.metricsRecorder?.recordAutomationRunSuccess?.({
            automationKey: `${plugin.pluginId}:${automationItem.itemId}`,
            label: automationItem.title,
          })
          return result
        },
      })
    }

    for (const page of mountedPages) {
      const renderedPage = createMountedPageEntry({
        page,
        moduleNamespace: loaded.module,
        context,
        host,
        renderFailurePage: renderPluginLoadFailurePage,
      })
      pages.push(renderedPage.entry)
      if (page.mount === 'workspace') {
        homeEntries.push(buildWorkflowHomeEntry(plugin, page))
      }
      if (renderedPage.issueReason) {
        issues.push(
          formatPluginIssue({
            category: 'entry_load',
            reason: renderedPage.issueReason,
            pluginRoot: plugin.pluginRoot,
          }),
        )
        setPluginRecordStatus(pluginRecords, plugin.pluginId, 'error')
      }
    }

    for (const settingsPage of plugin.settingsPages ?? plugin.manifest.settingsPages ?? []) {
      const settingsResult = createSettingsEntry({
        pluginId: plugin.pluginId,
        extensionType: plugin.manifest.extensionType,
        settingsPage,
        moduleNamespace: loaded.module,
        storage: context.storage,
      })
      if (settingsResult.issueReason) {
        issues.push(
          formatPluginIssue({
            category: 'entry_load',
            reason: settingsResult.issueReason,
            pluginRoot: plugin.pluginRoot,
          }),
        )
        continue
      }
      if (settingsResult.entry) {
        settingsEntries.push(settingsResult.entry)
      }
    }
  }

  return {
    automationEntries: sortAutomationEntries(automationEntries),
    homeEntries,
    pages,
    managerModel: {
      managedRoot: input.catalog.managedPluginsRoot,
      plugins: pluginRecords,
      issues,
      settingsEntries: sortSettingsEntries(settingsEntries),
    },
  }
}
