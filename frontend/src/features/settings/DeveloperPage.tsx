import { useEffect, useMemo, useState } from 'react'

import { ErrorNotice } from '../../components/feedback/ErrorNotice'
import { makeLocalFriendlyError, normalizeAppError, type FriendlyErrorView } from '../../errors/normalizeAppError'
import { useI18n } from '../../i18n'

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
  event?: string
  code?: string
  repeatCount?: number
}

type DeveloperPageProps = {
  onBackHome: () => void
  onBackSettings: () => void
}

export function DeveloperPage(props: DeveloperPageProps) {
  const { t } = useI18n()
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null)
  const [backendLogs, setBackendLogs] = useState<BackendLogEntry[]>([])
  const [backendError, setBackendError] = useState<FriendlyErrorView | null>(null)
  const [backendInfo, setBackendInfo] = useState<string | null>(null)
  const [portInput, setPortInput] = useState('8000')
  const [isUpdatingPort, setIsUpdatingPort] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isExportingLogs, setIsExportingLogs] = useState(false)
  const [testerInput, setTesterInput] = useState('')
  const [testerPreviewError, setTesterPreviewError] = useState<FriendlyErrorView | null>(null)
  const [testerValidationError, setTesterValidationError] = useState<FriendlyErrorView | null>(null)

  const testerSamples = useMemo(
    () => ({
      no_track_selected: {
        success: false,
        error_code: 'NO_TRACK_SELECTED',
        message: 'No track selected in Pro Tools. Select at least one track and retry.',
        friendly: {
          title: '未检测到已选中的轨道',
          message: '请先在 Pro Tools 选中至少一条轨道，再继续。',
          actions: ['切回 Pro Tools 选择轨道', '确认轨道可编辑', '返回 Presto 重试'],
          severity: 'warn',
          retryable: true,
        },
        details: { stage: 'stage_strip_silence' },
      },
      pt_version_unsupported: {
        success: false,
        error_code: 'PT_VERSION_UNSUPPORTED',
        message: 'Current Pro Tools/PTSL version 2024.6 is below required 2025.10.',
        friendly: {
          title: 'Pro Tools 版本不受支持',
          message: '当前版本低于所需最低版本，请升级后再试。',
          actions: ['升级 Pro Tools', '重启 Pro Tools 与 Presto', '重新执行当前流程'],
          severity: 'error',
          retryable: false,
        },
      },
      network_timeout: {
        name: 'Error',
        message: 'Request timed out after 30000ms: http://127.0.0.1:8001/api/v1/import/preflight',
      },
    }),
    [],
  )

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
      setBackendError(normalizeAppError(error))
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
      setBackendError(normalizeAppError(error))
    }
  }

  useEffect(() => {
    setTesterInput(JSON.stringify(testerSamples.no_track_selected, null, 2))
    setTesterPreviewError(normalizeAppError(testerSamples.no_track_selected))
  }, [testerSamples])

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

  const handleApplyPort = async () => {
    if (!window.electronAPI?.backend) {
      return
    }

    const parsed = Number(portInput)
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      setBackendError(
        makeLocalFriendlyError(t('developer.validation.portRange'), {
          actions: [t('developer.validation.portRange')],
        }),
      )
      return
    }

    setIsUpdatingPort(true)
    setBackendInfo(null)
    try {
      const result = await window.electronAPI.backend.updatePorts({ port: parsed })
      if (result.ok) {
        setBackendInfo(t('developer.info.portUpdated', { port: parsed }))
      }
      await refreshBackendStatus()
      await refreshBackendLogs()
      setBackendError(null)
    } catch (error) {
      setBackendError(normalizeAppError(error))
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
      setBackendInfo(t('developer.info.backendRestarted'))
      await refreshBackendStatus()
      await refreshBackendLogs()
      setBackendError(null)
    } catch (error) {
      setBackendError(normalizeAppError(error))
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
        setBackendInfo(t('developer.info.logsExported', { filePath: result.filePath }))
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(normalizeAppError(error))
    } finally {
      setIsExportingLogs(false)
    }
  }

  const loadTesterSample = (sample: unknown) => {
    setTesterInput(JSON.stringify(sample, null, 2))
    setTesterValidationError(null)
    setTesterPreviewError(normalizeAppError(sample))
  }

  const handleApplyTesterJson = () => {
    try {
      const parsed = JSON.parse(testerInput)
      setTesterValidationError(null)
      setTesterPreviewError(normalizeAppError(parsed))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTesterValidationError(
        makeLocalFriendlyError(t('developer.tester.invalidJson'), {
          code: 'TESTER_INVALID_JSON',
          userTitle: t('developer.tester.invalidJsonTitle'),
          technicalMessage: message,
          actions: [t('developer.tester.fixJson')],
        }),
      )
    }
  }

  const handleClearTester = () => {
    setTesterInput('')
    setTesterPreviewError(null)
    setTesterValidationError(null)
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t('developer.title')}</h1>
            <p className="text-sm text-gray-600">{t('developer.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={props.onBackSettings}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              {t('developer.backSettings')}
            </button>
            <button
              onClick={props.onBackHome}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              {t('developer.backHome')}
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t('developer.diagnostics.title')}</h2>
            <button
              onClick={() => {
                void refreshBackendStatus()
                void refreshBackendLogs()
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              {t('developer.refresh')}
            </button>
          </div>

          {!hasElectronBackend ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              {t('developer.bridgeUnavailable')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">{t('developer.mode')}</div>
                  <div className="font-medium text-gray-900">{backendStatus?.mode ?? t('developer.unknown')}</div>
                </div>
                <div>
                  <div className="text-gray-500">{t('developer.processStatus')}</div>
                  <div className="font-medium text-gray-900">{backendStatus?.status ?? t('developer.unknown')}</div>
                </div>
                <div>
                  <div className="text-gray-500">{t('developer.runtimePort')}</div>
                  <div className="font-medium text-gray-900">{backendStatus?.port ?? '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">{t('developer.pid')}</div>
                  <div className="font-medium text-gray-900">{backendStatus?.pid ?? '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">{t('developer.ready')}</div>
                  <div className={`font-medium ${backendStatus?.ready ? 'text-green-700' : 'text-red-700'}`}>
                    {backendStatus?.ready ? t('developer.yes') : t('developer.no')}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">{t('developer.restarts')}</div>
                  <div className="font-medium text-gray-900">{backendStatus?.restarts ?? 0}</div>
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t('developer.sharedPort')}</label>
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
                  {isUpdatingPort ? t('developer.applying') : t('developer.applyPort')}
                </button>
                <button
                  onClick={() => void handleRestartBackend()}
                  disabled={isRestarting}
                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isRestarting ? t('developer.restarting') : t('developer.restartBackend')}
                </button>
                <button
                  onClick={() => void handleExportLogs()}
                  disabled={isExportingLogs}
                  className="px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
                >
                  {isExportingLogs ? t('developer.exporting') : t('developer.exportLogs')}
                </button>
              </div>

              <ErrorNotice error={backendError} />

              {backendInfo ? (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{backendInfo}</div>
              ) : null}

              {backendStatus?.warnings && backendStatus.warnings.length > 0 ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <div className="font-medium mb-1">{t('developer.warnings')}</div>
                  <div className="max-h-24 overflow-auto space-y-1">
                    {backendStatus.warnings.slice(0, 5).map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="border border-gray-200 rounded-md p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{t('developer.tester.title')}</div>
                  <div className="text-xs text-gray-600">{t('developer.tester.desc')}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => loadTesterSample(testerSamples.no_track_selected)}
                    className="px-2.5 py-1.5 text-xs bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    {t('developer.tester.sample.noTrack')}
                  </button>
                  <button
                    onClick={() => loadTesterSample(testerSamples.pt_version_unsupported)}
                    className="px-2.5 py-1.5 text-xs bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    {t('developer.tester.sample.version')}
                  </button>
                  <button
                    onClick={() => loadTesterSample(testerSamples.network_timeout)}
                    className="px-2.5 py-1.5 text-xs bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                  >
                    {t('developer.tester.sample.network')}
                  </button>
                </div>

                <textarea
                  value={testerInput}
                  onChange={(event) => setTesterInput(event.target.value)}
                  className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 text-xs font-mono text-gray-800"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleApplyTesterJson}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    {t('developer.tester.applyJson')}
                  </button>
                  <button
                    onClick={handleClearTester}
                    className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-md hover:bg-gray-100"
                  >
                    {t('developer.tester.clear')}
                  </button>
                </div>

                <ErrorNotice error={testerValidationError} />
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('developer.tester.preview')}</div>
                  <ErrorNotice error={testerPreviewError} />
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-2">
                  {t('developer.logsTitle', { count: backendStatus?.logsCount ?? backendLogs.length })}
                </div>
                <div className="h-56 overflow-auto rounded-md border border-gray-200 bg-gray-950 text-gray-100 font-mono text-xs p-3 space-y-1">
                  {backendLogs.length === 0 ? (
                    <div className="text-gray-400">{t('developer.noLogs')}</div>
                  ) : (
                    backendLogs.map((entry) => (
                      <div key={entry.id}>
                        [{entry.timestamp}] [{entry.level}] [{entry.source}] {entry.message}
                        {entry.repeatCount && entry.repeatCount > 1 ? ` (x${entry.repeatCount})` : ''}
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
  )
}
