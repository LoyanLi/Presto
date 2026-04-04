import { useEffect, useMemo, useState } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import type { DawTarget, PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'
import { getThemeMode, getThemePreference, setThemePreference, subscribeThemeMode, subscribeThemePreference } from '../ui'
import { md3ColorSchemes, md3Shape, md3Typography } from '../ui/tokens'
import { useDawStatusPolling } from './hooks/useDawStatusPolling'
import { HostDeveloperSurface } from './HostDeveloperSurface'
import { HostHomeSurface } from './HostHomeSurface'
import { getSystemLocaleCandidates, resolveHostLocale, translateHost } from './i18n'
import type { HostPrimarySidebarRoute } from './HostPrimarySidebar'
import { HostSettingsSurface, type BuiltinSettingsEntry } from './HostSettingsSurface'
import type { HostShellState, HostShellViewId } from './hostShellState'
import {
  buildFilteredPluginManagerModel,
  createHostMuiTheme,
  dawLabel,
  defaultSettingsRoute,
  findActiveWorkspacePage,
  isPluginAvailableForSnapshot,
  normalizeSettingsPageRoute,
  sortPluginSettingsEntries,
  type LegacySettingsRouteInput,
} from './hostShellHelpers'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostRenderedPluginPage,
  HostSettingsPageRoute,
  HostPluginSettingsEntry,
  HostWorkspacePageRoute,
} from './pluginHostTypes'
import { getHostShellPreferences, setHostShellPreferences, subscribeHostShellPreferences } from './shellPreferences'
import { applyHostShellPreferencesToConfig, getHostShellPreferencesFromConfig } from './runtimePreferences'
import { GeneralSettingsPage, type GeneralSettingsPageProps } from './settings/GeneralSettingsPage'
import { ExtensionsSettingsPage } from './settings/ExtensionsSettingsPage'

export interface HostShellAppProps {
  state: HostShellState
  developerPresto: PrestoClient
  developerRuntime: PrestoRuntime
  smokeTarget?: string | null
  smokeImportFolder?: string | null
  pluginHomeEntries?: readonly HostPluginHomeEntry[]
  automationEntries?: readonly HostAutomationEntry[]
  pluginPages?: readonly HostRenderedPluginPage[]
  pluginManagerModel?: HostPluginManagerModel
  dawAdapterSnapshot?: DawAdapterSnapshot | null
  initialWorkspacePageRoute?: HostWorkspacePageRoute | null
  initialSettingsPageRoute?: HostSettingsPageRoute | LegacySettingsRouteInput | null
  onInstallPluginDirectory?(): void | Promise<void>
  onInstallPluginZip?(): void | Promise<void>
  onSetPluginEnabled?(pluginId: string, enabled: boolean): void | Promise<void>
  onUninstallPlugin?(pluginId: string): void | Promise<void>
  onRefreshPlugins?(): void | Promise<void>
}


export function HostShellApp({
  state,
  developerPresto,
  developerRuntime,
  smokeTarget,
  smokeImportFolder,
  pluginHomeEntries = [],
  automationEntries = [],
  pluginPages = [],
  pluginManagerModel,
  dawAdapterSnapshot = null,
  initialWorkspacePageRoute = null,
  initialSettingsPageRoute = null,
  onInstallPluginDirectory,
  onInstallPluginZip,
  onSetPluginEnabled,
  onUninstallPlugin,
  onRefreshPlugins,
}: HostShellAppProps) {
  const initialPreferences = getHostShellPreferences()
  const [surface, setSurface] = useState<HostShellViewId>(() => state.shellViewId)
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>(() => getThemeMode())
  const [themePreference, setThemePreferenceState] = useState(() => getThemePreference())
  const [preferences, setPreferencesState] = useState(() => initialPreferences)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const resolvedLocale = resolveHostLocale(preferences.language, getSystemLocaleCandidates())

  const {
    dawStatus,
    liveDawAdapterSnapshot,
    checkingDawConnection,
    dawRefreshKey,
    refresh: refreshDawStatus,
    setChecking: setCheckingDawConnection,
  } = useDawStatusPolling({
    developerPresto,
    developerRuntime,
    preferences,
    resolvedLocale,
    initialSnapshot: dawAdapterSnapshot,
  })
  const [workspacePageRoute, setWorkspacePageRoute] = useState<HostWorkspacePageRoute | null>(() => initialWorkspacePageRoute)
  const [settingsRoute, setSettingsRoute] = useState<HostSettingsPageRoute>(() =>
    normalizeSettingsPageRoute(initialSettingsPageRoute),
  )

  useEffect(() => {
    setSurface(state.shellViewId)
  }, [state.shellViewId])

  useEffect(() => subscribeThemeMode((mode) => setThemeModeState(mode)), [])
  useEffect(() => subscribeThemePreference((preferenceMode) => setThemePreferenceState(preferenceMode)), [])
  useEffect(() => subscribeHostShellPreferences((nextPreferences) => setPreferencesState(nextPreferences)), [])
  useEffect(() => {
    if (!developerPresto?.config?.get) {
      return
    }

    let active = true
    void developerPresto.config.get()
      .then((response) => {
        if (!active || !response?.config) {
          return
        }
        setHostShellPreferences(getHostShellPreferencesFromConfig(response.config))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [developerPresto])

  const muiTheme = useMemo(() => createHostMuiTheme(themeMode), [themeMode])

  useEffect(() => {
    setWorkspacePageRoute(initialWorkspacePageRoute)
  }, [initialWorkspacePageRoute])

  useEffect(() => {
    setSettingsRoute(normalizeSettingsPageRoute(initialSettingsPageRoute))
  }, [initialSettingsPageRoute])

  useEffect(() => {
    if (surface !== 'developer' || preferences.developerMode || smokeTarget) {
      return
    }

    setSurface('settings')
    setSettingsRoute(defaultSettingsRoute)
  }, [preferences.developerMode, smokeTarget, surface])

  const pluginAvailabilityById = useMemo(() => {
    const availability = new Map<string, boolean>()
    for (const plugin of pluginManagerModel?.plugins ?? []) {
      availability.set(plugin.pluginId, isPluginAvailableForSnapshot(plugin, liveDawAdapterSnapshot))
    }
    return availability
  }, [liveDawAdapterSnapshot, pluginManagerModel?.plugins])

  const isPluginAvailable = (pluginId: string): boolean => pluginAvailabilityById.get(pluginId) ?? true
  const isPluginEnabled = (pluginId: string): boolean =>
    (pluginManagerModel?.plugins.find((plugin) => plugin.pluginId === pluginId)?.enabled ?? true) !== false

  const filteredPluginHomeEntries = useMemo(
    () => pluginHomeEntries.filter((entry) => isPluginAvailable(entry.pluginId) && isPluginEnabled(entry.pluginId)),
    [pluginHomeEntries, pluginAvailabilityById, pluginManagerModel?.plugins],
  )

  const filteredAutomationEntries = useMemo(
    () => automationEntries.filter((entry) => isPluginAvailable(entry.pluginId) && isPluginEnabled(entry.pluginId)),
    [automationEntries, pluginAvailabilityById, pluginManagerModel?.plugins],
  )

  const filteredPluginPages = useMemo(
    () => pluginPages.filter((page) => isPluginAvailable(page.pluginId) && isPluginEnabled(page.pluginId)),
    [pluginPages, pluginAvailabilityById, pluginManagerModel?.plugins],
  )

  const allPluginSettingsEntries = useMemo(
    () => sortPluginSettingsEntries(pluginManagerModel?.settingsEntries ?? []),
    [pluginManagerModel?.settingsEntries],
  )

  const filteredPluginSettingsEntries = useMemo(
    () => allPluginSettingsEntries.filter((entry) => isPluginAvailable(entry.pluginId) && isPluginEnabled(entry.pluginId)),
    [allPluginSettingsEntries, pluginAvailabilityById, pluginManagerModel?.plugins],
  )

  const filteredPluginManagerModel: HostPluginManagerModel | undefined = useMemo(() => {
    return buildFilteredPluginManagerModel({
      pluginManagerModel,
          filteredPluginHomeEntries,
          filteredAutomationEntries,
          filteredPluginSettingsEntries,
          pluginPages: filteredPluginPages,
          isPluginAvailable,
        })
      }, [
        filteredAutomationEntries,
        filteredPluginHomeEntries,
        filteredPluginPages,
        filteredPluginSettingsEntries,
        pluginAvailabilityById,
        pluginManagerModel,
      ])

  const pluginSettingsEntries = filteredPluginSettingsEntries

  const activeWorkspacePage = findActiveWorkspacePage(workspacePageRoute, filteredPluginPages)

  const activeSettingsEntry =
    settingsRoute.kind === 'plugin'
      ? pluginSettingsEntries.find(
          (entry) => entry.pluginId === settingsRoute.pluginId && entry.pageId === settingsRoute.pageId,
        ) ?? null
      : null

  const workspaceSettingsEntry: HostPluginSettingsEntry | null = workspacePageRoute
    ? pluginSettingsEntries.find((entry) => entry.pluginId === workspacePageRoute.pluginId) ?? null
    : null

  const settingsReturnsToWorkspace =
    settingsRoute.kind === 'plugin' &&
    workspacePageRoute !== null &&
    settingsRoute.pluginId === workspacePageRoute.pluginId

  const builtinSettingsNav: readonly BuiltinSettingsEntry[] = [
    {
      pageId: 'general',
      title: translateHost(resolvedLocale, 'settings.general.title'),
      description: translateHost(resolvedLocale, 'settings.general.body'),
    },
    {
      pageId: 'workflowExtensions',
      title: translateHost(resolvedLocale, 'settings.extensions.workflows.title'),
      description: translateHost(resolvedLocale, 'settings.extensions.workflows.body'),
    },
    {
      pageId: 'automationExtensions',
      title: translateHost(resolvedLocale, 'settings.extensions.automation.title'),
      description: translateHost(resolvedLocale, 'settings.extensions.automation.body'),
    },
  ]

  const settingsTitle =
    settingsRoute.kind === 'plugin'
      ? pluginSettingsEntries.find(
          (entry) => entry.pluginId === settingsRoute.pluginId && entry.pageId === settingsRoute.pageId,
        )?.title ?? translateHost(resolvedLocale, 'home.pluginSettings')
      : builtinSettingsNav.find((entry) => entry.pageId === settingsRoute.pageId)?.title ?? translateHost(resolvedLocale, 'sidebar.settings')

  const canAccessDeveloper = preferences.developerMode || Boolean(smokeTarget)

  const openSettings = (route: HostSettingsPageRoute = defaultSettingsRoute): void => {
    setSettingsRoute(route)
    setSurface('settings')
  }

  const persistHostShellPreferences = async (nextPreferences: Partial<typeof preferences>): Promise<void> => {
    if (!developerPresto?.config?.get || !developerPresto?.config?.update) {
      setHostShellPreferences(nextPreferences)
      return
    }

    const currentConfig = await developerPresto.config.get()
    const resolvedPreferences = {
      ...preferences,
      ...nextPreferences,
    }

    await developerPresto.config.update({
      config: applyHostShellPreferencesToConfig(currentConfig.config, resolvedPreferences),
    })
    setHostShellPreferences(resolvedPreferences)
  }

  const openPrimarySurface = (nextSurface: HostPrimarySidebarRoute): void => {
    if (nextSurface === 'settings') {
      openSettings()
      return
    }

    setWorkspacePageRoute(null)
    setSurface(nextSurface)
  }

  const returnHome = (): void => {
    setWorkspacePageRoute(null)
    setSurface('home')
  }

  const generalPage = (
    <GeneralSettingsPage
      locale={resolvedLocale}
      preferences={preferences}
      themePreference={themePreference}
      dawStatus={dawStatus}
      checkingConnection={checkingDawConnection}
      runtime={developerRuntime as GeneralSettingsPageProps['runtime']}
      onDeveloperModeChange={(selected) => {
        void persistHostShellPreferences({
          developerMode: selected,
        })
      }}
      onThemePreferenceChange={(preferenceMode) => {
        setThemePreference(preferenceMode)
      }}
      onLanguageChange={(language) => {
        void persistHostShellPreferences({
          language,
        })
        refreshDawStatus()
      }}
      onDawTargetChange={async (target) => {
        if (developerRuntime?.backend && typeof developerRuntime.backend.setDawTarget === 'function') {
          setCheckingDawConnection(true)
          try {
            await developerRuntime.backend.setDawTarget(target)
            await persistHostShellPreferences({
              dawTarget: target,
            })
            setDawStatus((current) => ({
              ...current,
              targetLabel: dawLabel(target),
            }))
          } finally {
            setCheckingDawConnection(false)
          }
        } else {
          await persistHostShellPreferences({
            dawTarget: target,
          })
          setDawStatus((current) => ({
            ...current,
            targetLabel: dawLabel(target),
          }))
        }
        refreshDawStatus()
      }}
      onCheckConnection={() => {
        setCheckingDawConnection(true)
        setDawStatus((current) => ({
          ...current,
          lastError: '',
        }))
        refreshDawStatus()
      }}
    />
  )

  const sidebarConnectionStatus = {
    connected: dawStatus.connected,
    targetLabel: dawStatus.targetLabel,
    sessionName: dawStatus.sessionName,
    statusLabel: dawStatus.statusLabel,
  }

  const workflowExtensionsPage = (
    <ExtensionsSettingsPage
      locale={resolvedLocale}
      extensionType="workflow"
      pluginManagerModel={filteredPluginManagerModel}
      pluginSettingsEntries={pluginSettingsEntries}
      onInstallPluginDirectory={onInstallPluginDirectory}
      onInstallPluginZip={onInstallPluginZip}
      onSetPluginEnabled={onSetPluginEnabled}
      onUninstallPlugin={onUninstallPlugin}
      onRefreshPlugins={onRefreshPlugins}
    />
  )

  const automationExtensionsPage = (
    <ExtensionsSettingsPage
      locale={resolvedLocale}
      extensionType="automation"
      pluginManagerModel={filteredPluginManagerModel}
      pluginSettingsEntries={pluginSettingsEntries}
      onInstallPluginDirectory={onInstallPluginDirectory}
      onInstallPluginZip={onInstallPluginZip}
      onSetPluginEnabled={onSetPluginEnabled}
      onUninstallPlugin={onUninstallPlugin}
      onRefreshPlugins={onRefreshPlugins}
    />
  )

  const shouldRenderSettingsSurface = surface === 'settings' || (surface === 'developer' && !canAccessDeveloper)

  const settingsSurface = (
    <HostSettingsSurface
      settingsRoute={settingsRoute}
      settingsTitle={settingsTitle}
      sidebarCollapsed={sidebarCollapsed}
      connectionStatus={sidebarConnectionStatus}
      locale={resolvedLocale}
      builtinSettingsNav={builtinSettingsNav}
      pluginSettingsEntries={pluginSettingsEntries}
      activeSettingsEntry={activeSettingsEntry}
      surface={surface}
      developerMode={preferences.developerMode}
      settingsReturnsToWorkspace={settingsReturnsToWorkspace}
      onSelectBuiltin={(pageId) => {
        setSettingsRoute({ kind: 'builtin', pageId })
        setSurface('settings')
      }}
      onSelectPlugin={(pluginId, pageId) => {
        setSettingsRoute({ kind: 'plugin', pluginId, pageId })
        setSurface('settings')
      }}
      onOpenDeveloper={() => setSurface('developer')}
      onNavigate={openPrimarySurface}
      onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
      onBackToWorkspace={() => setSurface('home')}
      generalPage={generalPage}
      workflowExtensionsPage={workflowExtensionsPage}
      automationExtensionsPage={automationExtensionsPage}
    />
  )

  const surfaceContent =
    surface === 'developer'
      ? canAccessDeveloper
        ? (
            <HostDeveloperSurface
              developerPresto={developerPresto}
              smokeTarget={smokeTarget}
              smokeImportFolder={smokeImportFolder}
              onOpenSettings={() => openSettings()}
              onGoHome={returnHome}
            />
          )
        : settingsSurface
      : shouldRenderSettingsSurface
        ? settingsSurface
        : (
            <HostHomeSurface
              surface={surface === 'settings' || surface === 'developer' ? 'home' : surface}
              developerPresto={developerPresto}
              developerRuntime={developerRuntime}
              sidebarCollapsed={sidebarCollapsed}
              connectionStatus={sidebarConnectionStatus}
              locale={resolvedLocale}
              pluginHomeEntries={filteredPluginHomeEntries}
              automationEntries={filteredAutomationEntries}
              workspacePageRoute={workspacePageRoute}
              activeWorkspacePage={activeWorkspacePage}
              workspaceSettingsEntry={workspaceSettingsEntry}
              onOpenSettings={openSettings}
              onOpenWorkspace={(route) => {
                setWorkspacePageRoute(route)
                setSurface('workflows')
              }}
              onNavigate={openPrimarySurface}
              onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            />
          )

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme />
      {surfaceContent}
    </ThemeProvider>
  )
}
