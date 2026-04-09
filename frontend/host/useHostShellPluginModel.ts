import { useMemo } from 'react'

import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'

import {
  buildFilteredPluginManagerModel,
  isPluginAvailableForSnapshot,
  sortPluginSettingsEntries,
} from './hostShellHelpers'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginManagerModel,
  HostPluginSettingsEntry,
  HostRenderedPluginPage,
} from './pluginHostTypes'

export interface UseHostShellPluginModelInput {
  pluginHomeEntries: readonly HostPluginHomeEntry[]
  automationEntries: readonly HostAutomationEntry[]
  pluginPages: readonly HostRenderedPluginPage[]
  pluginManagerModel?: HostPluginManagerModel
  liveDawAdapterSnapshot: DawAdapterSnapshot | null
}

export interface UseHostShellPluginModelResult {
  filteredPluginHomeEntries: HostPluginHomeEntry[]
  filteredAutomationEntries: HostAutomationEntry[]
  filteredPluginPages: HostRenderedPluginPage[]
  pluginSettingsEntries: HostPluginSettingsEntry[]
  filteredPluginManagerModel: HostPluginManagerModel | undefined
}

export function useHostShellPluginModel({
  pluginHomeEntries,
  automationEntries,
  pluginPages,
  pluginManagerModel,
  liveDawAdapterSnapshot,
}: UseHostShellPluginModelInput): UseHostShellPluginModelResult {
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

  const pluginSettingsEntries = useMemo(
    () => allPluginSettingsEntries.filter((entry) => isPluginAvailable(entry.pluginId) && isPluginEnabled(entry.pluginId)),
    [allPluginSettingsEntries, pluginAvailabilityById, pluginManagerModel?.plugins],
  )

  const filteredPluginManagerModel: HostPluginManagerModel | undefined = useMemo(() => {
    return buildFilteredPluginManagerModel({
      pluginManagerModel,
      filteredPluginHomeEntries,
      filteredAutomationEntries,
      filteredPluginSettingsEntries: pluginSettingsEntries,
      pluginPages: filteredPluginPages,
      isPluginAvailable,
    })
  }, [
    filteredAutomationEntries,
    filteredPluginHomeEntries,
    filteredPluginPages,
    pluginSettingsEntries,
    pluginAvailabilityById,
    pluginManagerModel,
  ])

  return {
    filteredPluginHomeEntries,
    filteredAutomationEntries,
    filteredPluginPages,
    pluginSettingsEntries,
    filteredPluginManagerModel,
  }
}
