import { useEffect, useMemo, useRef, useState } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'

import type { DawConnectionGetStatusResponse, DawTarget, PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'
import { getThemeMode, getThemePreference, setThemePreference, subscribeThemeMode, subscribeThemePreference } from '../ui'
import { useDawStatusPolling } from './hooks/useDawStatusPolling'
import { HostDeveloperSurface } from './HostDeveloperSurface'
import { HostAccessibilityDialog, HostUpdateDialog } from './HostShellDialogs'
import { HostHomeSurface } from './HostHomeSurface'
import { getSystemLocaleCandidates, resolveHostLocale, translateHost } from './i18n'
import { HostSettingsSurface, type BuiltinSettingsEntry } from './HostSettingsSurface'
import type { HostShellState } from './hostShellState'
import {
  createHostMuiTheme,
  dawLabel,
  findActiveToolPage,
  findActiveWorkspacePage,
  type LegacySettingsRouteInput,
} from './hostShellHelpers'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostRenderedPluginPage,
  HostSettingsPageRoute,
  HostPluginSettingsEntry,
  HostToolEntry,
  HostToolPageRoute,
  HostWorkspacePageRoute,
} from './pluginHostTypes'
import { GeneralSettingsPage, type GeneralSettingsPageProps } from './settings/GeneralSettingsPage'
import { DawSettingsPage } from './settings/DawSettingsPage'
import { PermissionsSettingsPage } from './settings/PermissionsSettingsPage'
import { UpdatesSettingsPage } from './settings/UpdatesSettingsPage'
import { DiagnosticsSettingsPage } from './settings/DiagnosticsSettingsPage'
import { ExtensionsSettingsPage } from './settings/ExtensionsSettingsPage'
import { useHostShellNavigationState } from './useHostShellNavigationState'
import { useHostShellPreferencesState } from './useHostShellPreferencesState'
import { useHostShellRuntimeState } from './useHostShellRuntimeState'
import { useHostShellPluginModel } from './useHostShellPluginModel'

const defaultReleasePageUrl = 'https://github.com/LoyanLi/Presto/releases'
const macAccessibilitySettingsUrl = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
const macAccessibilityPermissionRequiredCode = 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED'

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
  initialDawConnectionStatus?: DawConnectionGetStatusResponse | null
  initialWorkspacePageRoute?: HostWorkspacePageRoute | null
  initialToolPageRoute?: HostToolPageRoute | null
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
  initialDawConnectionStatus = null,
  initialWorkspacePageRoute = null,
  initialToolPageRoute = null,
  initialSettingsPageRoute = null,
  onInstallPluginDirectory,
  onInstallPluginZip,
  onSetPluginEnabled,
  onUninstallPlugin,
  onRefreshPlugins,
}: HostShellAppProps) {
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>(() => getThemeMode())
  const [themePreference, setThemePreferenceState] = useState(() => getThemePreference())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { preferences, preferencesHydrated, applyHostShellPreferences, persistHostShellPreferences } = useHostShellPreferencesState({
    developerPresto,
  })
  const resolvedLocale = resolveHostLocale(preferences.language, getSystemLocaleCandidates())
  const macAccessibilityPreflight = developerRuntime?.macAccessibility?.preflight

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
    initialConnectionStatus: initialDawConnectionStatus,
  })
  const {
    surface,
    workspacePageRoute,
    toolPageRoute,
    settingsRoute,
    canAccessDeveloper,
    setSurface,
    setWorkspacePageRoute,
    setToolPageRoute,
    setSettingsRoute,
    openSettings,
    openPrimarySurface,
    returnHome,
  } = useHostShellNavigationState({
    state,
    preferences,
    smokeTarget,
    initialWorkspacePageRoute,
    initialToolPageRoute,
    initialSettingsPageRoute,
  })
  const {
    appVersion,
    latestRelease,
    checkingUpdate,
    updateError,
    hasUpdate,
    showUpdateDialog,
    showMacAccessibilityDialog,
    checkingPermissions,
    permissionStatus,
    missingRequiredPermissions,
    setShowUpdateDialog,
    setShowMacAccessibilityDialog,
    setLatestRelease,
    setHasUpdate,
    setUpdateError,
    checkForUpdates,
    checkRequiredPermissions,
    openReleasePage,
    openMacAccessibilitySettings,
  } = useHostShellRuntimeState({
    developerRuntime,
    preferencesHydrated,
    includePrereleaseUpdates: preferences.includePrereleaseUpdates,
    defaultReleasePageUrl,
    macAccessibilitySettingsUrl,
    macAccessibilityPermissionRequiredCode,
    macAccessibilityPreflight,
  })
  const startupPermissionRedirectRef = useRef(false)

  useEffect(() => subscribeThemeMode((mode) => setThemeModeState(mode)), [])
  useEffect(() => subscribeThemePreference((preferenceMode) => setThemePreferenceState(preferenceMode)), [])
  useEffect(() => {
    if (missingRequiredPermissions.length === 0 || startupPermissionRedirectRef.current) {
      return
    }

    startupPermissionRedirectRef.current = true
    openSettings({ kind: 'builtin', pageId: 'general' })
  }, [missingRequiredPermissions.length, openSettings])

  const muiTheme = useMemo(() => createHostMuiTheme(themeMode), [themeMode])

  const {
    filteredPluginHomeEntries,
    filteredAutomationEntries,
    filteredPluginPages,
    pluginSettingsEntries,
    filteredPluginManagerModel,
  } = useHostShellPluginModel({
    pluginHomeEntries,
    automationEntries,
    pluginPages,
    pluginManagerModel,
    liveDawAdapterSnapshot,
  })

  const workspacePages = useMemo(
    () => filteredPluginPages.filter((page) => page.mount === 'workspace'),
    [filteredPluginPages],
  )
  const toolPages = useMemo(
    () => filteredPluginPages.filter((page) => page.mount === 'tools'),
    [filteredPluginPages],
  )

  const activeWorkspacePage = findActiveWorkspacePage(workspacePageRoute, workspacePages)
  const activeToolPage = findActiveToolPage(toolPageRoute, toolPages)

  const activeSettingsEntry =
    settingsRoute.kind === 'plugin'
      ? pluginSettingsEntries.find(
          (entry) => entry.pluginId === settingsRoute.pluginId && entry.pageId === settingsRoute.pageId,
        ) ?? null
      : null

  const workspaceSettingsEntry: HostPluginSettingsEntry | null = workspacePageRoute
    ? pluginSettingsEntries.find((entry) => entry.pluginId === workspacePageRoute.pluginId) ?? null
    : null
  const toolSettingsEntry: HostPluginSettingsEntry | null = toolPageRoute
    ? pluginSettingsEntries.find((entry) => entry.pluginId === toolPageRoute.pluginId) ?? null
    : null

  const toolEntries: HostToolEntry[] = useMemo(() => {
    const descriptionsByPluginId = new Map(
      (filteredPluginManagerModel?.plugins ?? []).map((plugin) => [plugin.pluginId, plugin.description ?? '']),
    )
    return toolPages.map((page) => ({
      pluginId: page.pluginId,
      pageId: page.pageId,
      title: page.title,
      description: descriptionsByPluginId.get(page.pluginId) || page.title,
      actionLabel: translateHost(resolvedLocale, 'home.openTool'),
    }))
  }, [filteredPluginManagerModel?.plugins, resolvedLocale, toolPages])

  const settingsReturnSurface: 'workflows' | 'tools' | null =
    settingsRoute.kind === 'plugin' &&
    workspacePageRoute !== null &&
    settingsRoute.pluginId === workspacePageRoute.pluginId
      ? 'workflows'
      : settingsRoute.kind === 'plugin' &&
          toolPageRoute !== null &&
          settingsRoute.pluginId === toolPageRoute.pluginId
        ? 'tools'
        : null
  const settingsReturnsToWorkspace = settingsReturnSurface !== null

  const builtinSettingsNav: readonly BuiltinSettingsEntry[] = [
    {
      pageId: 'general',
      title: translateHost(resolvedLocale, 'settings.general.title'),
      description: translateHost(resolvedLocale, 'settings.general.body'),
    },
    {
      pageId: 'daw',
      title: translateHost(resolvedLocale, 'settings.daw.title'),
      description: translateHost(resolvedLocale, 'settings.daw.body'),
    },
    {
      pageId: 'permissions',
      title: translateHost(resolvedLocale, 'settings.permissions.title'),
      description: translateHost(resolvedLocale, 'settings.permissions.navBody'),
    },
    {
      pageId: 'updates',
      title: translateHost(resolvedLocale, 'settings.updates.title'),
      description: translateHost(resolvedLocale, 'settings.updates.body'),
    },
    {
      pageId: 'diagnostics',
      title: translateHost(resolvedLocale, 'settings.diagnostics.title'),
      description: translateHost(resolvedLocale, 'settings.diagnostics.body'),
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
    {
      pageId: 'toolExtensions',
      title: translateHost(resolvedLocale, 'settings.extensions.tools.title'),
      description: translateHost(resolvedLocale, 'settings.extensions.tools.body'),
    },
  ]

  const settingsTitle =
    settingsRoute.kind === 'plugin'
      ? pluginSettingsEntries.find(
          (entry) => entry.pluginId === settingsRoute.pluginId && entry.pageId === settingsRoute.pageId,
        )?.title ?? translateHost(resolvedLocale, 'home.pluginSettings')
      : builtinSettingsNav.find((entry) => entry.pageId === settingsRoute.pageId)?.title ?? translateHost(resolvedLocale, 'sidebar.settings')

  const generalPage = (
    <GeneralSettingsPage
      locale={resolvedLocale}
      preferences={preferences}
      themePreference={themePreference}
      onThemePreferenceChange={(preferenceMode) => {
        setThemePreference(preferenceMode)
      }}
      onLanguageChange={(language) => {
        void persistHostShellPreferences({
          language,
        })
      }}
    />
  )

  const dawPage = (
    <DawSettingsPage
      locale={resolvedLocale}
      dawTarget={preferences.dawTarget}
      dawStatus={dawStatus}
      checkingConnection={checkingDawConnection}
      onDawTargetChange={async (target) => {
        setCheckingDawConnection(true)
        try {
          await developerRuntime.backend.setDawTarget(target)
          applyHostShellPreferences({
            dawTarget: target,
          })
          setDawStatus((current) => ({
            ...current,
            targetLabel: dawLabel(target),
          }))
        } finally {
          setCheckingDawConnection(false)
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

  const permissionsPage = (
    <PermissionsSettingsPage
      locale={resolvedLocale}
      checkingPermissions={checkingPermissions}
      permissionStatus={permissionStatus}
      onRecheckPermissions={() => {
        void checkRequiredPermissions()
      }}
      onOpenPermissionSettings={(permissionId) => {
        if (permissionId === 'macAccessibility') {
          void openMacAccessibilitySettings()
        }
      }}
    />
  )

  const updatesPage = (
    <UpdatesSettingsPage
      locale={resolvedLocale}
      appVersion={appVersion}
      latestRelease={latestRelease}
      checkingUpdate={checkingUpdate}
      updateError={updateError}
      hasNewRelease={hasUpdate}
      includePrereleaseUpdates={preferences.includePrereleaseUpdates}
      onIncludePrereleaseUpdatesChange={(selected) => {
        setLatestRelease(null)
        setHasUpdate(false)
        setUpdateError('')
        void persistHostShellPreferences({
          includePrereleaseUpdates: selected,
        })
      }}
      onCheckForUpdates={() => {
        void checkForUpdates()
      }}
      onOpenReleasePage={() => {
        void openReleasePage()
      }}
    />
  )

  const diagnosticsPage = (
    <DiagnosticsSettingsPage
      locale={resolvedLocale}
      developerMode={preferences.developerMode}
      runtime={developerRuntime as GeneralSettingsPageProps['runtime']}
      onDeveloperModeChange={(selected) => {
        void persistHostShellPreferences({
          developerMode: selected,
        })
      }}
    />
  )

  const sidebarConnectionStatus = {
    status: dawStatus.status,
    targetLabel: dawStatus.targetLabel,
    sessionName: dawStatus.sessionName,
    statusLabel: dawStatus.statusLabel,
  }

  const workflowExtensionsPage = (
    <ExtensionsSettingsPage
      locale={resolvedLocale}
      extensionType="workflow"
      pluginManagerModel={filteredPluginManagerModel}
      dawAdapterSnapshot={liveDawAdapterSnapshot}
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
      dawAdapterSnapshot={liveDawAdapterSnapshot}
      pluginSettingsEntries={pluginSettingsEntries}
      onInstallPluginDirectory={onInstallPluginDirectory}
      onInstallPluginZip={onInstallPluginZip}
      onSetPluginEnabled={onSetPluginEnabled}
      onUninstallPlugin={onUninstallPlugin}
      onRefreshPlugins={onRefreshPlugins}
    />
  )

  const toolExtensionsPage = (
    <ExtensionsSettingsPage
      locale={resolvedLocale}
      extensionType="tool"
      pluginManagerModel={filteredPluginManagerModel}
      dawAdapterSnapshot={liveDawAdapterSnapshot}
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
      onBackToWorkspace={() => setSurface(settingsReturnSurface ?? 'home')}
      generalPage={generalPage}
      dawPage={dawPage}
      permissionsPage={permissionsPage}
      updatesPage={updatesPage}
      diagnosticsPage={diagnosticsPage}
      workflowExtensionsPage={workflowExtensionsPage}
      automationExtensionsPage={automationExtensionsPage}
      toolExtensionsPage={toolExtensionsPage}
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
              toolEntries={toolEntries}
              automationEntries={filteredAutomationEntries}
              workspacePageRoute={workspacePageRoute}
              toolPageRoute={toolPageRoute}
              activeWorkspacePage={activeWorkspacePage}
              activeToolPage={activeToolPage}
              workspaceSettingsEntry={workspaceSettingsEntry}
              toolSettingsEntry={toolSettingsEntry}
              onOpenSettings={openSettings}
              onOpenWorkspace={(route) => {
                setWorkspacePageRoute(route)
                setSurface('workflows')
              }}
              onOpenTool={(route) => {
                setToolPageRoute(route)
                setSurface('tools')
              }}
              onNavigate={openPrimarySurface}
              onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
            />
          )

  const updateDialogCopy = latestRelease
    ? {
      title: translateHost(resolvedLocale, 'settings.update.dialog.title'),
      body: translateHost(resolvedLocale, 'settings.update.dialog.body'),
      currentVersion: translateHost(resolvedLocale, 'settings.update.dialog.currentVersion', { value: appVersion }),
      latestVersion: translateHost(resolvedLocale, 'settings.update.dialog.latestVersion', { value: latestRelease.tagName }),
      channel: translateHost(resolvedLocale, 'settings.update.dialog.channel', {
        value: latestRelease.prerelease
          ? translateHost(resolvedLocale, 'settings.update.preview')
          : translateHost(resolvedLocale, 'settings.update.stable'),
      }),
      publishedAt: translateHost(resolvedLocale, 'settings.update.dialog.publishedAt', {
        value: formatPublishedAt(latestRelease.publishedAt, resolvedLocale),
      }),
      later: translateHost(resolvedLocale, 'settings.update.dialog.later'),
      openRelease: translateHost(resolvedLocale, 'settings.update.dialog.openRelease'),
    }
    : null

  const accessibilityDialogCopy = {
    title: translateHost(resolvedLocale, 'settings.accessibility.dialog.title'),
    body: translateHost(resolvedLocale, 'settings.accessibility.dialog.body'),
    steps: translateHost(resolvedLocale, 'settings.accessibility.dialog.steps'),
    help: translateHost(resolvedLocale, 'settings.accessibility.dialog.help'),
    later: translateHost(resolvedLocale, 'settings.accessibility.dialog.later'),
    openSettings: translateHost(resolvedLocale, 'settings.accessibility.dialog.openSettings'),
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme />
      <>
        {surfaceContent}
        {showUpdateDialog && latestRelease && updateDialogCopy ? (
          <HostUpdateDialog
            copy={updateDialogCopy}
            onClose={() => setShowUpdateDialog(false)}
            onOpenRelease={() => {
              void openReleasePage().then((opened) => {
                if (opened) {
                  setShowUpdateDialog(false)
                }
              })
            }}
          />
        ) : null}
        {showMacAccessibilityDialog ? (
          <HostAccessibilityDialog
            copy={accessibilityDialogCopy}
            onClose={() => setShowMacAccessibilityDialog(false)}
            onOpenSettings={() => {
              void openMacAccessibilitySettings().then((opened) => {
                if (opened) {
                  setShowMacAccessibilityDialog(false)
                }
              })
            }}
          />
        ) : null}
      </>
    </ThemeProvider>
  )
}
