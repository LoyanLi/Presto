import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../ui/styles.css'
import { createPluginSharedUiApi, ensureMaterialWebRegistered } from '../ui'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostRenderedPluginPage,
} from '../host'
import { HostShellApp, createHostShellState } from '../host'
import { getHostShellPreferences, subscribeHostShellPreferences } from '../host/shellPreferences'
import { getSystemLocaleCandidates, resolveHostLocale } from '../host/i18n'
import { loadHostPlugins } from '../host/pluginHostRuntime'
import type { PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type {
  PluginRuntimeInstallResult,
  PluginRuntimeSetEnabledResult,
  PluginRuntimeUninstallResult,
} from '@presto/sdk-runtime/clients/plugins'

function getInitialShellViewId(searchParams: URLSearchParams): 'home' | 'settings' | 'developer' {
  const smokeTarget = searchParams.get('smokeTarget')
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

function renderStartupShell(container: HTMLElement): void {
  const isDark = document.documentElement.getAttribute('data-presto-theme') === 'dark'
  const background = isDark ? '#0c0e17' : '#f7f8fc'
  const foreground = isDark ? '#e2e6f3' : '#171a24'
  const detail = isDark ? '#c2c7d9' : '#525b71'
  container.innerHTML = `
    <div
      aria-label="Presto startup shell"
      style="display:grid;place-items:center;min-height:100vh;padding:32px;background:${background};color:${foreground};font-family:'Inter','Segoe UI',sans-serif;"
    >
      <div style="display:grid;gap:10px;justify-items:center;text-align:center;">
        <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.72;">Launching Presto</div>
        <div style="font-size:13px;line-height:1.5;color:${detail};">Preparing desktop runtime…</div>
      </div>
    </div>
  `
}

export function renderHostShellApp({
  client,
  runtime,
  onReady,
  searchParams = new URLSearchParams(window.location.search),
}: {
  client: PrestoClient
  runtime: PrestoRuntime
  onReady?: () => void
  searchParams?: URLSearchParams
}) {
  ensureMaterialWebRegistered()
  const pluginSharedUi = createPluginSharedUiApi()
  pluginSharedUi.theme.init()
  if (searchParams.get('smokeTarget')) {
    window.__PRESTO_SMOKE__ = client
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
    const state = createHostShellState(getInitialShellViewId(searchParams))
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
        const catalog = await runtime.plugins.list()
        const loaded = await loadHostPlugins({
          catalog,
          locale: {
            locale: pluginLocaleState.resolved,
            messages: {},
          },
          presto: client,
          runtime,
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
      onReady?.()
    }, [])

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
      install: () => Promise<PluginRuntimeInstallResult>,
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
      uninstall: () => Promise<PluginRuntimeUninstallResult>,
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

    const runSetEnabled = async (
      pluginId: string,
      enabled: boolean,
      setEnabled: () => Promise<PluginRuntimeSetEnabledResult>,
    ): Promise<void> => {
      setPluginManagerModel((prev) => ({
        ...prev,
        isBusy: true,
        statusMessage: `${enabled ? 'Enabling' : 'Disabling'} ${pluginId}…`,
      }))

      try {
        const result = await setEnabled()
        await refreshPlugins(result.ok ? `Extension updated: ${pluginId}.` : `Extension update failed: ${pluginId}.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'extension_set_enabled_failed'
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
        developerPresto={client}
        developerRuntime={runtime}
        smokeTarget={searchParams.get('smokeTarget')}
        smokeImportFolder={searchParams.get('smokeImportFolder')}
        pluginHomeEntries={pluginHomeEntries}
        automationEntries={automationEntries}
        pluginPages={pluginPages}
        pluginManagerModel={pluginManagerModel}
        onRefreshPlugins={() => void refreshPlugins('Refreshing extensions…')}
        onInstallPluginDirectory={() => {
          void runInstall('Installing extension from local directory…', () => runtime.plugins.installFromDirectory())
        }}
        onInstallPluginZip={() => {
          void runInstall('Installing extension from local zip…', () => runtime.plugins.installFromZip())
        }}
        onSetPluginEnabled={(pluginId, enabled) => {
          void runSetEnabled(pluginId, enabled, () => runtime.plugins.setEnabled(pluginId, enabled))
        }}
        onUninstallPlugin={(pluginId) => {
          void runUninstall(pluginId, () => runtime.plugins.uninstall(pluginId))
        }}
      />
    )
  }

  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Missing #root container')
  }

  renderStartupShell(container)
  createRoot(container).render(<App />)
}

declare global {
  interface Window {
    __PRESTO_SMOKE__?: PrestoClient
    __PRESTO_PLUGIN_SHARED__?: {
      React: typeof React
      ui: ReturnType<typeof createPluginSharedUiApi>
    }
  }
}
