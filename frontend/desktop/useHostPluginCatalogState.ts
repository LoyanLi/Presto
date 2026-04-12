import { useEffect, useRef, useState } from 'react'

import type { PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type {
  PluginRuntimeInstallResult,
  PluginRuntimeSetEnabledResult,
  PluginRuntimeUninstallResult,
} from '@presto/sdk-runtime/clients/plugins'

import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostRenderedPluginPage,
} from '../host'
import { getSystemLocaleCandidates, resolveHostLocale } from '../host/i18n'
import {
  recordAutomationRunSuccess,
  recordCommandRunSuccess,
  recordWorkflowJobSuccess,
} from '../host/hostRunMetrics'
import { loadHostPlugins } from '../host/pluginHostRuntime'
import { getHostShellPreferences, subscribeHostShellPreferences } from '../host/shellPreferences'

export interface UseHostPluginCatalogStateInput {
  client: PrestoClient
  runtime: PrestoRuntime
  onReady?: () => void
}

export interface UseHostPluginCatalogStateResult {
  automationEntries: HostAutomationEntry[]
  pluginHomeEntries: HostPluginHomeEntry[]
  pluginPages: HostRenderedPluginPage[]
  pluginManagerModel: HostPluginManagerModel
  refreshPlugins(): Promise<void>
  installPluginDirectory(): Promise<void>
  installPluginZip(): Promise<void>
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void>
  uninstallPlugin(pluginId: string): Promise<void>
}

function createBusyPluginManagerModel(statusMessage: string): HostPluginManagerModel {
  return {
    managedRoot: null,
    plugins: [],
    issues: [],
    isBusy: true,
    statusMessage,
  }
}

function createErrorPluginManagerModel(message: string): HostPluginManagerModel {
  return {
    managedRoot: null,
    plugins: [],
    issues: [
      {
        scope: 'discovery',
        message,
        reason: message,
      },
    ],
    isBusy: false,
    statusMessage: null,
  }
}

export function useHostPluginCatalogState({
  client,
  runtime,
  onReady,
}: UseHostPluginCatalogStateInput): UseHostPluginCatalogStateResult {
  const [pluginLocale, setPluginLocale] = useState(() => ({
    requested: getHostShellPreferences().language,
    resolved: resolveHostLocale(getHostShellPreferences().language, getSystemLocaleCandidates()),
  }))
  const [pluginDawTarget, setPluginDawTarget] = useState(() => getHostShellPreferences().dawTarget)
  const [automationEntries, setAutomationEntries] = useState<HostAutomationEntry[]>([])
  const [pluginHomeEntries, setPluginHomeEntries] = useState<HostPluginHomeEntry[]>([])
  const [pluginPages, setPluginPages] = useState<HostRenderedPluginPage[]>([])
  const [pluginManagerModel, setPluginManagerModel] = useState<HostPluginManagerModel>(
    createBusyPluginManagerModel('Loading extensions…'),
  )
  const latestRequestIdRef = useRef(0)

  const refreshPlugins = async (
    statusMessage = 'Loading extensions…',
    requestId = ++latestRequestIdRef.current,
  ): Promise<void> => {
    setPluginManagerModel((previous) => ({
      ...previous,
      isBusy: true,
      statusMessage,
    }))

    try {
      const catalog = await runtime.plugins.list()
      const loaded = await loadHostPlugins({
        catalog,
        locale: {
          locale: pluginLocale.resolved,
          messages: {},
        },
        presto: client,
        runtime,
        metricsRecorder: {
          recordAutomationRunSuccess: ({ automationKey, label }) =>
            recordAutomationRunSuccess({
              automationKey,
              label,
            }),
          recordCommandSuccess: (capabilityId) =>
            recordCommandRunSuccess({
              capabilityId,
            }),
          recordWorkflowJobSuccess: ({ jobId, workflowId, label, commandCounts, at }) =>
            recordWorkflowJobSuccess({
              jobId,
              workflowId,
              label,
              commandCounts,
              at,
            }),
        },
      })
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      setAutomationEntries(loaded.automationEntries)
      setPluginHomeEntries(loaded.homeEntries)
      setPluginPages(loaded.pages)
      setPluginManagerModel({
        ...loaded.managerModel,
        plugins: loaded.managerModel.plugins,
        issues: loaded.managerModel.issues,
        isBusy: false,
        statusMessage: null,
      })
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : 'plugin_list_refresh_failed'
      setAutomationEntries([])
      setPluginHomeEntries([])
      setPluginPages([])
      setPluginManagerModel(createErrorPluginManagerModel(message))
    }
  }

  const runInstall = async (
    statusMessage: string,
    install: () => Promise<PluginRuntimeInstallResult>,
  ): Promise<void> => {
    const requestId = ++latestRequestIdRef.current
    setPluginManagerModel((previous) => ({
      ...previous,
      isBusy: true,
      statusMessage,
    }))

    try {
      const result = await install()
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      if (result.cancelled) {
        setPluginManagerModel((previous) => ({
          ...previous,
          isBusy: false,
          statusMessage: 'Installation cancelled.',
        }))
        return
      }

      await refreshPlugins(result.ok ? 'Extension installed.' : 'Extension installation failed.', requestId)
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : 'extension_install_failed'
      setPluginManagerModel((previous) => ({
        ...previous,
        isBusy: false,
        statusMessage: null,
        issues: [
          {
            scope: 'install',
            message,
            reason: message,
          },
        ],
      }))
    }
  }

  const runUninstall = async (
    pluginId: string,
    uninstall: () => Promise<PluginRuntimeUninstallResult>,
  ): Promise<void> => {
    const requestId = ++latestRequestIdRef.current
    setPluginManagerModel((previous) => ({
      ...previous,
      isBusy: true,
      statusMessage: `Uninstalling ${pluginId}…`,
    }))

    try {
      const result = await uninstall()
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      await refreshPlugins(
        result.ok ? `Extension removed: ${pluginId}.` : `Extension removal failed: ${pluginId}.`,
        requestId,
      )
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : 'extension_uninstall_failed'
      setPluginManagerModel((previous) => ({
        ...previous,
        isBusy: false,
        statusMessage: null,
        issues: [
          {
            scope: 'install',
            message,
            reason: message,
          },
        ],
      }))
    }
  }

  const runSetEnabled = async (
    pluginId: string,
    enabled: boolean,
    setEnabled: () => Promise<PluginRuntimeSetEnabledResult>,
  ): Promise<void> => {
    const requestId = ++latestRequestIdRef.current
    setPluginManagerModel((previous) => ({
      ...previous,
      isBusy: true,
      statusMessage: `${enabled ? 'Enabling' : 'Disabling'} ${pluginId}…`,
    }))

    try {
      const result = await setEnabled()
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      await refreshPlugins(
        result.ok ? `Extension updated: ${pluginId}.` : `Extension update failed: ${pluginId}.`,
        requestId,
      )
    } catch (error) {
      if (requestId !== latestRequestIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : 'extension_set_enabled_failed'
      setPluginManagerModel((previous) => ({
        ...previous,
        isBusy: false,
        statusMessage: null,
        issues: [
          {
            scope: 'install',
            message,
            reason: message,
          },
        ],
      }))
    }
  }

  useEffect(() => {
    onReady?.()
  }, [onReady])

  useEffect(() => {
    return subscribeHostShellPreferences((preferences) => {
      setPluginLocale({
        requested: preferences.language,
        resolved: resolveHostLocale(preferences.language, getSystemLocaleCandidates()),
      })
      setPluginDawTarget(preferences.dawTarget)
    })
  }, [])

  useEffect(() => {
    void refreshPlugins()
  }, [pluginLocale.resolved, pluginDawTarget])

  return {
    automationEntries,
    pluginHomeEntries,
    pluginPages,
    pluginManagerModel,
    refreshPlugins: () => refreshPlugins('Refreshing extensions…'),
    installPluginDirectory: () =>
      runInstall('Installing extension from local directory…', () => runtime.plugins.installFromDirectory()),
    installPluginZip: () =>
      runInstall('Installing extension from local zip…', () => runtime.plugins.installFromZip()),
    setPluginEnabled: (pluginId, enabled) =>
      runSetEnabled(pluginId, enabled, () => runtime.plugins.setEnabled(pluginId, enabled)),
    uninstallPlugin: (pluginId) => runUninstall(pluginId, () => runtime.plugins.uninstall(pluginId)),
  }
}
