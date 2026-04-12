import React from './react-shared.mjs'

import {
  applyPatchToSelectedRows,
  basenameOf,
  buildRunValidation,
  createCategoryColorSlotMap,
  createDefaultImportWorkflowSettings,
  finalizeRowsForImport,
  isTerminalJobState,
  loadImportWorkflowSettings,
  normalizeTrackName,
  runAiAnalyzeInPlugin,
  saveImportWorkflowSettings,
  stemOf,
  toDisplayName,
} from './workflowCore.mjs'
import {
  InlineError,
  StatusPill,
  WorkflowActionBar,
  WorkflowButton,
  WorkflowCard,
  WorkflowSelect,
  WorkflowStepper,
} from './ui.mjs'
import { formatImport, tImport } from './i18n.mjs'

const h = React.createElement
const IMPORT_WORKFLOW_ID = 'official.import-workflow.run'
const WORKFLOW_STEP_KEYS = ['page.step.analyze', 'page.step.strip', 'page.step.run']
const PREPARED_FILE_COLUMNS = [
  { id: 'file', labelKey: 'page.column.file', defaultWidth: 300 },
  { id: 'category', labelKey: 'page.column.category', defaultWidth: 180 },
  { id: 'aiName', labelKey: 'page.column.aiName', defaultWidth: 180 },
  { id: 'finalName', labelKey: 'page.column.finalName', defaultWidth: 220 },
  { id: 'status', labelKey: 'page.column.status', defaultWidth: 150 },
]
const RUN_STAGE_LABEL_KEYS = {
  idle: 'page.stage.idle',
  import: 'page.stage.import',
  rename: 'page.stage.rename',
  color: 'page.stage.color',
  strip: 'page.stage.strip',
  fade: 'page.stage.fade',
  save: 'page.stage.save',
  completed: 'page.stage.completed',
  failed: 'page.stage.failed',
  cancelled: 'page.stage.cancelled',
}

function nowIso() {
  return new Date().toISOString()
}

function toErrorMessage(error, fallbackMessage = 'Unexpected import workflow error.') {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim()
    }
    if ('error' in error) {
      const nestedMessage = toErrorMessage(error.error, '')
      if (nestedMessage) {
        return nestedMessage
      }
    }
    if ('cause' in error) {
      const nestedMessage = toErrorMessage(error.cause, '')
      if (nestedMessage) {
        return nestedMessage
      }
    }
  }
  return fallbackMessage
}

function shouldIgnoreRowSelection(target) {
  return Boolean(
    target &&
      typeof target.closest === 'function' &&
      target.closest('input, textarea, select, button, a, [contenteditable="true"]'),
  )
}

function computeNextRowSelection({
  orderedPaths,
  prevSelected,
  prevAnchor,
  clickedPath,
  metaKey,
  ctrlKey,
  shiftKey,
}) {
  const clickedIndex = orderedPaths.indexOf(clickedPath)
  if (clickedIndex < 0) {
    return {
      selected: prevSelected,
      anchor: prevAnchor,
    }
  }

  const isToggleKey = metaKey || ctrlKey
  if (shiftKey) {
    const anchorPath = prevAnchor && orderedPaths.includes(prevAnchor) ? prevAnchor : clickedPath
    const anchorIndex = orderedPaths.indexOf(anchorPath)
    const start = Math.min(anchorIndex, clickedIndex)
    const end = Math.max(anchorIndex, clickedIndex)
    const rangeSet = new Set(orderedPaths.slice(start, end + 1))
    if (isToggleKey) {
      const merged = new Set(prevSelected)
      rangeSet.forEach((path) => merged.add(path))
      return { selected: merged, anchor: anchorPath }
    }
    return { selected: rangeSet, anchor: anchorPath }
  }

  if (isToggleKey) {
    const next = new Set(prevSelected)
    if (next.has(clickedPath)) {
      next.delete(clickedPath)
    } else {
      next.add(clickedPath)
    }
    return { selected: next, anchor: clickedPath }
  }

  if (prevSelected.size === 1 && prevSelected.has(clickedPath)) {
    return { selected: new Set(), anchor: null }
  }

  return { selected: new Set([clickedPath]), anchor: clickedPath }
}

function tintFromHex(hex, alpha = 0.1) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
    return `rgba(88, 96, 100, ${alpha})`
  }
  const raw = hex.slice(1)
  const normalized = raw.length === 3
    ? raw.split('').map((chunk) => chunk + chunk).join('')
    : raw.length >= 6
      ? raw.slice(0, 6)
      : null
  if (!normalized) {
    return `rgba(88, 96, 100, ${alpha})`
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return `rgba(88, 96, 100, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function sortRowsForDisplay(rows, categories) {
  const order = new Map(categories.map((category, index) => [category.id, index]))
  return [...rows].sort((left, right) => {
    const leftOrder = order.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return basenameOf(left.filePath).localeCompare(basenameOf(right.filePath), undefined, { sensitivity: 'base' })
  })
}

function statSummary(rows) {
  return {
    pending: rows.filter((row) => row.status === 'pending').length,
    ready: rows.filter((row) => row.status === 'ready').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    skipped: rows.filter((row) => row.status === 'skipped').length,
  }
}

function updateSingleRow(rows, filePath, patch) {
  return rows.map((row) => (row.filePath === filePath ? { ...row, ...patch } : row))
}

function restoreFallbackRows(rows) {
  return rows.map((row) => {
    const fallback = toDisplayName(stemOf(row.filePath))
    return {
      ...row,
      aiName: fallback,
      finalName: row.finalName && row.finalName.trim() ? row.finalName : fallback,
      status: 'ready',
      errorMessage: null,
    }
  })
}

function progressPercent(current, total) {
  if (!total || total <= 0) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}

function formatMessage(template, replacements = {}) {
  if (typeof template !== 'string') {
    return ''
  }
  return Object.entries(replacements).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template)
}

function buildRunStageKeys({ executionRows, categoryColorSlotById, stripAfterImport, fadeAfterStrip, autoSaveSession }) {
  const stageKeys = ['import']
  const needsRename = executionRows.some((row) => normalizeTrackName(stemOf(row.filePath)) !== normalizeTrackName(row.finalName || ''))
  const needsColor = executionRows.some((row) => Number.isInteger(categoryColorSlotById?.[row.categoryId]))
  if (needsRename) {
    stageKeys.push('rename')
  }
  if (needsColor) {
    stageKeys.push('color')
  }
  if (stripAfterImport && executionRows.length > 0) {
    stageKeys.push('strip')
  }
  if (stripAfterImport && fadeAfterStrip && executionRows.length > 0) {
    stageKeys.push('fade')
  }
  if (autoSaveSession) {
    stageKeys.push('save')
  }
  return stageKeys
}

function resolveStagePosition(stageKeys, stageKey) {
  if (!Array.isArray(stageKeys) || stageKeys.length === 0) {
    return { current: 0, total: 0 }
  }
  if (stageKey === 'completed') {
    return { current: stageKeys.length, total: stageKeys.length }
  }
  const index = stageKeys.indexOf(stageKey)
  return {
    current: index >= 0 ? index + 1 : 1,
    total: stageKeys.length,
  }
}

function overallRunPercent({ stageKeys, stageKey, current, total, percent }) {
  if (stageKey === 'completed') {
    return 100
  }
  if (!Array.isArray(stageKeys) || stageKeys.length === 0) {
    return Math.max(0, Math.min(100, Number(percent ?? 0)))
  }
  const stageIndex = stageKeys.indexOf(stageKey)
  const safeStageIndex = stageIndex >= 0 ? stageIndex : 0
  const itemFraction = total > 0
    ? Math.max(0, Math.min(1, current / total))
    : Math.max(0, Math.min(1, Number(percent ?? 0) / 100))
  return Math.max(0, Math.min(100, Math.round(((safeStageIndex + itemFraction) / stageKeys.length) * 100)))
}

function resolveRunStageKey(stageKeys, phase) {
  if (!Array.isArray(stageKeys) || stageKeys.length === 0) {
    return 'idle'
  }
  return stageKeys.includes(phase) ? phase : 'import'
}

export function ImportWorkflowPage({ context, host }) {
  const [settings, setSettings] = React.useState(() => createDefaultImportWorkflowSettings())
  const [rows, setRows] = React.useState([])
  const [sourceFolders, setSourceFolders] = React.useState([])
  const [step, setStep] = React.useState(1)
  const [busy, setBusy] = React.useState(true)
  const [, setBanner] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [selectedPaths, setSelectedPaths] = React.useState(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = React.useState(null)
  const [stripOpened, setStripOpened] = React.useState(false)
  const [stripReady, setStripReady] = React.useState(false)
  const [runState, setRunState] = React.useState({
    phase: 'idle',
    stageKey: 'idle',
    stageKeys: [],
    jobId: '',
    current: 0,
    total: 0,
    percent: 0,
    message: '',
  })

  const pollTimerRef = React.useRef(null)

  const categories = settings.categories
  const stats = React.useMemo(() => statSummary(rows), [rows])
  const sortedRows = React.useMemo(() => sortRowsForDisplay(rows, categories), [rows, categories])
  const categoryMap = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const categoryColorSlotById = React.useMemo(() => createCategoryColorSlotMap(categories), [categories])
  const readyRows = React.useMemo(() => sortedRows.filter((row) => row.status === 'ready'), [sortedRows])
  const failedRows = React.useMemo(() => sortedRows.filter((row) => row.status === 'failed'), [sortedRows])
  const validationIssues = React.useMemo(() => buildRunValidation(readyRows), [readyRows])

  const appendLog = React.useCallback(
    (message, level = 'info') => {
      const line = `${nowIso()} ${message}`
      try {
        if (level === 'error') {
          context.logger.error(line)
        } else if (level === 'warn') {
          context.logger.warn(line)
        } else {
          context.logger.info(line)
        }
      } catch {
        // Keep UI stable when plugin logger is unavailable.
      }
    },
    [context.logger],
  )

  const persistCache = React.useCallback(
    (nextRows) => {
      if (!settings.ui.analyzeCacheEnabled || sourceFolders.length === 0) {
        return
      }
      void context.presto.import.cache.save({
        sourceFolders,
        rows: nextRows,
      }).catch((error) => {
        appendLog(`Analyze cache write failed: ${toErrorMessage(error)}`, 'warn')
      })
    },
    [appendLog, context.presto.import.cache, settings.ui.analyzeCacheEnabled, sourceFolders],
  )

  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const loadedSettings = await loadImportWorkflowSettings(context.storage)
        if (cancelled) {
          return
        }
        setSettings(loadedSettings)
        setErrorMessage('')
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setBusy(false)
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [context.storage])

  React.useEffect(() => {
    const allowedPaths = new Set(sortedRows.map((row) => row.filePath))
    setSelectedPaths((previous) => {
      if (previous.size === 0) {
        return previous
      }
      const next = new Set()
      previous.forEach((filePath) => {
        if (allowedPaths.has(filePath)) {
          next.add(filePath)
        }
      })
      return next.size === previous.size ? previous : next
    })
    setSelectionAnchor((previous) => (previous && allowedPaths.has(previous) ? previous : null))
  }, [sortedRows])

  const replaceRows = React.useCallback(
    (updater, persist = false) => {
      setRows((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        if (persist) {
          persistCache(next)
        }
        return next
      })
    },
    [persistCache],
  )

  const analyzeSourceFolders = React.useCallback(
    async (nextSourceFolders) => {
      if (!Array.isArray(nextSourceFolders) || nextSourceFolders.length === 0) {
        setErrorMessage(tImport(context, 'page.error.import.noSource'))
        return
      }

      setBusy(true)
      setErrorMessage('')
      try {
        const response = await context.presto.import.analyze({
          sourceFolders: nextSourceFolders,
          categories: settings.categories.map((category) => ({ id: category.id, name: category.name })),
          analyzeCacheEnabled: settings.ui.analyzeCacheEnabled,
        })
        const analyzedFolders = Array.isArray(response?.folderPaths) ? response.folderPaths : nextSourceFolders
        const orderedFilePaths = Array.isArray(response?.orderedFilePaths) ? response.orderedFilePaths : []
        const analyzedRows = Array.isArray(response?.rows) ? response.rows : []
        const cacheStats = response?.cache ?? { files: 0, hits: 0 }
        replaceRows(analyzedRows, false)
        setSourceFolders(analyzedFolders)
        setSelectedPaths(new Set())
        setSelectionAnchor(null)
        setStep(1)
        setStripOpened(false)
        setStripReady(false)
        setRunState({
          phase: 'idle',
          stageKey: 'idle',
          stageKeys: [],
          jobId: '',
          current: 0,
          total: 0,
          percent: 0,
          message: '',
        })

        const cacheSuffix =
          cacheStats.hits > 0
            ? formatImport(context, 'page.banner.cache.hits', { count: cacheStats.hits })
            : cacheStats.files > 0
              ? tImport(context, 'page.banner.cache.foundNone')
              : ''
        const preparedMessage = formatImport(context, 'page.banner.prepared', { count: orderedFilePaths.length })
        setBanner(`${preparedMessage}${cacheSuffix}`)
        appendLog(`Prepared ${orderedFilePaths.length} row(s).`)
        setBanner(
          formatImport(context, 'page.banner.scanned', {
            folders: analyzedFolders.length,
            files: orderedFilePaths.length,
          }),
        )
        appendLog(`Scanned folder: ${analyzedFolders.join(', ')}`)
      } catch (error) {
        setErrorMessage(toErrorMessage(error))
      } finally {
        setBusy(false)
      }
    },
    [appendLog, context, replaceRows, settings.categories, settings.ui.analyzeCacheEnabled],
  )

  const onBrowseFolders = React.useCallback(async () => {
    if (!host || typeof host.pickFolder !== 'function') {
      return
    }

    setErrorMessage('')
    const selection = await host.pickFolder()
    if (selection?.canceled) {
      setBanner(tImport(context, 'page.banner.folderCancelled'))
      return
    }

    const nextSourceFolders = Array.isArray(selection?.paths) ? selection.paths.filter((value) => String(value ?? '').trim()) : []
    if (nextSourceFolders.length === 0) {
      return
    }

    await analyzeSourceFolders(nextSourceFolders)
  }, [analyzeSourceFolders, context, host])

  const onAnalyze = React.useCallback(async () => {
    if (rows.length === 0) {
      setErrorMessage(tImport(context, 'page.error.analyze.noRows'))
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      const result = await runAiAnalyzeInPlugin({
        rows,
        categories: settings.categories,
        aiConfig: settings.aiConfig,
      })
      replaceRows(result.rows, true)
      const readyCount = result.rows.filter((row) => row.status === 'ready').length
      const analyzeFailedMessage = tImport(context, 'page.banner.analyze.failed')
      const fallbackHint = readyRows.length > 0 ? ` ${tImport(context, 'page.banner.analyze.fallbackHint')}` : ''
      setBanner(
        result.errorMessage
          ? `${analyzeFailedMessage}${fallbackHint}`
          : formatImport(context, 'page.banner.analyze.complete', { count: readyCount }),
      )
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage)
        appendLog(`AI analyze failed: ${result.errorMessage}`, 'warn')
      } else {
        appendLog('AI analyze completed.')
      }
    } catch (error) {
      const message = toErrorMessage(error)
      setErrorMessage(message)
      appendLog(`AI analyze failed: ${message}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [appendLog, readyRows.length, replaceRows, rows, settings.aiConfig, settings.categories])

  const onRestoreFallback = React.useCallback(() => {
    replaceRows((previous) => restoreFallbackRows(previous), true)
    setBanner(tImport(context, 'page.banner.fallbackRestored'))
    setErrorMessage('')
  }, [replaceRows])

  const clearWorkflow = React.useCallback(() => {
    setRows([])
    setSourceFolders([])
    setSelectedPaths(new Set())
    setSelectionAnchor(null)
    setStep(1)
    setStripOpened(false)
    setStripReady(false)
    setRunState({
      phase: 'idle',
      jobId: '',
      current: 0,
      total: 0,
      percent: 0,
      message: '',
    })
    setBanner(tImport(context, 'page.banner.draftCleared'))
    setErrorMessage('')
  }, [])

  const updateRowCategory = React.useCallback(
    (filePath, categoryId) => {
      if (!categoryId) {
        return
      }
      if (selectedPaths.size > 1 && selectedPaths.has(filePath)) {
        replaceRows(
          (previous) =>
            applyPatchToSelectedRows({
              rows: previous,
              selectedPaths,
              patch: { categoryId },
            }),
          true,
        )
        return
      }
      replaceRows((previous) => updateSingleRow(previous, filePath, { categoryId }), true)
    },
    [replaceRows, selectedPaths],
  )

  const updateRowFinalName = React.useCallback(
    (filePath, finalName) => {
      replaceRows((previous) => updateSingleRow(previous, filePath, { finalName }), true)
    },
    [replaceRows],
  )

  const toggleRowSelection = React.useCallback(
    (filePath, event) => {
      const orderedPaths = sortedRows.map((row) => row.filePath)
      const result = computeNextRowSelection({
        orderedPaths,
        prevSelected: selectedPaths,
        prevAnchor: selectionAnchor,
        clickedPath: filePath,
        metaKey: Boolean(event?.metaKey),
        ctrlKey: Boolean(event?.ctrlKey),
        shiftKey: Boolean(event?.shiftKey),
      })
      setSelectedPaths(result.selected)
      setSelectionAnchor(result.anchor)
    },
    [selectedPaths, selectionAnchor, sortedRows],
  )

  const openStripSilence = React.useCallback(async () => {
    setBusy(true)
    setErrorMessage('')
    try {
      await context.presto.stripSilence.open()
      setStripOpened(true)
      setBanner(tImport(context, 'page.banner.stripOpened'))
      appendLog('Strip Silence opened.')
    } catch (error) {
      const message = toErrorMessage(error)
      setErrorMessage(message)
      appendLog(`Strip Silence open failed: ${message}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [appendLog, context.presto.stripSilence])

  const pollJob = React.useCallback(
    async (jobId, executionRows, stageKeys) => {
      try {
        const job = await context.presto.jobs.get(jobId)
        const progress = job.progress || { current: 0, total: 0, percent: 0, phase: '', message: '' }
        const stageKey = resolveRunStageKey(stageKeys, progress.phase)
        setRunState({
          phase: 'backend',
          stageKey,
          stageKeys,
          jobId,
          current: progress.current ?? 0,
          total: progress.total ?? 0,
          percent: Number(progress.percent ?? 0),
          message: progress.message || progress.phase || 'Importing files',
        })

        if (!isTerminalJobState(job.state)) {
          pollTimerRef.current = setTimeout(() => {
            void pollJob(jobId, executionRows, stageKeys)
          }, 1000)
          return
        }

        if (job.state === 'succeeded') {
          const completedMessage = tImport(context, 'page.state.importCompleted')
          setRunState({
            phase: 'completed',
            stageKey: 'completed',
            stageKeys,
            jobId,
            current: stageKeys.length,
            total: stageKeys.length,
            percent: 100,
            message: completedMessage,
          })
          setBanner(tImport(context, 'page.banner.importCompleted'))
          appendLog('Import workflow completed.')
          return
        }

        setRunState({
          phase: job.state,
          stageKey: job.state,
          stageKeys,
          jobId,
          current: progress.current ?? 0,
          total: progress.total ?? 0,
          percent: Number(progress.percent ?? 0),
          message: job.error?.message || `Import job ended with state ${job.state}.`,
        })
        setErrorMessage(job.error?.message || `Import job ended with state ${job.state}.`)
      } catch (error) {
        const message = toErrorMessage(error)
        setRunState({
          phase: 'failed',
          stageKey: 'failed',
          stageKeys,
          jobId,
          current: 0,
          total: 0,
          percent: 0,
          message,
        })
        setErrorMessage(message)
      }
    },
    [appendLog, context, context.presto.jobs],
  )

  const startImportRun = React.useCallback(async () => {
    if (sourceFolders.length === 0) {
      setErrorMessage(tImport(context, 'page.error.import.noSource'))
      return
    }
    if (readyRows.length === 0) {
      setErrorMessage(tImport(context, 'page.error.import.noReadyRows'))
      return
    }
    if (validationIssues.length > 0) {
      setErrorMessage(
        formatImport(context, 'page.error.import.validationIssues', {
          issues: validationIssues.join(', '),
        }),
      )
      return
    }

    setBusy(true)
    setErrorMessage('')
    try {
      const existingTrackNames = await context.presto.track.listNames()
      const finalized = finalizeRowsForImport({
        rows: sortedRows,
        categories: settings.categories,
        existingTrackNames: Array.isArray(existingTrackNames?.names) ? existingTrackNames.names : [],
      })
      replaceRows(finalized.rows, true)
      const orderedFilePaths = finalized.executionRows.map((row) => row.filePath)
      const stageKeys = buildRunStageKeys({
        executionRows: finalized.executionRows,
        categoryColorSlotById,
        stripAfterImport: settings.ui.stripAfterImport,
        fadeAfterStrip: settings.ui.fadeAfterStrip,
        autoSaveSession: settings.ui.autoSaveSession,
      })
      const response = await context.presto.workflow.run.start({
        pluginId: context.pluginId,
        workflowId: IMPORT_WORKFLOW_ID,
        input: {
          sourceFolders,
          orderedFilePaths,
          rows: finalized.executionRows,
          categories: settings.categories,
          silenceProfile: settings.silenceProfile,
          ui: settings.ui,
        },
      })
      const queuedMessage = tImport(context, 'page.state.importQueued')
      setRunState({
        phase: 'backend',
        stageKey: 'import',
        stageKeys,
        jobId: response.jobId,
        current: 0,
        total: orderedFilePaths.length,
        percent: 0,
        message: queuedMessage,
      })
      setBanner(
        formatImport(context, 'page.banner.importStarted', {
          count: orderedFilePaths.length,
        }),
      )
      appendLog(`Import job started: ${response.jobId}`)
      await pollJob(response.jobId, finalized.executionRows, stageKeys)
    } catch (error) {
      const message = toErrorMessage(error)
      setErrorMessage(message)
      setRunState({
        phase: 'failed',
        stageKey: 'failed',
        stageKeys: [],
        jobId: '',
        current: 0,
        total: 0,
        percent: 0,
        message,
      })
      appendLog(`Import start failed: ${message}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [appendLog, categoryColorSlotById, context.presto.track, context.presto.workflow.run, pollJob, readyRows.length, replaceRows, settings.categories, settings.silenceProfile, settings.ui, sortedRows, sourceFolders, validationIssues])

  const cancelRun = React.useCallback(async () => {
    if (!runState.jobId || runState.phase !== 'backend') {
      return
    }
    setBusy(true)
    setErrorMessage('')
    try {
      await context.presto.jobs.cancel(runState.jobId)
      const cancelStateMessage = tImport(context, 'page.state.cancelRequested')
      setRunState((previous) => ({
        ...previous,
        phase: 'cancelled',
        stageKey: 'cancelled',
        message: cancelStateMessage,
      }))
      setBanner(tImport(context, 'page.banner.cancelRequested'))
      appendLog(`Cancel requested for ${runState.jobId}`)
    } catch (error) {
      const message = toErrorMessage(error)
      setErrorMessage(message)
      appendLog(`Cancel failed: ${message}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [appendLog, context.presto.jobs, runState.jobId, runState.phase])

  const canGoNext = step === 1
    ? sourceFolders.length > 0 && readyRows.length > 0 && validationIssues.length === 0
    : step === 2
      ? !settings.ui.stripAfterImport || stripReady
      : false

  const progressLabel = runState.message || tImport(context, 'page.progress.idle')
  const progressValue = overallRunPercent(runState)
  const progressStage = resolveStagePosition(runState.stageKeys, runState.stageKey)
  const runStageLabel = tImport(context, RUN_STAGE_LABEL_KEYS[runState.stageKey] || 'page.stage.idle')
  const progressStageLabel = progressStage.total > 0
    ? `${progressStage.current}/${progressStage.total} · ${runStageLabel}`
    : `0/0 · ${runStageLabel}`
  const nextStepLabel = step === 1
    ? tImport(context, 'page.next.strip')
    : step === 2
      ? tImport(context, 'page.next.run')
      : ''

  const renderPreparedFileCell = (column, row) => {
    const columnId = column.id
    const width = column.defaultWidth
    const cellProps = { className: 'iw-table-cell', style: { width: `${width}px` } }

    if (columnId === 'file') {
      return h(
        'td',
        { className: 'iw-table-cell iw-table-cell--file', style: { width: `${width}px` } },
        h('div', { className: 'iw-file-name iw-table-static', title: basenameOf(row.filePath) }, basenameOf(row.filePath)),
        h('div', { className: 'iw-file-path iw-table-static', title: row.filePath }, row.filePath),
      )
    }

    if (columnId === 'category') {
      return h(
        'td',
        cellProps,
        h(WorkflowSelect, {
          className: 'iw-table-select',
          'aria-label': tImport(context, 'page.column.category'),
          value: row.categoryId,
          options: categories.map((option) => ({ value: option.id, label: option.name })),
          onChange: (event) => updateRowCategory(row.filePath, event.target.value),
        }),
      )
    }

    if (columnId === 'aiName') {
      return h(
        'td',
        { className: 'iw-table-cell iw-table-static iw-table-cell--ellipsis', style: { width: `${width}px` }, title: row.aiName },
        row.aiName,
      )
    }

    if (columnId === 'finalName') {
      return h(
        'td',
        cellProps,
        h('input', {
          className: 'iw-input',
          value: row.finalName,
          onChange: (event) => updateRowFinalName(row.filePath, event.target.value),
        }),
      )
    }

    return h(
      'td',
      cellProps,
      h(StatusPill, { status: row.status }),
      row.errorMessage
        ? h('div', { className: 'iw-cell-help iw-table-static', title: row.errorMessage }, row.errorMessage)
        : null,
    )
  }

  const preparedFilesActions = h(
    'div',
    { className: 'iw-table-actions' },
    h('div', { className: 'iw-source-summary' }, [
      h('span', { key: 'label', className: 'iw-source-label' }, tImport(context, 'page.label.sourceFolders')),
      sourceFolders.length > 0
        ? h(
            'div',
            { key: 'folders', className: 'iw-source-folder-list' },
            sourceFolders.map((folderPath) =>
              h('div', { key: folderPath, className: 'iw-source-folder-pill', title: folderPath }, folderPath),
            ),
          )
        : h('p', { key: 'empty', className: 'iw-source-empty' }, tImport(context, 'page.empty.sourceFolders')),
    ]),
    h(
      WorkflowButton,
      {
        type: 'button',
        variant: 'secondary',
        disabled: busy,
        small: true,
        onClick: () => {
          void onBrowseFolders()
        },
      },
      tImport(context, 'page.button.browse'),
    ),
    h(
      WorkflowButton,
      {
        type: 'button',
        variant: 'secondary',
        disabled: busy || rows.length === 0,
        small: true,
        onClick: onAnalyze,
      },
      tImport(context, 'page.button.analyze'),
    ),
    h(
      WorkflowButton,
      {
        type: 'button',
        variant: 'muted',
        disabled: busy,
        small: true,
        onClick: clearWorkflow,
      },
      tImport(context, 'page.button.clear'),
    ),
    failedRows.length > 0
      ? h(
          WorkflowButton,
          {
            type: 'button',
            variant: 'secondary',
            disabled: busy,
            small: true,
            onClick: onRestoreFallback,
          },
          tImport(context, 'page.button.fallback'),
        )
      : null,
  )

  return h(
    'div',
    { className: 'iw-shell' },
    h(WorkflowStepper, { steps: WORKFLOW_STEP_KEYS.map((key) => tImport(context, key)), currentStep: step }),
    h(InlineError, { message: errorMessage }),
    h(
      'main',
      { className: 'iw-main iw-main--workflow' },
      step === 1
        ? h(
            'div',
            { className: 'iw-section-grid iw-section-grid--workflow' },
            h(
              WorkflowCard,
              {
                title: tImport(context, 'page.card.summary'),
                subtitle: tImport(context, 'page.summary.subtitle'),
                className: 'iw-card--metrics',
              },
              h(
                'div',
                { className: 'iw-stats-inline' },
                [
                  [tImport(context, 'page.summary.pending'), stats.pending],
                  [tImport(context, 'page.summary.ready'), stats.ready],
                  [tImport(context, 'page.summary.failed'), stats.failed],
                  [tImport(context, 'page.summary.skipped'), stats.skipped],
                ].map(([label, value]) =>
                  h(
                    'div',
                    { key: label, className: 'iw-stats-inline__item' },
                    h('span', { className: 'iw-stats-inline__label' }, label),
                    h('strong', { className: 'iw-stats-inline__value' }, String(value)),
                  ),
                ),
              ),
            ),
            h(
              WorkflowCard,
              {
                title: tImport(context, 'page.card.prepared'),
                subtitle: validationIssues.length > 0
                  ? formatImport(context, 'page.prepared.subtitle.issues', { count: validationIssues.length })
                  : tImport(context, 'page.prepared.subtitle.ready'),
                className: 'iw-card--table-panel',
                rightSlot: preparedFilesActions,
              },
              h(
                'div',
                { className: 'iw-table-wrap iw-table-wrap--prepared' },
                h(
                  'table',
                  { className: 'iw-table' },
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      PREPARED_FILE_COLUMNS.map((column) =>
                        h(
                          'th',
                          {
                            key: column.id,
                            style: {
                              width: `${column.defaultWidth}px`,
                              minWidth: `${column.defaultWidth}px`,
                            },
                          },
                          tImport(context, column.labelKey),
                        ),
                      ),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    sortedRows.length === 0
                      ? h(
                          'tr',
                          null,
                          h('td', { className: 'iw-empty-row', colSpan: PREPARED_FILE_COLUMNS.length }, tImport(context, 'page.empty.prepared')),
                        )
                      : sortedRows.map((row) => {
                          const category = categoryMap.get(row.categoryId)
                          const selected = selectedPaths.has(row.filePath)
                          return h(
                            'tr',
                            {
                              key: row.filePath,
                              className: selected ? 'iw-row is-selected' : 'iw-row',
                              style: {
                                background: selected ? tintFromHex(category?.previewHex, 0.18) : tintFromHex(category?.previewHex, 0.08),
                              },
                              onMouseDown: (event) => {
                                if (shouldIgnoreRowSelection(event.target)) {
                                  return
                                }
                                toggleRowSelection(row.filePath, event)
                              },
                            },
                            PREPARED_FILE_COLUMNS.map((column) =>
                              h(React.Fragment, { key: column.id }, renderPreparedFileCell(column, row)),
                            ),
                          )
                        }),
                  ),
                ),
              ),
              validationIssues.length > 0
                ? h(
                    'ul',
                    { className: 'iw-validation-list' },
                    validationIssues.map((issue) => h('li', { key: issue }, issue)),
                  )
                : null,
            ),
          )
        : null,

      step === 2
        ? h(
            WorkflowCard,
            {
              title: tImport(context, 'page.card.strip'),
              subtitle: settings.ui.stripAfterImport
                ? tImport(context, 'page.strip.subtitle.enabled')
                : tImport(context, 'page.strip.subtitle.disabled'),
              className: 'iw-card--stage',
              rightSlot: settings.ui.stripAfterImport
                ? h(
                    React.Fragment,
                    null,
                    h(
                      WorkflowButton,
                      {
                        type: 'button',
                        variant: 'secondary',
                        onClick: () => {
                          void openStripSilence()
                        },
                        disabled: busy,
                      },
                      tImport(context, 'page.button.openStrip'),
                    ),
                    h(
                      WorkflowButton,
                      {
                        type: 'button',
                        variant: 'primary',
                        onClick: () => {
                          setStripReady(true)
                          setBanner(tImport(context, 'page.banner.stripConfirmed'))
                        },
                        disabled: busy,
                      },
                      tImport(context, 'page.button.markReady'),
                    ),
                  )
                : null,
            },
            h('p', { className: 'iw-copy' }, tImport(context, stripOpened ? 'page.strip.window.opened' : 'page.strip.window.closed')),
            h('p', { className: 'iw-copy' }, tImport(context, stripReady || !settings.ui.stripAfterImport ? 'page.strip.ready.confirmed' : 'page.strip.ready.pending')),
          )
        : null,

      step === 3
        ? h(
            WorkflowCard,
            {
              title: tImport(context, 'page.card.run'),
              subtitle: tImport(context, 'page.run.subtitle'),
              className: 'iw-card--stage',
              rightSlot: h(
                WorkflowButton,
                {
                  type: 'button',
                  variant: 'danger',
                  onClick: () => {
                    void cancelRun()
                  },
                  disabled: busy || runState.phase !== 'backend' || !runState.jobId,
                },
                tImport(context, 'page.button.cancel'),
              ),
            },
            h(
              'div',
              { className: 'iw-progress-wrap' },
              h('div', { className: 'iw-progress-text' }, progressLabel),
              h(
                'div',
                { className: 'iw-progress-track' },
                h('div', {
                  className: 'iw-progress-fill',
                  style: {
                    width: `${progressValue}%`,
                  },
                }),
              ),
              h(
                'div',
                { className: 'iw-progress-meta' },
                h('span', null, `${tImport(context, 'page.meta.stage')}: ${progressStageLabel}`),
                h('span', null, `${tImport(context, 'page.meta.items')}: ${runState.current}/${runState.total || 0}`),
                h('span', null, `${tImport(context, 'page.meta.job')}: ${runState.jobId || tImport(context, 'page.job.na')}`),
              ),
            ),
          )
        : null,

    ),
    h(
      WorkflowActionBar,
      { className: 'iw-action-bar--workflow', sticky: false, align: 'space-between' },
      null,
      h(
        WorkflowButton,
        {
          type: 'button',
          variant: 'secondary',
          disabled: step === 1 || busy,
          onClick: () => setStep((previous) => Math.max(1, previous - 1)),
        },
        tImport(context, 'page.button.previous'),
      ),
      step < 3
        ? h(
            WorkflowButton,
            {
              type: 'button',
              variant: 'primary',
              disabled: !canGoNext || busy,
              onClick: () => setStep((previous) => Math.min(3, previous + 1)),
            },
            formatImport(context, 'page.next', { label: nextStepLabel }),
          )
        : h(
            WorkflowButton,
            {
              type: 'button',
              variant: 'primary',
              disabled: busy || readyRows.length === 0 || validationIssues.length > 0,
              onClick: () => {
                void startImportRun()
              },
            },
            tImport(context, 'page.button.run'),
          ),
    ),
  )
}
