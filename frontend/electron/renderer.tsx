import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../ui/styles.css'
import { createPluginSharedUiApi, initThemeMode, ensureMaterialWebRegistered } from '../ui'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostPluginRecord,
  HostRenderedPluginPage,
} from '../../frontend/host'
import { HostShellApp, createHostShellState } from '../../frontend/host'
import {
  getHostShellPreferences,
  subscribeHostShellPreferences,
} from '../../frontend/host/shellPreferences'
import { getSystemLocaleCandidates, resolveHostLocale } from '../../frontend/host/i18n'
import {
  type PluginHostBridge,
  type PluginHostBridgeInstallResult,
  type PluginHostBridgeUninstallResult,
  loadHostPlugins,
} from '../../frontend/host/pluginHostRuntime'
import type { PluginRuntime, PrestoClient } from '../../packages/contracts/src'

const smokeSearchParams = new URLSearchParams(window.location.search)

function getInitialShellViewId(): 'home' | 'settings' | 'developer' {
  const smokeTarget = smokeSearchParams.get('smokeTarget')
  if (
    smokeTarget === 'developer-read' ||
    smokeTarget === 'developer-write' ||
    smokeTarget === 'track-write' ||
    smokeTarget === 'strip-silence' ||
    smokeTarget === 'core-io-write'
  ) {
    return 'developer'
  }
  return 'home'
}

declare global {
  interface Window {
    __PRESTO_BOOTSTRAP__?: {
      takeClient(): PrestoClient
      takeRuntime(): PluginRuntime
      takePluginHostBridge(): PluginHostBridge
    }
    __PRESTO_SMOKE__?: PrestoClient
    __PRESTO_PLUGIN_SHARED__?: {
      React: typeof React
      ui: ReturnType<typeof createPluginSharedUiApi>
    }
  }
}

function takeBootstrapClient(): PrestoClient {
  const bootstrap = window.__PRESTO_BOOTSTRAP__
  if (!bootstrap) {
    throw new Error('missing_presto_bootstrap')
  }

  const client = bootstrap.takeClient()
  try {
    delete window.__PRESTO_BOOTSTRAP__
  } catch (_error) {
    // Ignore delete failures; the helper is one-shot on the preload side.
  }

  return client
}

function requireBootstrap() {
  const bootstrap = window.__PRESTO_BOOTSTRAP__
  if (!bootstrap) {
    throw new Error('missing_presto_bootstrap')
  }
  return bootstrap
}

function takeBootstrapRuntime(): PluginRuntime {
  return requireBootstrap().takeRuntime()
}

function takePluginHostBridge(): PluginHostBridge {
  const bridge = requireBootstrap().takePluginHostBridge()
  try {
    delete window.__PRESTO_BOOTSTRAP__
  } catch (_error) {
    // Ignore delete failures; the helper is one-shot on the preload side.
  }
  return bridge
}

const bootstrapPrestoClient = takeBootstrapClient()
const bootstrapRuntime = takeBootstrapRuntime()
const pluginHostBridge = takePluginHostBridge()
ensureMaterialWebRegistered()
const pluginSharedUi = createPluginSharedUiApi()
pluginSharedUi.theme.init()
if (smokeSearchParams.get('smokeTarget')) {
  window.__PRESTO_SMOKE__ = bootstrapPrestoClient
}
window.__PRESTO_PLUGIN_SHARED__ = {
  React,
  ui: pluginSharedUi,
}

const pluginLocaleState = {
  requested: getHostShellPreferences().language,
  resolved: resolveHostLocale(getHostShellPreferences().language, getSystemLocaleCandidates()),
}

function App() {
  const state = createHostShellState(getInitialShellViewId())
  const [automationEntries, setAutomationEntries] = useState<HostAutomationEntry[]>([])
  const [pluginHomeEntries, setPluginHomeEntries] = useState<HostPluginHomeEntry[]>([])
  const [pluginPages, setPluginPages] = useState<HostRenderedPluginPage[]>([])
  const [pluginManagerModel, setPluginManagerModel] = useState<HostPluginManagerModel>({
    managedRoot: null,
    plugins: [],
    issues: [],
    isBusy: true,
    statusMessage: 'Loading extensions…',
  })

  const refreshPlugins = async (statusMessage = 'Loading extensions…'): Promise<void> => {
    setPluginManagerModel((prev) => ({
      ...prev,
      isBusy: true,
      statusMessage,
    }))

    try {
      const catalog = await pluginHostBridge.listPlugins()
      const loaded = await loadHostPlugins({
        catalog,
        locale: pluginLocaleState,
        presto: bootstrapPrestoClient,
        runtime: bootstrapRuntime,
      })
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
      const message = error instanceof Error ? error.message : 'plugin_list_refresh_failed'
      setPluginHomeEntries([])
      setPluginPages([])
      setPluginManagerModel((prev) => ({
        ...prev,
        isBusy: false,
        statusMessage: null,
        issues: [
          {
            scope: 'discovery',
            message,
            reason: message,
          },
        ],
      }))
    }
  }

  useEffect(() => {
    return subscribeHostShellPreferences((preferences) => {
      pluginLocaleState.requested = preferences.language
      pluginLocaleState.resolved = resolveHostLocale(preferences.language, getSystemLocaleCandidates())
    })
  }, [])

  useEffect(() => {
    void refreshPlugins()
  }, [])

  const runInstall = async (
    statusMessage: string,
    install: () => Promise<PluginHostBridgeInstallResult>,
  ): Promise<void> => {
    setPluginManagerModel((prev) => ({
      ...prev,
      isBusy: true,
      statusMessage,
    }))

    try {
      const result = await install()
      if (result.cancelled) {
        setPluginManagerModel((prev) => ({
          ...prev,
          isBusy: false,
          statusMessage: 'Installation cancelled.',
        }))
        return
      }

      await refreshPlugins(result.ok ? 'Extension installed.' : 'Extension installation failed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'extension_install_failed'
      setPluginManagerModel((prev) => ({
        ...prev,
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
    uninstall: () => Promise<PluginHostBridgeUninstallResult>,
  ): Promise<void> => {
    setPluginManagerModel((prev) => ({
      ...prev,
      isBusy: true,
      statusMessage: `Uninstalling ${pluginId}…`,
    }))

    try {
      const result = await uninstall()
      await refreshPlugins(result.ok ? `Extension removed: ${pluginId}.` : `Extension removal failed: ${pluginId}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'extension_uninstall_failed'
      setPluginManagerModel((prev) => ({
        ...prev,
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

  return (
    <HostShellApp
      state={state}
      developerPresto={bootstrapPrestoClient}
      developerRuntime={bootstrapRuntime}
      smokeTarget={smokeSearchParams.get('smokeTarget')}
      smokeImportFolder={smokeSearchParams.get('smokeImportFolder')}
      pluginHomeEntries={pluginHomeEntries}
      automationEntries={automationEntries}
      pluginPages={pluginPages}
      pluginManagerModel={pluginManagerModel}
      onRefreshPlugins={() => void refreshPlugins('Refreshing extensions…')}
      onInstallPluginDirectory={() => {
        void runInstall('Installing extension from local directory…', () => pluginHostBridge.installFromDirectory())
      }}
      onInstallPluginZip={() => {
        void runInstall('Installing extension from local zip…', () => pluginHostBridge.installFromZip())
      }}
      onUninstallPlugin={(pluginId) => {
        void runUninstall(pluginId, () => pluginHostBridge.uninstall(pluginId))
      }}
    />
  )
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Missing #root container')
}

createRoot(container).render(<App />)
