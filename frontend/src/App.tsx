import { useEffect, useMemo, useState } from 'react'

import { Track2DoExportWorkflow } from './features/export/Track2DoExportWorkflow'
import { ImportWorkflow } from './features/import/ImportWorkflow'

type View = 'home' | 'import' | 'export'

type BackendStatus = {
  running: boolean
  ready: boolean
  mode: 'import' | 'export'
  pid: number | null
  requestedPort: number
  port: number
  status: string
  heartbeatFailures: number
  restarts: number
  lastError: string | null
  warnings: string[]
  logsCount: number
}

type BackendLogEntry = {
  id: number
  timestamp: string
  source: string
  level: string
  message: string
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null)
  const [backendLogs, setBackendLogs] = useState<BackendLogEntry[]>([])
  const [backendError, setBackendError] = useState<string | null>(null)
  const [backendInfo, setBackendInfo] = useState<string | null>(null)
  const [portInput, setPortInput] = useState('8000')
  const [isUpdatingPort, setIsUpdatingPort] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isExportingLogs, setIsExportingLogs] = useState(false)

  const hasElectronBackend = useMemo(() => {
    return typeof window !== 'undefined' && Boolean(window.electronAPI?.backend)
  }, [])

  const refreshBackendStatus = async () => {
    if (!hasElectronBackend || !window.electronAPI?.backend) {
      return
    }

    try {
      const status = await window.electronAPI.backend.getStatus()
      setBackendStatus(status)
      setPortInput(String(status.requestedPort || status.port || 8000))
      setBackendError(null)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    }
  }

  const refreshBackendLogs = async () => {
    if (!hasElectronBackend || !window.electronAPI?.backend) {
      return
    }

    try {
      const logs = await window.electronAPI.backend.getLogs(300)
      setBackendLogs(logs)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    }
  }

  const activateModeForView = async (targetView: View) => {
    if (!window.electronAPI?.backend) {
      return
    }
    if (targetView !== 'import' && targetView !== 'export') {
      return
    }

    try {
      await window.electronAPI.backend.activateMode(targetView)
      await refreshBackendStatus()
      setBackendError(null)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    if (!hasElectronBackend) {
      return
    }

    void refreshBackendStatus()
    void refreshBackendLogs()

    const statusTimer = setInterval(() => {
      void refreshBackendStatus()
    }, 2000)

    const logsTimer = setInterval(() => {
      void refreshBackendLogs()
    }, 1500)

    return () => {
      clearInterval(statusTimer)
      clearInterval(logsTimer)
    }
  }, [hasElectronBackend])

  useEffect(() => {
    if (!hasElectronBackend) {
      return
    }
    void activateModeForView(view)
  }, [view, hasElectronBackend])

  const handleApplyPort = async () => {
    if (!window.electronAPI?.backend) {
      return
    }

    const parsed = Number(portInput)
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      setBackendError('Port must be an integer between 1 and 65535.')
      return
    }

    setIsUpdatingPort(true)
    setBackendInfo(null)

    try {
      const result = await window.electronAPI.backend.updatePorts({ port: parsed })
      if (result.ok) {
        setBackendInfo(`Backend port updated to ${parsed}.`)
      }
      await refreshBackendStatus()
      await refreshBackendLogs()
      setBackendError(null)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsUpdatingPort(false)
    }
  }

  const handleRestartBackend = async () => {
    if (!window.electronAPI?.backend) {
      return
    }

    setIsRestarting(true)
    setBackendInfo(null)

    try {
      await window.electronAPI.backend.restart()
      setBackendInfo('Backend restarted.')
      await refreshBackendStatus()
      await refreshBackendLogs()
      setBackendError(null)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRestarting(false)
    }
  }

  const handleExportLogs = async () => {
    if (!window.electronAPI?.backend) {
      return
    }

    setIsExportingLogs(true)
    setBackendInfo(null)

    try {
      const result = await window.electronAPI.backend.exportLogs()
      if (result.ok) {
        setBackendInfo(`Logs exported: ${result.filePath}`)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsExportingLogs(false)
    }
  }

  return (
    <div className="h-screen w-screen bg-gray-100 relative overflow-hidden">
      {view === 'home' ? (
        <div className="h-full overflow-auto px-6 py-10">
          <div className="max-w-6xl mx-auto space-y-5">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-1">Presto</h1>
              <p className="text-sm text-gray-600 mb-6">Choose a workflow.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Import</h2>
                <button
                  onClick={() => setView('import')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Open Import
                </button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Export</h2>
                <button
                  onClick={() => setView('export')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Open Export
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Backend Diagnostics</h2>
                <button
                  onClick={() => {
                    void refreshBackendStatus()
                    void refreshBackendLogs()
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Refresh
                </button>
              </div>

              {!hasElectronBackend ? (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                  Electron backend bridge is unavailable in this environment.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Mode</div>
                      <div className="font-medium text-gray-900">{backendStatus?.mode ?? 'unknown'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Process Status</div>
                      <div className="font-medium text-gray-900">{backendStatus?.status ?? 'unknown'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Runtime Port</div>
                      <div className="font-medium text-gray-900">{backendStatus?.port ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">PID</div>
                      <div className="font-medium text-gray-900">{backendStatus?.pid ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Ready</div>
                      <div className={`font-medium ${backendStatus?.ready ? 'text-green-700' : 'text-red-700'}`}>
                        {backendStatus?.ready ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Restarts</div>
                      <div className="font-medium text-gray-900">{backendStatus?.restarts ?? 0}</div>
                    </div>
                  </div>

                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Shared Port</label>
                      <input
                        type="number"
                        value={portInput}
                        onChange={(event) => setPortInput(event.target.value)}
                        className="w-36 px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <button
                      onClick={() => void handleApplyPort()}
                      disabled={isUpdatingPort}
                      className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isUpdatingPort ? 'Applying...' : 'Apply Port'}
                    </button>
                    <button
                      onClick={() => void handleRestartBackend()}
                      disabled={isRestarting}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isRestarting ? 'Restarting...' : 'Restart Backend'}
                    </button>
                    <button
                      onClick={() => void handleExportLogs()}
                      disabled={isExportingLogs}
                      className="px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                    >
                      {isExportingLogs ? 'Exporting...' : 'Export Logs'}
                    </button>
                  </div>

                  {backendError ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{backendError}</div>
                  ) : null}

                  {backendInfo ? (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{backendInfo}</div>
                  ) : null}

                  {backendStatus?.warnings && backendStatus.warnings.length > 0 ? (
                    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
                      <div className="font-medium mb-1">Warnings</div>
                      <div className="max-h-24 overflow-auto space-y-1">
                        {backendStatus.warnings.slice(0, 5).map((warning) => (
                          <div key={warning}>{warning}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-sm text-gray-600 mb-2">Unified Runtime Logs ({backendStatus?.logsCount ?? backendLogs.length})</div>
                    <div className="h-56 overflow-auto rounded-md border border-gray-200 bg-gray-950 text-gray-100 font-mono text-xs p-3 space-y-1">
                      {backendLogs.length === 0 ? (
                        <div className="text-gray-400">No logs yet.</div>
                      ) : (
                        backendLogs.map((entry) => (
                          <div key={entry.id}>
                            [{entry.timestamp}] [{entry.level}] [{entry.source}] {entry.message}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {view === 'import' ? (
        <ImportWorkflow onBackHome={() => setView('home')} />
      ) : null}

      {view === 'export' ? (
        <Track2DoExportWorkflow onBackHome={() => setView('home')} />
      ) : null}
    </div>
  )
}
