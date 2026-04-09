import React from 'react'
import { createRoot } from 'react-dom/client'

import '../ui/styles.css'
import { createPluginSharedUiApi, ensureMaterialWebRegistered } from '../ui'
import { HostShellApp, createHostShellState } from '../host'
import { useHostPluginCatalogState } from './useHostPluginCatalogState'
import type { PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'

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

  function App() {
    const state = createHostShellState(getInitialShellViewId(searchParams))
    const {
      automationEntries,
      pluginHomeEntries,
      pluginPages,
      pluginManagerModel,
      refreshPlugins,
      installPluginDirectory,
      installPluginZip,
      setPluginEnabled,
      uninstallPlugin,
    } = useHostPluginCatalogState({
      client,
      runtime,
      onReady,
    })

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
        onRefreshPlugins={() => void refreshPlugins()}
        onInstallPluginDirectory={() => void installPluginDirectory()}
        onInstallPluginZip={() => void installPluginZip()}
        onSetPluginEnabled={(pluginId, enabled) => void setPluginEnabled(pluginId, enabled)}
        onUninstallPlugin={(pluginId) => void uninstallPlugin(pluginId)}
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
