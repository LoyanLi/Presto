import type {
  DawTarget,
  PluginAutomationItemDefinition,
  PluginAutomationRunner,
  PluginLocaleContext,
  PluginToolDefinition,
  PluginToolRunner,
  PluginToolRunnerContext,
  PrestoErrorPayload,
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
  createPluginToolPageHost,
  createPluginWorkflowPageHost,
  type PluginToolRunHost,
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
    recordToolRunSuccess?(input: {
      jobId: string
      toolKey: string
      label?: string
      at?: string
    }): void
  }
}

function resolveMountedPages(
  mountedPages: MountedPluginPage[],
  manifestPages: ReadonlyArray<{
    pageId: string
    title: string
    mount: 'workspace' | 'tools'
    componentExport: string
  }> = [],
  pluginId = '',
): MountedPluginPage[] {
  if (mountedPages.length > 0) {
    return mountedPages
  }

  return manifestPages.map((page) => ({
    pluginId,
    pageId: page.pageId,
    title: page.title,
    mount: page.mount,
    componentExport: page.componentExport,
  }))
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }
  return 'tool_run_failed'
}

function toToolRunErrorPayload(error: unknown): PrestoErrorPayload {
  return {
    code: 'TOOL_RUN_FAILED',
    message: toErrorMessage(error),
    source: 'runtime',
    retryable: false,
  }
}

function resolveToolTargetDaw(supportedDaws: readonly DawTarget[]): DawTarget {
  if (Array.isArray(supportedDaws) && supportedDaws.length > 0) {
    return supportedDaws[0] as DawTarget
  }
  return 'pro_tools'
}

function createUnavailableBundledProcessHost(pluginId: string): PluginToolRunnerContext['process'] {
  return {
    async execBundled(resourceId) {
      return {
        ok: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: {
          code: 'TOOL_PROCESS_UNAVAILABLE',
          message: `Bundled process runtime is unavailable for plugin "${pluginId}" and resource "${resourceId}".`,
        },
      }
    },
  }
}

function createToolRunHost(input: {
  page: MountedPluginPage
  plugin: PluginRuntimeListResult['plugins'][number]
  moduleNamespace: Record<string, unknown>
  context: ReturnType<typeof createPluginRuntime>
  presto: PrestoClient
  runtime: PluginHostRuntime
}): PluginToolRunHost {
  const { page, plugin, moduleNamespace, context, presto, runtime } = input
  const pageTools = ((plugin.manifest.tools ?? []) as PluginToolDefinition[]).filter(
    (tool) => tool.pageId === page.pageId,
  )
  const toolById = new Map(pageTools.map((tool) => [tool.toolId, tool]))
  const runtimeToolHost = createPluginToolPageHost(runtime)
  const toolProcessHost: PluginToolRunnerContext['process'] = runtime.process
    ? {
        execBundled: (resourceId, args, options) =>
          runtime.process!.execBundled(plugin.pluginId, resourceId, args, options),
      }
    : createUnavailableBundledProcessHost(plugin.pluginId)
  const jobsClient = presto.jobs

  return async ({ toolId, input: toolInput = {} }) => {
    const normalizedToolId = String(toolId ?? '').trim()
    const toolDefinition =
      toolById.get(normalizedToolId) ??
      (normalizedToolId.length === 0 && pageTools.length === 1 ? pageTools[0] : undefined)
    if (!toolDefinition) {
      throw new Error(`Tool "${toolId}" is not defined on page "${page.pageId}".`)
    }

    const runnerExport = moduleNamespace[toolDefinition.runnerExport]
    if (typeof runnerExport !== 'function') {
      throw new Error(`Missing tool runner export "${toolDefinition.runnerExport}".`)
    }

    if (!jobsClient || typeof jobsClient.create !== 'function' || typeof jobsClient.update !== 'function') {
      throw new Error('Host jobs client is unavailable for tool.run.')
    }

    const metadata = {
      pluginId: plugin.pluginId,
      toolId: toolDefinition.toolId,
      toolTitle: toolDefinition.title,
      pageId: page.pageId,
    }
    const created = await jobsClient.create({
      capability: 'tool.run',
      targetDaw: resolveToolTargetDaw(plugin.manifest.supportedDaws ?? []),
      state: 'queued',
      progress: {
        phase: 'queued',
        current: 0,
        total: 1,
        percent: 0,
        message: `${toolDefinition.title} queued.`,
      },
      metadata,
    })
    const jobId = created.job.jobId

    await jobsClient.update({
      jobId,
      state: 'running',
      progress: {
        phase: 'running',
        current: 0,
        total: 1,
        percent: 10,
        message: `${toolDefinition.title} running.`,
      },
      startedAt: new Date().toISOString(),
      metadata,
    })

    try {
      const runnerContext: PluginToolRunnerContext = {
        ...context,
        dialog: runtimeToolHost.dialog,
        fs: runtimeToolHost.fs,
        shell: runtimeToolHost.shell,
        process: toolProcessHost,
      }
      const runResult = await (runnerExport as PluginToolRunner)(runnerContext, toolInput)
      const succeeded = await jobsClient.update({
        jobId,
        state: 'succeeded',
        progress: {
          phase: 'completed',
          current: 1,
          total: 1,
          percent: 100,
          message: runResult?.summary ?? `${toolDefinition.title} completed.`,
        },
        result: {
          ...(runResult ?? {}),
          toolId: toolDefinition.toolId,
          toolTitle: toolDefinition.title,
          metrics: {
            toolId: toolDefinition.toolId,
            toolLabel: toolDefinition.title,
          },
        },
        finishedAt: new Date().toISOString(),
        metadata,
      })

      return {
        jobId,
        job: succeeded.job,
      }
    } catch (error) {
      await jobsClient.update({
        jobId,
        state: 'failed',
        progress: {
          phase: 'failed',
          current: 1,
          total: 1,
          percent: 100,
          message: `${toolDefinition.title} failed.`,
        },
        error: toToolRunErrorPayload(error),
        finishedAt: new Date().toISOString(),
        metadata,
      })
      throw error
    }
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
  const workflowHost = createPluginWorkflowPageHost(input.runtime)
  const fallbackToolHost = createPluginToolPageHost(input.runtime)

  for (const plugin of input.catalog.plugins) {
    if (plugin.enabled === false) {
      continue
    }

    const mountedPages = resolveMountedPages(
      mountPluginPages(plugin.manifest) as MountedPluginPage[],
      (plugin.manifest.pages ?? []) as ReadonlyArray<{
        pageId: string
        title: string
        mount: 'workspace' | 'tools'
        componentExport: string
      }>,
      plugin.pluginId,
    )
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
            recordToolRunSuccess: input.metricsRecorder.recordToolRunSuccess,
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
      const toolHost =
        page.mount === 'tools'
          ? createPluginToolPageHost(
              input.runtime,
              createToolRunHost({
                page,
                plugin,
                moduleNamespace: loaded.module as Record<string, unknown>,
                context,
                presto: input.presto,
                runtime: input.runtime,
              }),
            )
          : fallbackToolHost
      const renderedPage = createMountedPageEntry({
        page,
        moduleNamespace: loaded.module,
        context,
        workflowHost,
        toolHost,
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
