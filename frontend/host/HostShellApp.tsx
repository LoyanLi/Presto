import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import type { DawTarget, PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { AppLatestReleaseInfo } from '@presto/sdk-runtime/clients/app'
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

const updateDialogOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'rgba(7, 10, 18, 0.52)',
  zIndex: 1400,
}

const updateDialogCardStyle: CSSProperties = {
  width: 'min(100%, 440px)',
  display: 'grid',
  gap: 16,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${md3ColorSchemes.light.outlineVariant}`,
  background: hostDialogSurfaceColor(),
  color: 'var(--md-sys-color-on-surface)',
  boxShadow: '0 24px 80px rgba(9, 13, 24, 0.28)',
}

const updateDialogTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
}

const updateDialogBodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--md-sys-color-on-surface-variant)',
  fontSize: 14,
  lineHeight: 1.6,
}

const updateDialogMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: 16,
  borderRadius: 18,
  background: 'var(--md-sys-color-surface-container-low)',
}

const updateDialogActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  flexWrap: 'wrap',
}

const updateDialogButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)',
  color: 'var(--md-sys-color-on-surface)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const updateDialogPrimaryButtonStyle: CSSProperties = {
  ...updateDialogButtonStyle,
  borderColor: 'var(--md-sys-color-primary)',
  background: 'var(--md-sys-color-primary)',
  color: 'var(--md-sys-color-on-primary)',
}

const defaultReleasePageUrl = 'https://github.com/LoyanLi/Presto/releases'
const macAccessibilitySettingsUrl = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
const macAccessibilityPermissionRequiredCode = 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED'

function hostDialogSurfaceColor(): string {
  return 'var(--md-sys-color-surface-container-high)'
}

function formatPublishedAt(raw: string, locale: string): string {
  if (!raw) {
    return '-'
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return raw
  }

  return date.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  const [preferencesHydrated, setPreferencesHydrated] = useState(() => !developerPresto?.config?.get)
  const [appVersion, setAppVersion] = useState('-')
  const [latestRelease, setLatestRelease] = useState<AppLatestReleaseInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [showMacAccessibilityDialog, setShowMacAccessibilityDialog] = useState(false)
  const startupUpdateCheckCompleteRef = useRef(false)
  const startupMacAccessibilityCheckCompleteRef = useRef(false)
  const updatePromptShownRef = useRef(false)
  const resolvedLocale = resolveHostLocale(preferences.language, getSystemLocaleCandidates())

  const {
    dawStatus,
    liveDawAdapterSnapshot,
    checkingDawConnection,
    dawRefreshKey,
    refresh: refreshDawStatus,
    setChecking: setCheckingDawConnection,
    setStatus: setDawStatus,
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
      setPreferencesHydrated(true)
      return
    }

    let active = true
    void developerPresto.config.get()
      .then((response) => {
        if (!active || !response?.config) {
          return
        }
        setHostShellPreferences(getHostShellPreferencesFromConfig(response.config))
        setPreferencesHydrated(true)
      })
      .catch(() => {
        if (active) {
          setPreferencesHydrated(true)
        }
      })

    return () => {
      active = false
    }
  }, [developerPresto])

  useEffect(() => {
    if (!developerRuntime?.app?.getVersion) {
      return
    }

    let cancelled = false
    void developerRuntime.app.getVersion()
      .then((version) => {
        if (!cancelled) {
          setAppVersion(version || '-')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppVersion('-')
        }
      })

    return () => {
      cancelled = true
    }
  }, [developerRuntime])

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

  const openReleasePage = async (): Promise<boolean> => {
    const releaseUrl = latestRelease?.htmlUrl || defaultReleasePageUrl
    if (!releaseUrl || !developerRuntime?.shell?.openExternal) {
      return false
    }

    try {
      setUpdateError('')
      await developerRuntime.shell.openExternal(releaseUrl)
      return true
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  const openMacAccessibilitySettings = async (): Promise<boolean> => {
    if (!developerRuntime?.shell?.openExternal) {
      return false
    }

    try {
      await developerRuntime.shell.openExternal(macAccessibilitySettingsUrl)
      return true
    } catch {
      return false
    }
  }

  const checkForUpdates = async ({ silent = false }: { silent?: boolean } = {}): Promise<void> => {
    if (!developerRuntime?.app?.checkForUpdates || !developerRuntime?.app?.getVersion) {
      return
    }

    try {
      setCheckingUpdate(true)
      if (!silent) {
        setUpdateError('')
      }
      const currentVersion = await developerRuntime.app.getVersion()
      const result = await developerRuntime.app.checkForUpdates({
        currentVersion,
        includePrerelease: preferences.includePrereleaseUpdates,
      })
      setAppVersion(result.currentVersion || currentVersion || '-')
      setLatestRelease(result.latestRelease)
      setHasUpdate(result.hasUpdate)
      if (result.hasUpdate && result.latestRelease && !updatePromptShownRef.current) {
        updatePromptShownRef.current = true
        setShowUpdateDialog(true)
      }
    } catch (error) {
      if (!silent) {
        setUpdateError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setCheckingUpdate(false)
    }
  }

  useEffect(() => {
    if (!preferencesHydrated || startupUpdateCheckCompleteRef.current) {
      return
    }
    if (!developerRuntime?.app?.checkForUpdates || !developerRuntime?.app?.getVersion) {
      startupUpdateCheckCompleteRef.current = true
      return
    }

    startupUpdateCheckCompleteRef.current = true
    void checkForUpdates({ silent: true })
  }, [developerRuntime, preferencesHydrated, preferences.includePrereleaseUpdates])

  useEffect(() => {
    if (startupMacAccessibilityCheckCompleteRef.current) {
      return
    }
    if (!developerRuntime?.macAccessibility?.preflight) {
      startupMacAccessibilityCheckCompleteRef.current = true
      return
    }

    startupMacAccessibilityCheckCompleteRef.current = true
    let cancelled = false
    void developerRuntime.macAccessibility.preflight()
      .then((result) => {
        if (cancelled) {
          return
        }
        if ((!result.ok || !result.trusted) && result.error === macAccessibilityPermissionRequiredCode) {
          setShowMacAccessibilityDialog(true)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [developerRuntime])

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
      appVersion={appVersion}
      latestRelease={latestRelease}
      checkingUpdate={checkingUpdate}
      updateError={updateError}
      hasNewRelease={hasUpdate}
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
      onIncludePrereleaseUpdatesChange={(selected) => {
        setLatestRelease(null)
        setHasUpdate(false)
        setUpdateError('')
        void persistHostShellPreferences({
          includePrereleaseUpdates: selected,
        })
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
      onCheckForUpdates={() => {
        void checkForUpdates()
      }}
      onOpenReleasePage={() => {
        void openReleasePage()
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
              developerRuntime={developerRuntime}
              activeDawTarget={liveDawAdapterSnapshot?.targetDaw ?? null}
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
      <>
        {surfaceContent}
        {showUpdateDialog && latestRelease ? (
          <div style={updateDialogOverlayStyle}>
            <div role="dialog" aria-modal="true" style={updateDialogCardStyle}>
              <div style={{ display: 'grid', gap: 8 }}>
                <h2 style={updateDialogTitleStyle}>{translateHost(resolvedLocale, 'settings.update.dialog.title')}</h2>
                <p style={updateDialogBodyStyle}>{translateHost(resolvedLocale, 'settings.update.dialog.body')}</p>
              </div>
              <div style={updateDialogMetaStyle}>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.update.dialog.currentVersion', { value: appVersion })}
                </p>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.update.dialog.latestVersion', { value: latestRelease.tagName })}
                </p>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.update.dialog.channel', {
                    value: latestRelease.prerelease
                      ? translateHost(resolvedLocale, 'settings.update.preview')
                      : translateHost(resolvedLocale, 'settings.update.stable'),
                  })}
                </p>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.update.dialog.publishedAt', {
                    value: formatPublishedAt(latestRelease.publishedAt, resolvedLocale),
                  })}
                </p>
              </div>
              <div style={updateDialogActionsStyle}>
                <button
                  type="button"
                  style={updateDialogButtonStyle}
                  onClick={() => setShowUpdateDialog(false)}
                >
                  {translateHost(resolvedLocale, 'settings.update.dialog.later')}
                </button>
                <button
                  type="button"
                  style={updateDialogPrimaryButtonStyle}
                  onClick={() => {
                    void openReleasePage().then((opened) => {
                      if (opened) {
                        setShowUpdateDialog(false)
                      }
                    })
                  }}
                >
                  {translateHost(resolvedLocale, 'settings.update.dialog.openRelease')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {showMacAccessibilityDialog ? (
          <div style={updateDialogOverlayStyle}>
            <div role="dialog" aria-modal="true" style={updateDialogCardStyle}>
              <div style={{ display: 'grid', gap: 8 }}>
                <h2 style={updateDialogTitleStyle}>
                  {translateHost(resolvedLocale, 'settings.accessibility.dialog.title')}
                </h2>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.accessibility.dialog.body')}
                </p>
              </div>
              <div style={updateDialogMetaStyle}>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.accessibility.dialog.steps')}
                </p>
                <p style={updateDialogBodyStyle}>
                  {translateHost(resolvedLocale, 'settings.accessibility.dialog.help')}
                </p>
              </div>
              <div style={updateDialogActionsStyle}>
                <button
                  type="button"
                  style={updateDialogButtonStyle}
                  onClick={() => setShowMacAccessibilityDialog(false)}
                >
                  {translateHost(resolvedLocale, 'settings.accessibility.dialog.later')}
                </button>
                <button
                  type="button"
                  style={updateDialogPrimaryButtonStyle}
                  onClick={() => {
                    void openMacAccessibilitySettings().then((opened) => {
                      if (opened) {
                        setShowMacAccessibilityDialog(false)
                      }
                    })
                  }}
                >
                  {translateHost(resolvedLocale, 'settings.accessibility.dialog.openSettings')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    </ThemeProvider>
  )
}
