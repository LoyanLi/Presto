import { useEffect, useState } from 'react'

import type { HostPrimarySidebarRoute } from './HostPrimarySidebar'
import { defaultSettingsRoute, normalizeSettingsPageRoute, type LegacySettingsRouteInput } from './hostShellHelpers'
import type { HostShellState, HostShellViewId } from './hostShellState'
import type { HostSettingsPageRoute, HostToolPageRoute, HostWorkspacePageRoute } from './pluginHostTypes'
import type { HostShellPreferences } from './shellPreferences'

export interface UseHostShellNavigationStateInput {
  state: HostShellState
  preferences: HostShellPreferences
  smokeTarget?: string | null
  initialWorkspacePageRoute?: HostWorkspacePageRoute | null
  initialToolPageRoute?: HostToolPageRoute | null
  initialSettingsPageRoute?: HostSettingsPageRoute | LegacySettingsRouteInput | null
}

export interface UseHostShellNavigationStateResult {
  surface: HostShellViewId
  workspacePageRoute: HostWorkspacePageRoute | null
  toolPageRoute: HostToolPageRoute | null
  settingsRoute: HostSettingsPageRoute
  canAccessDeveloper: boolean
  setSurface(nextSurface: HostShellViewId): void
  setWorkspacePageRoute(route: HostWorkspacePageRoute | null): void
  setToolPageRoute(route: HostToolPageRoute | null): void
  setSettingsRoute(route: HostSettingsPageRoute): void
  openSettings(route?: HostSettingsPageRoute): void
  openPrimarySurface(nextSurface: HostPrimarySidebarRoute): void
  returnHome(): void
}

export function useHostShellNavigationState({
  state,
  preferences,
  smokeTarget = null,
  initialWorkspacePageRoute = null,
  initialToolPageRoute = null,
  initialSettingsPageRoute = null,
}: UseHostShellNavigationStateInput): UseHostShellNavigationStateResult {
  const [surface, setSurface] = useState<HostShellViewId>(() => state.shellViewId)
  const [workspacePageRoute, setWorkspacePageRoute] = useState<HostWorkspacePageRoute | null>(() => initialWorkspacePageRoute)
  const [toolPageRoute, setToolPageRoute] = useState<HostToolPageRoute | null>(() => initialToolPageRoute)
  const [settingsRoute, setSettingsRoute] = useState<HostSettingsPageRoute>(() =>
    normalizeSettingsPageRoute(initialSettingsPageRoute),
  )

  useEffect(() => {
    setSurface(state.shellViewId)
  }, [state.shellViewId])

  useEffect(() => {
    setWorkspacePageRoute(initialWorkspacePageRoute)
  }, [initialWorkspacePageRoute])

  useEffect(() => {
    setToolPageRoute(initialToolPageRoute)
  }, [initialToolPageRoute])

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
    setToolPageRoute(null)
    setSurface(nextSurface)
  }

  const returnHome = (): void => {
    setWorkspacePageRoute(null)
    setToolPageRoute(null)
    setSurface('home')
  }

  return {
    surface,
    workspacePageRoute,
    toolPageRoute,
    settingsRoute,
    canAccessDeveloper: preferences.developerMode || Boolean(smokeTarget),
    setSurface,
    setWorkspacePageRoute,
    setToolPageRoute,
    setSettingsRoute,
    openSettings,
    openPrimarySurface,
    returnHome,
  }
}
