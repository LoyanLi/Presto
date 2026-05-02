import { useEffect, useMemo, useState } from 'react'

import type { DawConnectionGetStatusResponse, DawTarget, PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'
import { formatHostErrorMessage } from '../errorDisplay'
import { translateHost } from '../i18n'
import { dawLabel } from '../hostShellHelpers'

export type HostDawConnectionState = 'connected' | 'disconnected' | 'unknown'

type HostDawStatusState = {
  status: HostDawConnectionState
  targetLabel: string
  sessionName: string
  statusLabel: string
  lastError: string
}

const DEFAULT_DAW_STATUS: HostDawStatusState = {
  status: 'disconnected',
  targetLabel: 'Pro Tools',
  sessionName: '',
  statusLabel: '',
  lastError: '',
}

function statusLabelFor(resolvedLocale: string, status: HostDawConnectionState): string {
  if (status === 'connected') {
    return translateHost(resolvedLocale, 'general.connected')
  }
  if (status === 'disconnected') {
    return translateHost(resolvedLocale, 'general.disconnected')
  }
  return translateHost(resolvedLocale, 'general.unavailable')
}

type UseDawStatusPollingInput = {
  developerPresto: PrestoClient
  developerRuntime: PrestoRuntime
  preferences: { dawTarget: DawTarget }
  resolvedLocale: string
  initialSnapshot?: DawAdapterSnapshot | null
  initialConnectionStatus?: DawConnectionGetStatusResponse | null
}

export function useDawStatusPolling({
  developerPresto,
  developerRuntime,
  preferences,
  resolvedLocale,
  initialSnapshot = null,
  initialConnectionStatus = null,
}: UseDawStatusPollingInput) {
  const [checkingDawConnection, setCheckingDawConnection] = useState(false)
  const [dawRefreshKey, setDawRefreshKey] = useState(0)
  const [dawStatus, setDawStatus] = useState<HostDawStatusState>(() => {
    const initialStatus: HostDawConnectionState = initialConnectionStatus?.connected ? 'connected' : 'disconnected'
    return {
      status: initialStatus,
      targetLabel: dawLabel((initialConnectionStatus?.targetDaw ?? preferences.dawTarget) as DawTarget),
      sessionName: initialConnectionStatus?.connected ? (initialConnectionStatus.sessionName ?? '') : DEFAULT_DAW_STATUS.sessionName,
      statusLabel: statusLabelFor(resolvedLocale, initialStatus),
      lastError: DEFAULT_DAW_STATUS.lastError,
    }
  })
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
            statusLabel: statusLabelFor(resolvedLocale, current.status),
          }))
        }
        return
      }

      try {
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

        const status = await developerPresto.daw.connection.getStatus()
        const sessionName = status.sessionName ?? ''

        if (!cancelled) {
          const nextStatus: HostDawConnectionState = status.connected ? 'connected' : 'disconnected'
          setDawStatus({
            status: nextStatus,
            targetLabel: dawLabel((status.targetDaw ?? preferences.dawTarget) as DawTarget),
            sessionName,
            statusLabel: statusLabelFor(resolvedLocale, nextStatus),
            lastError: '',
          })
        }
      } catch (error) {
        if (!cancelled) {
          setDawStatus((current) => ({
            ...current,
            status: current.status,
            statusLabel: statusLabelFor(resolvedLocale, current.status),
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
