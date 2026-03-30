import { useEffect, useMemo, useState } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import type { DawTarget, PluginRuntime, PrestoClient } from '../../packages/contracts/src'
import type { DawAdapterSnapshot } from '../../packages/sdk-runtime/src/clients/backend'
import { getThemeMode, subscribeThemeMode } from '../ui'
import { md3ColorSchemes, md3Shape, md3Typography } from '../ui/tokens'
import { useDawStatusPolling } from './hooks/useDawStatusPolling'
import { HostDeveloperSurface } from './HostDeveloperSurface'
import { HostHomeSurface } from './HostHomeSurface'
import { getSystemLocaleCandidates, resolveHostLocale, translateHost } from './i18n'
import type { HostPrimarySidebarRoute } from './HostPrimarySidebar'
import { HostSettingsSurface, type BuiltinSettingsEntry } from './HostSettingsSurface'
import type { HostShellState, HostShellViewId } from './hostShellState'
import type {
  HostAutomationEntry,
  HostBuiltinSettingsPageId,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostPluginRecord,
  HostRenderedPluginPage,
  HostSettingsPageRoute,
  HostPluginSettingsEntry,
  HostWorkspacePageRoute,
} from './pluginHostTypes'
import { getHostShellPreferences, setHostShellPreferences, subscribeHostShellPreferences } from './shellPreferences'
import { GeneralSettingsPage, type GeneralSettingsPageProps } from './settings/GeneralSettingsPage'
import { ExtensionsSettingsPage } from './settings/ExtensionsSettingsPage'

function dawLabel(target: DawTarget): string {
  if (target === 'pro_tools') {
    return 'Pro Tools'
  }

  return target
}

type LegacySettingsRouteInput = {
  kind?: unknown
  pageId?: unknown
  pluginId?: unknown
}

export interface HostShellAppProps {
  state: HostShellState
  developerPresto: PrestoClient
  developerRuntime: PluginRuntime
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
  onUninstallPlugin?(pluginId: string): void | Promise<void>
  onRefreshPlugins?(): void | Promise<void>
}

const builtinSettingsPageIds = new Set<HostBuiltinSettingsPageId>([
  'general',
  'workflowExtensions',
  'automationExtensions',
])
const defaultSettingsRoute: HostSettingsPageRoute = { kind: 'builtin', pageId: 'general' }

function px(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseVersionSegment(value: string): number | string {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && String(parsed) === value ? parsed : value
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.')
  const rightParts = right.split('.')
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = parseVersionSegment(leftParts[index] ?? '0')
    const rightPart = parseVersionSegment(rightParts[index] ?? '0')
    if (leftPart === rightPart) {
      continue
    }

    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      return leftPart > rightPart ? 1 : -1
    }

    return String(leftPart).localeCompare(String(rightPart))
  }

  return 0
}

function pickHighestMinVersions<T extends { minVersion: string }>(
  entries: readonly T[],
  keyOf: (entry: T) => string,
): Map<string, string> {
  const map = new Map<string, string>()

  for (const entry of entries) {
    const key = keyOf(entry)
    const current = map.get(key)
    if (!current || compareVersions(entry.minVersion, current) > 0) {
      map.set(key, entry.minVersion)
    }
  }

  return map
}

function isPluginAvailableForSnapshot(plugin: HostPluginRecord, snapshot: DawAdapterSnapshot | null): boolean {
  if (snapshot && plugin.supportedDaws && plugin.supportedDaws.length > 0 && !plugin.supportedDaws.includes(snapshot.targetDaw as DawTarget)) {
    return false
  }

  if (!snapshot) {
    return true
  }

  const moduleRequirements = pickHighestMinVersions(plugin.adapterModuleRequirements ?? [], (entry) => entry.moduleId)
  if (moduleRequirements.size > 0) {
    const moduleVersions = new Map(snapshot.modules.map((module) => [module.moduleId, module.version]))
    for (const [moduleId, minVersion] of moduleRequirements.entries()) {
      const current = moduleVersions.get(moduleId)
      if (!current || compareVersions(current, minVersion) < 0) {
        return false
      }
    }
  }

  const capabilityRequirements = pickHighestMinVersions(plugin.capabilityRequirements ?? [], (entry) => entry.capabilityId)
  if (capabilityRequirements.size > 0) {
    const capabilityVersions = new Map(snapshot.capabilities.map((capability) => [capability.capabilityId, capability.version]))
    for (const [capabilityId, minVersion] of capabilityRequirements.entries()) {
      const current = capabilityVersions.get(capabilityId)
      if (!current || compareVersions(current, minVersion) < 0) {
        return false
      }
    }
  }

  return true
}

function createHostMuiTheme(mode: 'light' | 'dark') {
  const colors = md3ColorSchemes[mode]

  return createTheme({
    palette: {
      mode,
      primary: {
        main: colors.primary,
        contrastText: colors.onPrimary,
      },
      secondary: {
        main: colors.secondary,
        contrastText: colors.onSecondary,
      },
      error: {
        main: colors.error,
        contrastText: colors.onError,
      },
      background: {
        default: colors.background,
        paper: colors.surfaceContainerLow,
      },
      text: {
        primary: colors.onSurface,
        secondary: colors.onSurfaceVariant,
      },
      divider: colors.outlineVariant,
    },
    shape: {
      borderRadius: px(md3Shape.cornerMedium),
    },
    typography: {
      fontFamily: md3Typography.plain,
      h2: {
        fontFamily: md3Typography.brand,
        fontSize: md3Typography.headlineSize,
        fontWeight: 800,
      },
      button: {
        fontFamily: md3Typography.plain,
        fontWeight: 700,
        textTransform: 'none',
      },
      body1: {
        fontFamily: md3Typography.plain,
        fontSize: md3Typography.bodySize,
      },
      body2: {
        fontFamily: md3Typography.plain,
        fontSize: md3Typography.smallSize,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
          },
          body: {
            backgroundColor: colors.background,
            color: colors.onBackground,
            fontFamily: md3Typography.plain,
          },
        },
      },
    },
  })
}

function normalizeSettingsPageRoute(
  route: HostSettingsPageRoute | LegacySettingsRouteInput | null | undefined,
): HostSettingsPageRoute {
  if (!route || typeof route !== 'object') {
    return defaultSettingsRoute
  }

  const candidate = route as LegacySettingsRouteInput

  if (
    candidate.kind === 'builtin' &&
    typeof candidate.pageId === 'string' &&
    builtinSettingsPageIds.has(candidate.pageId as HostBuiltinSettingsPageId)
  ) {
    return {
      kind: 'builtin',
      pageId: candidate.pageId as HostBuiltinSettingsPageId,
    }
  }

  if (
    candidate.kind === 'plugin' &&
    typeof candidate.pluginId === 'string' &&
    typeof candidate.pageId === 'string'
  ) {
    return {
      kind: 'plugin',
      pluginId: candidate.pluginId,
      pageId: candidate.pageId,
    }
  }

  if (typeof candidate.pluginId === 'string' && typeof candidate.pageId === 'string') {
    return {
      kind: 'plugin',
      pluginId: candidate.pluginId,
      pageId: candidate.pageId,
    }
  }

  if (
    typeof candidate.pageId === 'string' &&
    builtinSettingsPageIds.has(candidate.pageId as HostBuiltinSettingsPageId)
  ) {
    return {
      kind: 'builtin',
      pageId: candidate.pageId as HostBuiltinSettingsPageId,
    }
  }

  return defaultSettingsRoute
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
  onUninstallPlugin,
  onRefreshPlugins,
}: HostShellAppProps) {
  const initialPreferences = getHostShellPreferences()
  const initialResolvedLocale = resolveHostLocale(initialPreferences.language, getSystemLocaleCandidates())
  const [surface, setSurface] = useState<HostShellViewId>(() => state.shellViewId)
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>(() => getThemeMode())
  const [preferences, setPreferencesState] = useState(() => initialPreferences)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
    resolvedLocale: initialResolvedLocale,
    initialSnapshot: dawAdapterSnapshot,
  })
  const [workspacePageRoute, setWorkspacePageRoute] = useState<HostWorkspacePageRoute | null>(() => initialWorkspacePageRoute)
  const [settingsRoute, setSettingsRoute] = useState<HostSettingsPageRoute>(() =>
    normalizeSettingsPageRoute(initialSettingsPageRoute),
  )
  const resolvedLocale = resolveHostLocale(preferences.language, getSystemLocaleCandidates())

  useEffect(() => {
    setSurface(state.shellViewId)
  }, [state.shellViewId])

  useEffect(() => subscribeThemeMode((mode) => setThemeModeState(mode)), [])
  useEffect(() => subscribeHostShellPreferences((nextPreferences) => setPreferencesState(nextPreferences)), [])

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

  const filteredPluginHomeEntries = useMemo(
    () => pluginHomeEntries.filter((entry) => isPluginAvailable(entry.pluginId)),
    [pluginHomeEntries, pluginAvailabilityById],
  )

  const filteredAutomationEntries = useMemo(
    () => automationEntries.filter((entry) => isPluginAvailable(entry.pluginId)),
    [automationEntries, pluginAvailabilityById],
  )

  const allPluginSettingsEntries = useMemo(
    () =>
      [...(pluginManagerModel?.settingsEntries ?? [])].sort(
        (left, right) => (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title),
      ),
    [pluginManagerModel?.settingsEntries],
  )

  const filteredPluginSettingsEntries = useMemo(
    () => allPluginSettingsEntries.filter((entry) => isPluginAvailable(entry.pluginId)),
    [allPluginSettingsEntries, pluginAvailabilityById],
  )

  const filteredPluginManagerModel: HostPluginManagerModel | undefined = useMemo(() => {
    if (!pluginManagerModel) {
      return undefined
    }

    const surfacedPluginIds = new Set<string>()
    for (const entry of filteredPluginHomeEntries) {
      surfacedPluginIds.add(entry.pluginId)
    }
    for (const entry of filteredAutomationEntries) {
      surfacedPluginIds.add(entry.pluginId)
    }
    for (const entry of filteredPluginSettingsEntries) {
      surfacedPluginIds.add(entry.pluginId)
    }
    for (const page of pluginPages) {
      surfacedPluginIds.add(page.pluginId)
    }

    const plugins = pluginManagerModel.plugins.filter(
      (plugin) => surfacedPluginIds.has(plugin.pluginId) && isPluginAvailable(plugin.pluginId),
    )
    const pluginIds = new Set(plugins.map((plugin) => plugin.pluginId))
    return {
      ...pluginManagerModel,
      plugins,
      settingsEntries: filteredPluginSettingsEntries.filter((entry) => pluginIds.has(entry.pluginId)),
    }
  }, [
    filteredAutomationEntries,
    filteredPluginHomeEntries,
    filteredPluginSettingsEntries,
    pluginAvailabilityById,
    pluginManagerModel,
    pluginPages,
  ])

  const pluginSettingsEntries = filteredPluginSettingsEntries

  const activeWorkspacePage =
    workspacePageRoute === null
      ? null
      : pluginPages.find(
          (page) =>
            page.mount === 'workspace' &&
            page.pluginId === workspacePageRoute.pluginId &&
            page.pageId === workspacePageRoute.pageId,
        ) ?? null

  const activeSettingsEntry =
    settingsRoute.kind === 'plugin'
      ? allPluginSettingsEntries.find(
          (entry) => entry.pluginId === settingsRoute.pluginId && entry.pageId === settingsRoute.pageId,
        ) ?? null
      : null

  const workspaceSettingsEntry: HostPluginSettingsEntry | null = workspacePageRoute
    ? allPluginSettingsEntries.find((entry) => entry.pluginId === workspacePageRoute.pluginId) ?? null
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
      ? allPluginSettingsEntries.find(
          (entry) => entry.pluginId === settingsRoute.pluginId && entry.pageId === settingsRoute.pageId,
        )?.title ?? translateHost(resolvedLocale, 'home.pluginSettings')
      : builtinSettingsNav.find((entry) => entry.pageId === settingsRoute.pageId)?.title ?? translateHost(resolvedLocale, 'sidebar.settings')

  const canAccessDeveloper = preferences.developerMode || Boolean(smokeTarget)

  const openSettings = (route: HostSettingsPageRoute = defaultSettingsRoute): void => {
    setSettingsRoute(route)
    setSurface('settings')
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
      dawStatus={dawStatus}
      checkingConnection={checkingDawConnection}
      runtime={developerRuntime as GeneralSettingsPageProps['runtime']}
      onDeveloperModeChange={(selected) => {
        setHostShellPreferences({
          developerMode: selected,
        })
      }}
      onLanguageChange={(language) => {
        setHostShellPreferences({
          language,
        })
        refreshDawStatus()
      }}
      onDawTargetChange={async (target) => {
        setHostShellPreferences({
          dawTarget: target,
        })
        setDawStatus((current) => ({
          ...current,
          targetLabel: dawLabel(target),
        }))
        if (developerRuntime?.backend && typeof developerRuntime.backend.setDawTarget === 'function') {
          setCheckingDawConnection(true)
          try {
            await developerRuntime.backend.setDawTarget(target)
          } finally {
            setCheckingDawConnection(false)
          }
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
