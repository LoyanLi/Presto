import { useEffect, useState } from 'react'

import type { PrestoClient } from '@presto/contracts'

import { applyHostShellPreferencesToConfig, getHostShellPreferencesFromConfig } from './runtimePreferences'
import {
  getHostShellPreferences,
  hydrateHostShellPreferences,
  setHostShellPreferences,
  subscribeHostShellPreferences,
  type HostShellPreferences,
} from './shellPreferences'

export interface UseHostShellPreferencesStateInput {
  developerPresto: PrestoClient
}

export interface UseHostShellPreferencesStateResult {
  preferences: HostShellPreferences
  preferencesHydrated: boolean
  persistHostShellPreferences(nextPreferences: Partial<HostShellPreferences>): Promise<HostShellPreferences>
}

export function useHostShellPreferencesState({
  developerPresto,
}: UseHostShellPreferencesStateInput): UseHostShellPreferencesStateResult {
  const [preferences, setPreferencesState] = useState(() => getHostShellPreferences())
  const [preferencesHydrated, setPreferencesHydrated] = useState(() => !developerPresto?.config?.get)

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
        hydrateHostShellPreferences(getHostShellPreferencesFromConfig(response.config))
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

  const persistHostShellPreferences = async (
    nextPreferences: Partial<HostShellPreferences>,
  ): Promise<HostShellPreferences> => {
    if (!developerPresto?.config?.get || !developerPresto?.config?.update) {
      return setHostShellPreferences(nextPreferences)
    }

    const currentConfig = await developerPresto.config.get()
    const resolvedPreferences = {
      ...getHostShellPreferences(),
      ...nextPreferences,
    }

    await developerPresto.config.update({
      config: applyHostShellPreferencesToConfig(currentConfig.config, resolvedPreferences),
    })
    return setHostShellPreferences(resolvedPreferences)
  }

  return {
    preferences,
    preferencesHydrated,
    persistHostShellPreferences,
  }
}
