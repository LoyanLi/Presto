import type {
  DawTarget,
  PluginAutomationItemDefinition,
  PluginAutomationRunner,
  PluginLocaleContext,
  PluginToolDefinition,
  PluginToolRuntimePermission,
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

function normalizePluginLocaleContext(locale: LoadHostPluginsInput['locale'] | Record<string, unknown> | null | undefined): PluginLocaleContext {
  const resolved =
    locale && typeof locale === 'object' && locale.resolved === 'zh-CN'
      ? 'zh-CN'
      : locale && typeof locale === 'object' && locale.locale === 'zh-CN'
        ? 'zh-CN'
        : 'en'
  const requested =
    locale && typeof locale === 'object' && (locale.requested === 'zh-CN' || locale.requested === 'en')
      ? locale.requested
      : resolved

  return {
    requested,
    resolved,
  }
}

function resolvePluginManifest(input: {
  locale: LoadHostPluginsInput['locale']
  moduleNamespace?: Record<string, unknown>
  manifest: PluginRuntimeListResult['plugins'][number]['manifest']
}): PluginRuntimeListResult['plugins'][number]['manifest'] {
  const { locale, moduleNamespace, manifest } = input
  const resolveManifest = moduleNamespace?.resolveManifest
  if (typeof resolveManifest !== 'function') {
    return manifest
  }

  const resolvedManifest = resolveManifest(normalizePluginLocaleContext(locale))
  if (!resolvedManifest || typeof resolvedManifest !== 'object') {
    return manifest
  }

  return resolvedManifest as PluginRuntimeListResult['plugins'][number]['manifest']
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

function isErrorRecord(error: unknown): error is Record<string, unknown> {
  return typeof error === 'object' && error !== null
}

function toToolRunErrorPayload(error: unknown): PrestoErrorPayload {
  const preservedCode =
    isErrorRecord(error) && typeof error.code === 'string' && error.code.trim().length > 0
      ? error.code.trim()
      : null
  const preservedSource =
    isErrorRecord(error) && typeof error.source === 'string' && error.source.trim().length > 0
      ? error.source.trim()
      : 'runtime'
  const preservedRetryable =
    isErrorRecord(error) && typeof error.retryable === 'boolean' ? error.retryable : false
  const preservedDetails =
    isErrorRecord(error) &&
    typeof error.details === 'object' &&
    error.details !== null &&
    !Array.isArray(error.details)
      ? (error.details as Record<string, unknown>)
      : undefined

  return {
    code: preservedCode ?? 'TOOL_RUN_FAILED',
    message: toErrorMessage(error),
    source: preservedSource,
    retryable: preservedRetryable,
    ...(preservedDetails ? { details: preservedDetails } : {}),
  }
}

function resolveToolTargetDaw(supportedDaws: readonly DawTarget[]): DawTarget {
  if (Array.isArray(supportedDaws) && supportedDaws.length > 0) {
    return supportedDaws[0] as DawTarget
  }
  return 'pro_tools'
}

function resolveToolRuntimePermissions(
  manifest: PluginRuntimeListResult['plugins'][number]['manifest'],
): ReadonlySet<PluginToolRuntimePermission> {
  return new Set((manifest.toolRuntimePermissions ?? []) as PluginToolRuntimePermission[])
}

function createUnavailableBundledProcessHost(pluginId: string): PluginToolRunnerContext['process'] {
  return {
    async execBundled(resourceId) {
      throw Object.assign(
        new Error(
          `Plugin "${pluginId}" cannot access process.execBundled because the required host runtime is unavailable for resource "${resourceId}".`,
        ),
        { code: 'PLUGIN_TOOL_HOST_UNAVAILABLE' as const },
      )
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
  const toolRuntimePermissions = resolveToolRuntimePermissions(plugin.manifest)
  const runtimeToolHost = createPluginToolPageHost(runtime, plugin.pluginId, toolRuntimePermissions)
  const toolProcessHost: PluginToolRunnerContext['process'] = runtime.process
    ? toolRuntimePermissions.has('process.execBundled')
      ? {
          execBundled: (resourceId, args, options) =>
            runtime.process!.execBundled(plugin.pluginId, resourceId, args, options),
        }
      : {
          async execBundled() {
            throw Object.assign(
              new Error(`Plugin "${plugin.pluginId}" is not allowed to access process.execBundled.`),
              { code: 'PLUGIN_TOOL_PERMISSION_DENIED' as const },
            )
          },
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
  const pluginRecords: HostPluginManagerModel['plugins'] = []
  const storage = createHostPluginStorage()
  const logger = createHostPluginLogger(input.runtime, { source: 'plugin.host' })
  const workflowHost = createPluginWorkflowPageHost(input.runtime)
  const fallbackToolHost = createPluginToolPageHost(input.runtime, 'unknown-plugin', new Set())

  for (const plugin of input.catalog.plugins) {
    const loaded = plugin.loadable ? await loadRendererPluginModule(plugin.entryPath) : { ok: false }
    const resolvedManifest = resolvePluginManifest({
      locale: input.locale,
      moduleNamespace: loaded.ok ? (loaded.module as Record<string, unknown>) : undefined,
      manifest: plugin.manifest,
    })
    const resolvedPlugin = {
      ...plugin,
      displayName: resolvedManifest.displayName,
      manifest: resolvedManifest,
      settingsPages: resolvedManifest.settingsPages ?? plugin.settingsPages,
    }
    pluginRecords.push(...createPluginRecords([resolvedPlugin]))

    if (plugin.enabled === false) {
      continue
    }

    const mountedPages = resolveMountedPages(
      mountPluginPages(resolvedManifest) as MountedPluginPage[],
      (resolvedManifest.pages ?? []) as ReadonlyArray<{
        pageId: string
        title: string
        mount: 'workspace' | 'tools'
        componentExport: string
      }>,
      plugin.pluginId,
    )
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
          homeEntries.push(buildWorkflowHomeEntry(resolvedPlugin, page))
        }
      }
      continue
    }

    const context = createPluginRuntime(resolvedManifest, {
      locale: normalizePluginLocaleContext(input.locale),
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

    ensurePluginStyle(plugin.pluginId, resolvedManifest.styleEntry, plugin.pluginRoot)
    const automationRunnerContext = createAutomationRunnerContext(context, input.runtime)
    const toolRuntimePermissions = resolveToolRuntimePermissions(resolvedManifest)

    for (const automationItem of (resolvedManifest.automationItems ?? []) as PluginAutomationItemDefinition[]) {
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
              plugin.pluginId,
              toolRuntimePermissions,
              createToolRunHost({
                page,
                plugin: resolvedPlugin,
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
        homeEntries.push(buildWorkflowHomeEntry(resolvedPlugin, page))
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

    for (const settingsPage of resolvedPlugin.settingsPages ?? []) {
      const settingsResult = createSettingsEntry({
        pluginId: plugin.pluginId,
        extensionType: resolvedManifest.extensionType,
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
