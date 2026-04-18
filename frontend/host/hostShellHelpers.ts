import { createTheme } from '@mui/material/styles'

import type { DawTarget } from '@presto/contracts'
import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'
import { md3ColorSchemes, md3Shape, md3Typography } from '../ui/tokens'
import type {
  HostBuiltinSettingsPageId,
  HostPluginManagerModel,
  HostPluginRecord,
  HostPluginSettingsEntry,
  HostRenderedPluginPage,
  HostSettingsPageRoute,
  HostToolPageRoute,
  HostWorkspacePageRoute,
} from './pluginHostTypes'

export type LegacySettingsRouteInput = {
  kind?: unknown
  pageId?: unknown
  pluginId?: unknown
}

export const builtinSettingsPageIds = new Set<HostBuiltinSettingsPageId>([
  'general',
  'daw',
  'permissions',
  'updates',
  'diagnostics',
  'workflowExtensions',
  'automationExtensions',
  'toolExtensions',
])

export const defaultSettingsRoute: HostSettingsPageRoute = { kind: 'builtin', pageId: 'general' }

export function dawLabel(target: DawTarget): string {
  if (target === 'pro_tools') {
    return 'Pro Tools'
  }

  return target
}

function px(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseVersionSegment(value: string): number | string {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && String(parsed) === value ? parsed : value
}

export function compareVersions(left: string, right: string): number {
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

function pickHighestAvailableVersions<T extends { version: string }>(
  entries: readonly T[],
  keyOf: (entry: T) => string,
): Map<string, string> {
  const map = new Map<string, string>()

  for (const entry of entries) {
    const key = keyOf(entry)
    const current = map.get(key)
    if (!current || compareVersions(entry.version, current) > 0) {
      map.set(key, entry.version)
    }
  }

  return map
}

function requirementsSatisfied<T extends { minVersion: string }>(
  entries: readonly T[] | undefined,
  keyOf: (entry: T) => string,
  availableVersions: Map<string, string>,
): boolean {
  if (!entries || entries.length === 0) {
    return true
  }

  const minVersions = pickHighestMinVersions(entries, keyOf)
  for (const [key, minVersion] of minVersions) {
    const availableVersion = availableVersions.get(key)
    if (!availableVersion || compareVersions(availableVersion, minVersion) < 0) {
      return false
    }
  }

  return true
}

export function isPluginAvailableForSnapshot(
  plugin: HostPluginRecord,
  snapshot: DawAdapterSnapshot | null,
): boolean {
  if (plugin.extensionType === 'tool') {
    return true
  }

  if (
    snapshot &&
    plugin.supportedDaws &&
    plugin.supportedDaws.length > 0 &&
    !plugin.supportedDaws.includes(snapshot.targetDaw as DawTarget)
  ) {
    return false
  }

  if (!snapshot) {
    return true
  }

  const availableModules = pickHighestAvailableVersions(snapshot.modules, (module) => module.moduleId)
  if (
    !requirementsSatisfied(plugin.adapterModuleRequirements, (requirement) => requirement.moduleId, availableModules)
  ) {
    return false
  }

  const availableCapabilities = pickHighestAvailableVersions(snapshot.capabilities, (capability) => capability.capabilityId)
  return requirementsSatisfied(
    plugin.capabilityRequirements,
    (requirement) => requirement.capabilityId,
    availableCapabilities,
  )
}

export function createHostMuiTheme(mode: 'light' | 'dark') {
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
            color: colors.onSurface,
            fontFamily: md3Typography.plain,
          },
        },
      },
    },
  })
}

export function normalizeSettingsPageRoute(
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

export function sortPluginSettingsEntries(
  entries: readonly HostPluginSettingsEntry[],
): HostPluginSettingsEntry[] {
  return [...entries].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title),
  )
}

export function buildFilteredPluginManagerModel(input: {
  pluginManagerModel?: HostPluginManagerModel
  filteredPluginHomeEntries: readonly { pluginId: string }[]
  filteredAutomationEntries: readonly { pluginId: string }[]
  filteredPluginSettingsEntries: readonly HostPluginSettingsEntry[]
  pluginPages: readonly HostRenderedPluginPage[]
  isPluginAvailable(pluginId: string): boolean
}): HostPluginManagerModel | undefined {
  const {
    pluginManagerModel,
    filteredPluginHomeEntries,
    filteredAutomationEntries,
    filteredPluginSettingsEntries,
    pluginPages,
    isPluginAvailable,
  } = input

  if (!pluginManagerModel) {
    return undefined
  }

  return {
    ...pluginManagerModel,
    plugins: pluginManagerModel.plugins,
    settingsEntries: filteredPluginSettingsEntries.filter((entry) => isPluginAvailable(entry.pluginId)),
  }
}

export function findActiveWorkspacePage(
  workspacePageRoute: HostWorkspacePageRoute | null,
  pluginPages: readonly HostRenderedPluginPage[],
): HostRenderedPluginPage | null {
  if (!workspacePageRoute) {
    return null
  }

  return (
    pluginPages.find(
      (page) =>
        page.mount === 'workspace' &&
        page.pluginId === workspacePageRoute.pluginId &&
        page.pageId === workspacePageRoute.pageId,
    ) ?? null
  )
}

export function findActiveToolPage(
  toolPageRoute: HostToolPageRoute | null,
  pluginPages: readonly HostRenderedPluginPage[],
): HostRenderedPluginPage | null {
  if (!toolPageRoute) {
    return null
  }

  return (
    pluginPages.find(
      (page) =>
        page.mount === 'tools' &&
        page.pluginId === toolPageRoute.pluginId &&
        page.pageId === toolPageRoute.pageId,
    ) ?? null
  )
}
