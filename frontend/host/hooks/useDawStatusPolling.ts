import { useEffect, useMemo, useRef, useState } from 'react'

import type { DawTarget, PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { DawAdapterSnapshot } from '@presto/sdk-runtime/clients/backend'
import { formatHostErrorMessage } from '../errorDisplay'
import { translateHost } from '../i18n'
import { dawLabel } from '../hostShellHelpers'

export type HostDawConnectionState = 'connected' | 'disconnected' | 'unknown'

const DAW_CONNECT_PROBE_TIMEOUT_SECONDS = 5

type HostDawStatusState = {
  status: HostDawConnectionState
  targetLabel: string
  sessionName: string
  statusLabel: string
  lastError: string
}

const UNKNOWN_DAW_STATUS: HostDawStatusState = {
  status: 'unknown',
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
}

export function useDawStatusPolling({
  developerPresto,
  developerRuntime,
  preferences,
  resolvedLocale,
  initialSnapshot = null,
}: UseDawStatusPollingInput) {
  const [checkingDawConnection, setCheckingDawConnection] = useState(true)
  const [dawRefreshKey, setDawRefreshKey] = useState(0)
  const pendingConnectionProbeRef = useRef(true)
  const [dawStatus, setDawStatus] = useState<HostDawStatusState>(() => ({
    ...UNKNOWN_DAW_STATUS,
    targetLabel: dawLabel(preferences.dawTarget),
    statusLabel: statusLabelFor(resolvedLocale, 'unknown'),
  }))
  const [liveDawAdapterSnapshot, setLiveDawAdapterSnapshot] = useState<DawAdapterSnapshot | null>(initialSnapshot)

  useEffect(() => {
    setLiveDawAdapterSnapshot(initialSnapshot)
  }, [initialSnapshot])

  useEffect(() => {
    pendingConnectionProbeRef.current = true
    setDawStatus((current) => ({
      ...current,
      targetLabel: dawLabel(preferences.dawTarget),
    }))
  }, [preferences.dawTarget])

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const refreshDawStatus = async ({ probeConnection }: { probeConnection: boolean }) => {
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
        if (probeConnection && typeof developerPresto.daw.connection.connect === 'function') {
          try {
            await developerPresto.daw.connection.connect({ timeoutSeconds: DAW_CONNECT_PROBE_TIMEOUT_SECONDS })
          } catch {
            // DAW connection probing is best-effort; the status read below owns the visible state.
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
            status: current.status,
            statusLabel: statusLabelFor(resolvedLocale, current.status),
            lastError: formatHostErrorMessage(error, 'Failed to read DAW connection status.'),
          }))
        }
      } finally {
        if (!cancelled) {
          setCheckingDawConnection(false)
          timeoutId = setTimeout(() => {
            void refreshDawStatus({ probeConnection: false })
          }, 5000)
        }
      }
    }

    const runInitialRefresh = async () => {
      const shouldProbeConnection = pendingConnectionProbeRef.current
      pendingConnectionProbeRef.current = false
      await refreshDawStatus({ probeConnection: shouldProbeConnection })
    }

    void runInitialRefresh()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [dawRefreshKey, developerPresto, developerRuntime?.backend, preferences.dawTarget, resolvedLocale])

  const triggerRefresh = useMemo(
    () => ({
      refresh: () => {
        pendingConnectionProbeRef.current = true
        setDawRefreshKey((current) => current + 1)
      },
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
