import { useEffect, useMemo, useState } from 'react'

import type { DawTarget, PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'
import { formatHostErrorMessage } from '../errorDisplay'
import { translateHost } from '../i18n'

type HostDawStatusState = {
  connected: boolean
  targetLabel: string
  sessionName: string
  statusLabel: string
  lastError: string
}

const DISCONNECTED_DAW_STATUS: HostDawStatusState = {
  connected: false,
  targetLabel: 'Pro Tools',
  sessionName: '',
  statusLabel: '',
  lastError: '',
}

type UseDawStatusPollingInput = {
  developerPresto: PrestoClient
  developerRuntime: PrestoRuntime
  preferences: { dawTarget: DawTarget }
  resolvedLocale: string
  initialSnapshot?: DawAdapterSnapshot | null
}

export function useDawStatusPolling({
  developerPresto,
  developerRuntime,
  preferences,
  resolvedLocale,
  initialSnapshot = null,
}: UseDawStatusPollingInput) {
  const [checkingDawConnection, setCheckingDawConnection] = useState(false)
  const [dawRefreshKey, setDawRefreshKey] = useState(0)
  const [dawStatus, setDawStatus] = useState<HostDawStatusState>(() => ({
    ...DISCONNECTED_DAW_STATUS,
    targetLabel: dawLabel(preferences.dawTarget),
    statusLabel: translateHost(resolvedLocale, 'general.disconnected'),
  }))
  const [liveDawAdapterSnapshot, setLiveDawAdapterSnapshot] = useState<DawAdapterSnapshot | null>(initialSnapshot)

  useEffect(() => {
    setLiveDawAdapterSnapshot(initialSnapshot)
  }, [initialSnapshot])

  useEffect(() => {
    setDawStatus((current) => ({
      ...current,
      targetLabel: dawLabel(preferences.dawTarget),
    }))
  }, [preferences.dawTarget])

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const refreshDawStatus = async () => {
      if (!developerPresto?.daw?.connection || typeof developerPresto.daw.connection.getStatus !== 'function') {
        if (!cancelled) {
          setCheckingDawConnection(false)
          setDawStatus((current) => ({
            ...current,
            targetLabel: dawLabel(preferences.dawTarget),
            statusLabel: translateHost(resolvedLocale, 'general.disconnected'),
          }))
        }
        return
      }

      try {
        const status = await developerPresto.daw.connection.getStatus()
        let sessionName = ''
        if (status.connected && developerPresto?.session && typeof developerPresto.session.getInfo === 'function') {
          try {
            sessionName = (await developerPresto.session.getInfo()).session?.sessionName ?? ''
          } catch {
            sessionName = ''
          }
        }

        if (!cancelled) {
          setDawStatus({
            connected: Boolean(status.connected),
            targetLabel: dawLabel((status.targetDaw ?? preferences.dawTarget) as DawTarget),
            sessionName,
            statusLabel: status.connected
              ? translateHost(resolvedLocale, 'general.connected')
              : translateHost(resolvedLocale, 'general.disconnected'),
            lastError: '',
          })
        }
        if (!cancelled && developerRuntime?.backend && typeof developerRuntime.backend.getDawAdapterSnapshot === 'function') {
          try {
            const snapshot = await developerRuntime.backend.getDawAdapterSnapshot()
            if (!cancelled) {
              setLiveDawAdapterSnapshot(snapshot)
            }
          } catch {
            // Keep the last known adapter snapshot when polling fails.
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDawStatus((current) => ({
            ...current,
            connected: false,
            statusLabel: translateHost(resolvedLocale, 'general.disconnected'),
            lastError: formatHostErrorMessage(error, 'Failed to read DAW connection status.'),
          }))
        }
      } finally {
        if (!cancelled) {
          setCheckingDawConnection(false)
          timeoutId = setTimeout(() => {
            void refreshDawStatus()
          }, 5000)
        }
      }
    }

    void refreshDawStatus()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [dawRefreshKey, developerPresto, developerRuntime?.backend, preferences.dawTarget, resolvedLocale])

  const triggerRefresh = useMemo(
    () => ({
      refresh: () => setDawRefreshKey((current) => current + 1),
      setChecking: (next: boolean) => setCheckingDawConnection(next),
      setStatus: setDawStatus,
    }),
    [],
  )

  return {
    dawStatus,
    liveDawAdapterSnapshot,
    checkingDawConnection,
    dawRefreshKey,
    ...triggerRefresh,
  }
}

function dawLabel(target: DawTarget): string {
  if (target === 'pro_tools') {
    return 'Pro Tools'
  }

  return target
}
