import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'
import { WorkflowActionBar } from '../../components/workflow/WorkflowActionBar'
import { WorkflowCard } from '../../components/workflow/WorkflowCard'
import { WorkflowStepper } from '../../components/workflow/WorkflowStepper'
import { WorkflowTitle } from '../../components/workflow/WorkflowTitle'
import { ErrorNotice } from '../../components/feedback/ErrorNotice'

import {
  AiNamingConfig,
  AppConfigDto,
  CategoryTemplate,
  ImportRunState,
  ProposalStatus,
  RenameProposal,
  ResolvedImportItem,
} from '../../types/import'
import { makeLocalFriendlyError, normalizeAppError, type FriendlyErrorView } from '../../errors/normalizeAppError'
import { useI18n } from '../../i18n'
import { importApi } from '../../services/api/import'
import { estimateEtaFromProgress, formatEtaLabel } from '../../utils/progressEta'
import { AiSettingsDialog, CategoryEditorDialog } from '../settings/ConfigDialogs'

type SortMode = 'name' | 'type' | 'category_order'

type LocalFile = {
  file_path: string
  file_name: string
  category_id: string
}

type DisplayRowStatus = 'ready' | 'failed' | 'skipped' | 'pending'

type DisplayProposalRow = {
  file_path: string
  category_id: string
  ai_name: string
  final_name: string
  status: DisplayRowStatus
  error_message: string | null
}

type AnalyzeCacheProposalRow = Partial<RenameProposal> & {
  relative_path?: string
}

type AnalyzeCachePayload = {
  version?: number
  generated_at?: string
  folder?: string
  total?: number
  proposals?: AnalyzeCacheProposalRow[]
}

type ImportWorkflowProps = {
  openAiSignal?: number
  openCategorySignal?: number
  onBackHome?: () => void
  onOpenAiSettings?: () => void
}

const AUDIO_EXT_REGEX = /\.(wav|aif|aiff)$/i
const ANALYZE_CACHE_FILENAME = '.presto_ai_analyze.json'

function basenameOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || filePath
}

function stemOf(filePath: string): string {
  const base = basenameOf(filePath)
  return base.replace(AUDIO_EXT_REGEX, '')
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function isPathInsideFolder(filePath: string, folderPath: string): boolean {
  const normalizedFile = normalizePath(filePath)
  const normalizedFolder = normalizePath(folderPath)
  return normalizedFile === normalizedFolder || normalizedFile.startsWith(`${normalizedFolder}/`)
}

function relativePathFromFolder(filePath: string, folderPath: string): string {
  const normalizedFile = normalizePath(filePath)
  const normalizedFolder = normalizePath(folderPath)
  if (normalizedFile.startsWith(`${normalizedFolder}/`)) {
    return normalizedFile.slice(normalizedFolder.length + 1)
  }
  return basenameOf(filePath)
}

function rowBackgroundFromCategoryHex(color: string | null | undefined): string {
  if (!color || color === 'null' || !color.startsWith('#')) {
    return 'rgba(107, 114, 128, 0.1)'
  }
  const hex = color.replace('#', '')
  if (hex.length === 8) {
    const r = parseInt(hex.slice(2, 4), 16)
    const g = parseInt(hex.slice(4, 6), 16)
    const b = parseInt(hex.slice(6, 8), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 'rgba(107, 114, 128, 0.1)'
    return `rgba(${r}, ${g}, ${b}, 0.1)`
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 'rgba(107, 114, 128, 0.1)'
    return `rgba(${r}, ${g}, ${b}, 0.1)`
  }
  return 'rgba(107, 114, 128, 0.1)'
}

function terminalStatus(status: string): boolean {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}

function isImportStopRouteMissingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('/api/v1/import/run/stop/') && message.includes('"detail":"Not Found"')
}

function buildDefaultProposal(file: LocalFile): RenameProposal {
  const normalized = stemOf(file.file_path)
  return {
    file_path: file.file_path,
    category_id: file.category_id,
    original_stem: normalized,
    ai_name: normalized,
    final_name: normalized,
    status: 'ready',
    error_message: null,
  }
}

function normalizeAnalyzeOutput(raw: unknown): RenameProposal[] {
  if (!Array.isArray(raw)) {
    throw new Error('AI analyze response is not an array.')
  }

  return raw
    .map((item) => {
      const row = item as Partial<RenameProposal>
      if (!row || typeof row.file_path !== 'string' || typeof row.category_id !== 'string') {
        return null
      }
      const status: ProposalStatus =
        row.status === 'ready' || row.status === 'failed' || row.status === 'skipped' ? row.status : 'failed'
      const originalStem = typeof row.original_stem === 'string' && row.original_stem.trim() ? row.original_stem : stemOf(row.file_path)
      const aiName = typeof row.ai_name === 'string' && row.ai_name.trim() ? row.ai_name : originalStem
      const finalName = typeof row.final_name === 'string' && row.final_name.trim() ? row.final_name : aiName
      return {
        file_path: row.file_path,
        category_id: row.category_id,
        original_stem: originalStem,
        ai_name: aiName,
        final_name: finalName,
        status,
        error_message: typeof row.error_message === 'string' ? row.error_message : null,
      }
    })
    .filter((item): item is RenameProposal => Boolean(item))
}

function normalizeCachedProposal(filePath: string, row: AnalyzeCacheProposalRow, fallbackCategoryId: string): RenameProposal {
  const status: ProposalStatus = row.status === 'ready' || row.status === 'failed' || row.status === 'skipped' ? row.status : 'ready'
  const originalStem = typeof row.original_stem === 'string' && row.original_stem.trim() ? row.original_stem : stemOf(filePath)
  const aiName = typeof row.ai_name === 'string' && row.ai_name.trim() ? row.ai_name : originalStem
  const finalName = typeof row.final_name === 'string' && row.final_name.trim() ? row.final_name : aiName

  return {
    file_path: filePath,
    category_id: typeof row.category_id === 'string' && row.category_id.trim() ? row.category_id : fallbackCategoryId,
    original_stem: originalStem,
    ai_name: aiName,
    final_name: finalName,
    status,
    error_message: typeof row.error_message === 'string' ? row.error_message : null,
  }
}

function joinPath(dir: string, entry: string): string {
  if (!dir) return entry
  return dir.endsWith('/') ? `${dir}${entry}` : `${dir}/${entry}`
}

export function ImportWorkflow(props: ImportWorkflowProps) {
  const { t } = useI18n()
  const [config, setConfig] = useState<AppConfigDto | null>(null)
  const [files, setFiles] = useState<LocalFile[]>([])
  const [sourceFolders, setSourceFolders] = useState<string[]>([])
  const [proposals, setProposals] = useState<RenameProposal[]>([])
  const [resolvedItems, setResolvedItems] = useState<ResolvedImportItem[]>([])
  const [step, setStep] = useState(1)
  const [sortMode, setSortMode] = useState<SortMode>('category_order')

  const [stripOpened, setStripOpened] = useState(false)
  const [stripReady, setStripReady] = useState(false)

  const [runId, setRunId] = useState<string | null>(null)
  const [runState, setRunState] = useState<ImportRunState | null>(null)
  const [banner, setBanner] = useState(() => t('import.banner.ready'))
  const [error, setError] = useState<FriendlyErrorView | null>(null)
  const [busy, setBusy] = useState(false)
  const [isStoppingRun, setIsStoppingRun] = useState(false)

  const [logs, setLogs] = useState<string[]>([])

  const [showAiSettings, setShowAiSettings] = useState(false)
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [hasAiKey, setHasAiKey] = useState(false)
  const [ptConnected, setPtConnected] = useState(false)

  const pollTimerRef = useRef<number | null>(null)
  const cachePersistTimerRef = useRef<number | null>(null)
  const pendingCacheRowsRef = useRef<RenameProposal[] | null>(null)

  const readyRows = useMemo(() => proposals.filter((item) => item.status === 'ready'), [proposals])
  const failedRows = useMemo(() => proposals.filter((item) => item.status === 'failed'), [proposals])
  const skippedRows = useMemo(() => proposals.filter((item) => item.status === 'skipped'), [proposals])

  const displayRows = useMemo<DisplayProposalRow[]>(() => {
    const proposalByPath = new Map(proposals.map((item) => [item.file_path, item]))
    return files.map((file) => {
      const matched = proposalByPath.get(file.file_path)
      if (matched) {
        return {
          file_path: matched.file_path,
          category_id: matched.category_id,
          ai_name: matched.ai_name,
          final_name: matched.final_name || stemOf(matched.file_path),
          status: matched.status,
          error_message: matched.error_message,
        }
      }
      return {
        file_path: file.file_path,
        category_id: file.category_id,
        ai_name: '-',
        final_name: stemOf(file.file_path),
        status: 'pending',
        error_message: null,
      }
    })
  }, [files, proposals])

  const pendingRows = useMemo(() => displayRows.filter((item) => item.status === 'pending'), [displayRows])

  const manualMap = useMemo(() => {
    const map: Record<string, string> = {}
    proposals.forEach((item) => {
      map[item.file_path] = item.final_name
    })
    return map
  }, [proposals])

  const conflictCount = useMemo(() => {
    const counts = new Map<string, number>()
    readyRows.forEach((item) => {
      const key = item.final_name.trim().toLowerCase()
      if (!key) {
        return
      }
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    let total = 0
    counts.forEach((count) => {
      if (count > 1) {
        total += count
      }
    })
    return total
  }, [readyRows])

  const emptyCount = useMemo(() => readyRows.filter((item) => !item.final_name.trim()).length, [readyRows])

  const modifiedCount = useMemo(() => {
    let count = 0
    readyRows.forEach((item) => {
      if (item.final_name !== item.ai_name) {
        count += 1
      }
    })
    return count
  }, [readyRows])

  const categoryOrderMap = useMemo(() => {
    const order = new Map<string, number>()
    ;(config?.categories || []).forEach((category, index) => {
      order.set(category.id, index)
    })
    return order
  }, [config?.categories])

  const categoryNameMap = useMemo(() => {
    const names = new Map<string, string>()
    ;(config?.categories || []).forEach((category) => {
      names.set(category.id, category.name)
    })
    return names
  }, [config?.categories])

  const sortedRows = useMemo(() => {
    const rows = [...displayRows]
    if (sortMode === 'category_order') {
      rows.sort((a, b) => {
        const orderA = categoryOrderMap.get(a.category_id) ?? Number.MAX_SAFE_INTEGER
        const orderB = categoryOrderMap.get(b.category_id) ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) {
          return orderA - orderB
        }
        return basenameOf(a.file_path).localeCompare(basenameOf(b.file_path), undefined, { sensitivity: 'base' })
      })
    } else if (sortMode === 'name') {
      rows.sort((a, b) => basenameOf(a.file_path).localeCompare(basenameOf(b.file_path), undefined, { sensitivity: 'base' }))
    } else {
      rows.sort((a, b) => {
        const nameA = categoryNameMap.get(a.category_id) || a.category_id
        const nameB = categoryNameMap.get(b.category_id) || b.category_id
        const categoryResult = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
        if (categoryResult !== 0) {
          return categoryResult
        }
        return basenameOf(a.file_path).localeCompare(basenameOf(b.file_path), undefined, { sensitivity: 'base' })
      })
    }
    return rows
  }, [displayRows, sortMode, categoryOrderMap, categoryNameMap])

  const displayOrderMap = useMemo(() => {
    const order = new Map<string, number>()
    sortedRows.forEach((row, index) => {
      order.set(row.file_path, index)
    })
    return order
  }, [sortedRows])

  const orderByDisplayOrder = <T extends { file_path: string }>(rows: T[]): T[] => {
    return [...rows].sort((a, b) => {
      const orderA = displayOrderMap.get(a.file_path) ?? Number.MAX_SAFE_INTEGER
      const orderB = displayOrderMap.get(b.file_path) ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) {
        return orderA - orderB
      }
      return basenameOf(a.file_path).localeCompare(basenameOf(b.file_path), undefined, { sensitivity: 'base' })
    })
  }

  const canNext = useMemo(() => {
    if (step === 1) {
      if (files.length === 0) {
        return false
      }
      if (proposals.length === 0) {
        return true
      }
      return conflictCount === 0 && emptyCount === 0
    }
    if (step === 2) {
      return stripReady
    }
    return false
  }, [step, files.length, proposals.length, conflictCount, emptyCount, stripReady])

  const currentStageLabel = useMemo(() => {
    if (!runState?.stage) {
      return t('import.step3.stage.unknown')
    }
    if (runState.stage === 'stage_import_rename') return t('import.step3.stage.importRename')
    if (runState.stage === 'stage_color_batch') return t('import.step3.stage.colorBatch')
    if (runState.stage === 'stage_strip_silence') return t('import.step3.stage.stripSilence')
    if (runState.stage === 'stage_completed') return t('import.step3.stage.completed')
    return runState.stage
  }, [runState?.stage, t])

  const importEtaText = useMemo(() => {
    if (!runState || terminalStatus(runState.status)) {
      return null
    }
    const etaSeconds =
      typeof runState.eta_seconds === 'number'
        ? runState.eta_seconds
        : estimateEtaFromProgress(runState.started_at, Number(runState.progress || 0))
    if (etaSeconds == null) {
      return t('import.step3.etaCalculating')
    }
    return t('import.step3.eta', { value: formatEtaLabel(etaSeconds) })
  }, [runState, t])

  const loadConfig = async (): Promise<void> => {
    try {
      const data = await importApi.getConfig()
      setConfig(data)
      const status = await importApi.getAiKeyStatus()
      setHasAiKey(status)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Load config failed: ${msg}`)
    }
  }

  useEffect(() => {
    void loadConfig()
    return () => {
      if (pollTimerRef.current != null) {
        window.clearTimeout(pollTimerRef.current)
      }
      if (cachePersistTimerRef.current != null) {
        window.clearTimeout(cachePersistTimerRef.current)
        cachePersistTimerRef.current = null
      }
      if (pendingCacheRowsRef.current && pendingCacheRowsRef.current.length > 0) {
        void persistAnalyzeResultCache(pendingCacheRowsRef.current)
        pendingCacheRowsRef.current = null
      }
      void window.electronAPI?.window.setAlwaysOnTop(false)
    }
  }, [])

  useEffect(() => {
    let timer: number | null = null
    const refreshHealth = async (): Promise<void> => {
      try {
        const health = await importApi.health()
        setPtConnected(Boolean(health.ptsl_connected))
      } catch {
        setPtConnected(false)
      }
      timer = window.setTimeout(() => {
        void refreshHealth()
      }, 3000)
    }
    void refreshHealth()
    return () => {
      if (timer != null) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    if (props.openAiSignal && props.openAiSignal > 0) {
      setShowAiSettings(true)
    }
  }, [props.openAiSignal])

  useEffect(() => {
    if (props.openCategorySignal && props.openCategorySignal > 0) {
      setShowCategoryEditor(true)
    }
  }, [props.openCategorySignal])

  const appendLog = (text: string): void => {
    setLogs((prev) => [...prev, `${new Date().toISOString()} ${text}`])
  }

  const schedulePersistAnalyzeResultCache = (rows: RenameProposal[]): void => {
    if (sourceFolders.length === 0 || rows.length === 0) {
      return
    }

    const snapshot = rows.map((row) => ({ ...row }))
    pendingCacheRowsRef.current = snapshot

    if (cachePersistTimerRef.current != null) {
      window.clearTimeout(cachePersistTimerRef.current)
    }

    cachePersistTimerRef.current = window.setTimeout(() => {
      const pending = pendingCacheRowsRef.current
      pendingCacheRowsRef.current = null
      cachePersistTimerRef.current = null
      if (pending && pending.length > 0) {
        void persistAnalyzeResultCache(pending)
      }
    }, 400)
  }

  const appendFiles = (paths: string[]): void => {
    const fallbackCategoryId = config?.categories[0]?.id || 'other'
    const accepted = paths.filter((filePath) => AUDIO_EXT_REGEX.test(filePath))
    if (accepted.length === 0) {
      return
    }
    setFiles((prev) => {
      const seen = new Set(prev.map((row) => row.file_path))
      const added: LocalFile[] = []
      for (const filePath of accepted) {
        if (seen.has(filePath)) continue
        seen.add(filePath)
        added.push({
          file_path: filePath,
          file_name: basenameOf(filePath),
          category_id: fallbackCategoryId,
        })
      }
      return [...prev, ...added]
    })
    setBanner(`${accepted.length} files added.`)
  }

  const collectAudioFilesRecursively = async (rootDir: string): Promise<string[]> => {
    const fsApi = window.electronAPI?.fs
    if (!fsApi) {
      throw new Error('Electron filesystem API is unavailable.')
    }

    const queue: string[] = [rootDir]
    const visitedDirs = new Set<string>()
    const found: string[] = []

    while (queue.length > 0) {
      const currentDir = queue.shift()
      if (!currentDir || visitedDirs.has(currentDir)) {
        continue
      }
      visitedDirs.add(currentDir)

      let entries: string[] = []
      try {
        entries = await fsApi.readdir(currentDir)
      } catch {
        continue
      }
      entries.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

      for (const entry of entries) {
        const fullPath = joinPath(currentDir, entry)
        const stat = await fsApi.stat(fullPath)
        if (!stat) {
          continue
        }
        if (stat.isDirectory) {
          queue.push(fullPath)
        } else if (stat.isFile && AUDIO_EXT_REGEX.test(fullPath)) {
          found.push(fullPath)
        }
      }
    }

    return found
  }

  const pickFolders = async (): Promise<void> => {
    if (!window.electronAPI?.showOpenDialog) {
      setError(makeLocalFriendlyError('当前环境不可用系统文件选择器，请在桌面版应用中使用该功能。'))
      return
    }
    const result = await window.electronAPI.showOpenDialog({
      title: 'Select folders to scan',
      properties: ['openDirectory', 'multiSelections'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return
    }

    setSourceFolders((prev) => {
      const next = [...prev]
      for (const folder of result.filePaths) {
        if (!next.includes(folder)) {
          next.push(folder)
        }
      }
      return next
    })

    setBusy(true)
    try {
      const allAudioFiles: string[] = []
      const folderAudioFilesMap = new Map<string, string[]>()
      for (const dirPath of result.filePaths) {
        const found = await collectAudioFilesRecursively(dirPath)
        allAudioFiles.push(...found)
        folderAudioFilesMap.set(dirPath, found)
      }
      appendFiles(allAudioFiles)
      const cacheResult = await loadAnalyzeResultCache(result.filePaths, folderAudioFilesMap)
      if (cacheResult.loadedCount > 0) {
        setProposals((prev) => {
          const nextMap = new Map(prev.map((item) => [item.file_path, item]))
          for (const row of cacheResult.rows) {
            nextMap.set(row.file_path, row)
          }
          return orderByDisplayOrder(Array.from(nextMap.values()))
        })
        setResolvedItems([])
        setStep(1)
      }
      const cacheSuffix =
        cacheResult.loadedCount > 0
          ? ` Loaded ${cacheResult.loadedCount} cached AI result(s).`
          : cacheResult.foundCacheFiles > 0
            ? ' Cache files found, but no matching rows for current files.'
            : ''
      setBanner(`Scanned ${result.filePaths.length} folder(s), found ${allAudioFiles.length} audio files.${cacheSuffix}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Scan folder failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const clearFiles = (): void => {
    if (cachePersistTimerRef.current != null) {
      window.clearTimeout(cachePersistTimerRef.current)
      cachePersistTimerRef.current = null
    }
    pendingCacheRowsRef.current = null
    setFiles([])
    setSourceFolders([])
    setProposals([])
    setResolvedItems([])
    setStripOpened(false)
    setStripReady(false)
    setRunId(null)
    setRunState(null)
    setError(null)
    setBanner('Files cleared.')
  }

  const runAnalyze = async (): Promise<void> => {
    if (!config) {
      return
    }
    if (files.length === 0) {
      setError(makeLocalFriendlyError('请先添加文件夹再执行 AI 分析。'))
      return
    }

    setBusy(true)
    setError(null)
    setBanner('Running AI analyze...')

    try {
      const items = files.map((item) => ({ file_path: item.file_path, category_id: item.category_id }))
      const output = await importApi.analyze(items)
      const normalized = normalizeAnalyzeOutput(output)
      const ordered = orderByDisplayOrder(normalized)
      setProposals(ordered)
      schedulePersistAnalyzeResultCache(ordered)
      setBanner(`Analyze done: ready=${ordered.filter((r) => r.status === 'ready').length}`)
      appendLog('AI analyze completed.')
      setResolvedItems([])
      setStep(1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`AI analyze failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const persistAnalyzeResultCache = async (rows: RenameProposal[]): Promise<void> => {
    const fsApi = window.electronAPI?.fs
    if (!fsApi || sourceFolders.length === 0) {
      return
    }

    const generatedAt = new Date().toISOString()
    for (const folder of sourceFolders) {
      const folderRows = rows.filter((row) => isPathInsideFolder(row.file_path, folder))
      if (folderRows.length === 0) {
        continue
      }

      const cachePath = joinPath(folder, ANALYZE_CACHE_FILENAME)
      const payload = {
        version: 1,
        generated_at: generatedAt,
        folder,
        total: folderRows.length,
        proposals: folderRows.map((row) => ({
          ...row,
          relative_path: relativePathFromFolder(row.file_path, folder),
        })),
      }

      try {
        await fsApi.writeFile(cachePath, JSON.stringify(payload, null, 2))
        appendLog(`AI analysis cache saved: ${cachePath}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        appendLog(`Failed to save AI analysis cache (${cachePath}): ${msg}`)
      }
    }
  }

  const loadAnalyzeResultCache = async (
    folders: string[],
    folderAudioFilesMap: Map<string, string[]>,
  ): Promise<{ rows: RenameProposal[]; loadedCount: number; foundCacheFiles: number }> => {
    const fsApi = window.electronAPI?.fs
    if (!fsApi || folders.length === 0) {
      return { rows: [], loadedCount: 0, foundCacheFiles: 0 }
    }

    const fallbackCategoryId = config?.categories[0]?.id || 'other'
    const merged = new Map<string, RenameProposal>()
    let foundCacheFiles = 0

    for (const folder of folders) {
      const cachePath = joinPath(folder, ANALYZE_CACHE_FILENAME)
      let raw: string | null = null
      try {
        raw = await fsApi.readFile(cachePath)
      } catch {
        raw = null
      }
      if (!raw) {
        continue
      }
      foundCacheFiles += 1

      let payload: AnalyzeCachePayload
      try {
        payload = JSON.parse(raw) as AnalyzeCachePayload
      } catch {
        appendLog(`Invalid AI analysis cache JSON: ${cachePath}`)
        continue
      }

      if (!Array.isArray(payload.proposals) || payload.proposals.length === 0) {
        continue
      }

      const folderAudioFiles = folderAudioFilesMap.get(folder) || []
      const absoluteMap = new Map<string, string>()
      const relativeMap = new Map<string, string>()
      for (const filePath of folderAudioFiles) {
        absoluteMap.set(normalizePath(filePath), filePath)
        relativeMap.set(normalizePath(relativePathFromFolder(filePath, folder)), filePath)
      }

      let folderLoaded = 0
      for (const row of payload.proposals) {
        if (!row || typeof row !== 'object') {
          continue
        }

        let resolvedPath: string | null = null
        if (typeof row.file_path === 'string' && row.file_path.trim()) {
          const normalizedAbsolute = normalizePath(row.file_path)
          resolvedPath = absoluteMap.get(normalizedAbsolute) || null
        }

        if (!resolvedPath && typeof row.relative_path === 'string' && row.relative_path.trim()) {
          const normalizedRelative = normalizePath(row.relative_path)
          resolvedPath = relativeMap.get(normalizedRelative) || null
        }

        if (!resolvedPath) {
          continue
        }

        merged.set(resolvedPath, normalizeCachedProposal(resolvedPath, row, fallbackCategoryId))
        folderLoaded += 1
      }
      appendLog(`Loaded AI analysis cache: ${cachePath} (${folderLoaded}/${payload.proposals.length})`)
    }

    const rows = Array.from(merged.values())
    return { rows, loadedCount: rows.length, foundCacheFiles }
  }

  const updateProposal = (filePath: string, patch: Partial<RenameProposal>): void => {
    if (patch.category_id) {
      setFiles((prev) => prev.map((row) => (row.file_path === filePath ? { ...row, category_id: patch.category_id || row.category_id } : row)))
    }
    setProposals((prev) => {
      const next = prev.map((row) => (row.file_path === filePath ? { ...row, ...patch } : row))
      schedulePersistAnalyzeResultCache(next)
      return next
    })
    setResolvedItems([])
  }

  const finalizeStep2 = async (sourceProposals: RenameProposal[] = proposals): Promise<ResolvedImportItem[]> => {
    const orderedSource = orderByDisplayOrder(sourceProposals)
    const manualNameByPath = Object.fromEntries(orderedSource.map((item) => [item.file_path, item.final_name]))
    const result = await importApi.finalize(orderedSource, manualNameByPath)

    const orderedProposals = orderByDisplayOrder(result.proposals)
    const proposalOrder = new Map<string, number>()
    orderedProposals.forEach((item, index) => {
      proposalOrder.set(item.file_path, index)
    })

    const orderedResolved = [...result.resolved_items].sort((a, b) => {
      const orderA = proposalOrder.get(a.file_path) ?? Number.MAX_SAFE_INTEGER
      const orderB = proposalOrder.get(b.file_path) ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) {
        return orderA - orderB
      }
      return basenameOf(a.file_path).localeCompare(basenameOf(b.file_path), undefined, { sensitivity: 'base' })
    })

    setProposals(orderedProposals)
    schedulePersistAnalyzeResultCache(orderedProposals)
    setResolvedItems(orderedResolved)
    appendLog('Finalize naming completed.')
    return orderedResolved
  }

  const openStrip = async (): Promise<void> => {
    try {
      setBusy(true)
      await importApi.openStrip()
      setStripOpened(true)
      setBanner('Strip Silence window opened.')
      appendLog('Strip Silence window opened.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Open Strip Silence failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const markStripReady = (): void => {
    setStripReady(true)
    setBanner('Strip setup confirmed.')
  }

  const pollRun = async (id: string): Promise<void> => {
    try {
      const state = await importApi.runStatus(id)
      setRunState(state)

      if (terminalStatus(state.status)) {
        await window.electronAPI?.window.setAlwaysOnTop(false)
        appendLog(`Import run finished with status=${state.status}.`)
        return
      }

      pollTimerRef.current = window.setTimeout(() => {
        void pollRun(id)
      }, 1000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Run polling failed: ${msg}`)
      await window.electronAPI?.window.setAlwaysOnTop(false)
    }
  }

  const startAutomation = async (): Promise<void> => {
    try {
      setBusy(true)
      setError(null)
      setBanner('Starting automation...')

      const finalItems = resolvedItems.length > 0 ? resolvedItems : await finalizeStep2()
      if (finalItems.length === 0) {
        throw new Error('No executable items after finalize.')
      }

      await window.electronAPI?.window.setAlwaysOnTop(true)
      const id = await importApi.runStart(finalItems)
      setRunId(id)
      appendLog(`Import run started: ${id}`)
      void pollRun(id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Start automation failed: ${msg}`)
      await window.electronAPI?.window.setAlwaysOnTop(false)
    } finally {
      setBusy(false)
    }
  }

  const stopAutomation = async (): Promise<void> => {
    if (!runId) {
      return
    }
    try {
      setIsStoppingRun(true)
      await importApi.runStop(runId)
      setRunState((prev) => (prev ? { ...prev, status: 'cancelled', eta_seconds: 0 } : prev))
      setBanner(t('import.step3.cancelRequested'))
      appendLog(`Import run cancellation requested: ${runId}`)
      await window.electronAPI?.window.setAlwaysOnTop(false)
    } catch (err) {
      if (isImportStopRouteMissingError(err)) {
        appendLog('Import stop route not found on running backend; restarting backend for route refresh.')
        try {
          await window.electronAPI?.backend.restart()
          await window.electronAPI?.window.setAlwaysOnTop(false)
          setRunState((prev) => (prev ? { ...prev, status: 'cancelled', eta_seconds: 0 } : prev))
          setBanner(t('import.step3.cancelByRestart'))
          setError(
            makeLocalFriendlyError(t('import.step3.stopRouteOutdated'), {
              code: 'IMPORT_STOP_API_MISMATCH',
              severity: 'warn',
              actions: [t('import.step3.stopRouteAction')],
            }),
          )
          return
        } catch (restartErr) {
          const msg = restartErr instanceof Error ? restartErr.message : String(restartErr)
          appendLog(`Backend restart after stop-route mismatch failed: ${msg}`)
        }
      }
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Cancel import failed: ${msg}`)
    } finally {
      setIsStoppingRun(false)
    }
  }

  const handleSaveSession = async (): Promise<void> => {
    try {
      await importApi.saveSession()
      setBanner('Session saved.')
      appendLog('Session saved.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Save session failed: ${msg}`)
    }
  }

  const goNext = async (): Promise<void> => {
    if (!canNext) return
    if (step === 1) {
      try {
        setBusy(true)
        if (proposals.length === 0) {
          const fallback = files.map((item) => buildDefaultProposal(item))
          setProposals(fallback)
          await finalizeStep2(fallback)
        } else {
          await finalizeStep2()
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(normalizeAppError(err))
        appendLog(`Finalize failed: ${msg}`)
        return
      } finally {
        setBusy(false)
      }
    }
    setStep((prev) => Math.min(3, prev + 1))
  }

  const goPrev = (): void => {
    setStep((prev) => Math.max(1, prev - 1))
  }

  const saveAiSettings = async (nextAi: AiNamingConfig): Promise<void> => {
    if (!config) {
      return
    }
    try {
      setBusy(true)
      await importApi.updateConfig({
        ...config,
        ai_naming: nextAi,
        api_key: aiKeyInput.trim() ? aiKeyInput.trim() : undefined,
      })
      setConfig({ ...config, ai_naming: nextAi })
      if (aiKeyInput.trim()) {
        setHasAiKey(true)
        setAiKeyInput('')
      }
      setShowAiSettings(false)
      setBanner('AI settings saved.')
      appendLog('AI settings updated.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Save AI settings failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const saveCategories = async (categories: CategoryTemplate[]): Promise<void> => {
    if (!config) {
      return
    }
    try {
      setBusy(true)
      await importApi.updateConfig({
        ...config,
        categories,
      })
      setConfig({ ...config, categories })
      setShowCategoryEditor(false)
      setBanner('Categories updated.')
      appendLog('Categories updated.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(normalizeAppError(err))
      appendLog(`Save categories failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const stepNames = [t('import.step.analyzeManual'), t('import.step.stripSetup'), t('import.step.runAutomation')]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <WorkflowTitle
        title={t('import.title')}
        subtitle={t('import.subtitle')}
        rightSlot={
          <>
            {props.onBackHome ? (
              <button
                onClick={props.onBackHome}
                className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
              >
                {t('import.backHome')}
              </button>
            ) : null}
            <button
              onClick={() => {
                if (props.onOpenAiSettings) {
                  props.onOpenAiSettings()
                  return
                }
                setShowAiSettings(true)
              }}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              {t('import.aiSettings')}
            </button>
            <button
              onClick={() => {
                setShowCategoryEditor(true)
              }}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-100"
            >
              {t('import.categoryEditor')}
            </button>
          </>
        }
      />
      <WorkflowStepper steps={stepNames} currentStep={step} />

      <div className="px-6 py-3 border-b border-gray-200 bg-gray-100 text-sm text-gray-700">{banner}</div>
      <div className="px-6 pt-3">
        <ErrorNotice error={error} />
      </div>

      <div className="flex-1 overflow-auto">
        {step === 1 && (
          <div className="h-full flex flex-col p-6">
            <div className="flex-1 overflow-auto space-y-4">
              <WorkflowCard
                title={t('import.step1.title')}
                rightSlot={
                  <>
                    <button
                      onClick={() => void pickFolders()}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      {t('import.step1.addFolder')}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        void runAnalyze()
                      }}
                      className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      disabled={busy || files.length === 0}
                    >
                      {t('import.step1.runAnalyze')}
                    </button>
                    <button
                      onClick={clearFiles}
                      className="px-3 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      {t('import.step1.clear')}
                    </button>
                  </>
                }
              >
                <div className="p-3 text-sm text-gray-600">
                  {t('import.step1.selectFolderHint')}
                </div>
              </WorkflowCard>

              <div className="grid grid-cols-4 gap-3">
                <WorkflowCard>
                  <div className="text-sm text-gray-600">{t('import.stat.pending')}</div>
                  <div className="text-2xl font-semibold text-amber-600">{pendingRows.length}</div>
                </WorkflowCard>
                <WorkflowCard>
                  <div className="text-sm text-gray-600">{t('import.stat.ready')}</div>
                  <div className="text-2xl font-semibold text-green-600">{readyRows.length}</div>
                </WorkflowCard>
                <WorkflowCard>
                  <div className="text-sm text-gray-600">{t('import.stat.failed')}</div>
                  <div className="text-2xl font-semibold text-red-600">{failedRows.length}</div>
                </WorkflowCard>
                <WorkflowCard>
                  <div className="text-sm text-gray-600">{t('import.stat.skipped')}</div>
                  <div className="text-2xl font-semibold text-gray-600">{skippedRows.length}</div>
                </WorkflowCard>
              </div>
              <WorkflowCard
                title={t('import.projectInfo.title')}
                subtitle={t('import.projectInfo.connection', {
                  status: ptConnected ? t('import.projectInfo.connected') : t('import.projectInfo.notConnected'),
                })}
                rightSlot={
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">{t('import.projectInfo.sortBy')}</label>
                    <select
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="category_order">{t('import.sort.categoryOrder')}</option>
                      <option value="name">{t('import.sort.name')}</option>
                      <option value="type">{t('import.sort.type')}</option>
                    </select>
                  </div>
                }
                noBodyPadding
              >
                <div className="overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('import.table.trackInfo')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('import.table.category')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('import.table.aiName')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('import.table.finalName')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('import.table.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sortedRows.map((row) => {
                        const categoryMeta = (config?.categories || []).find((item) => item.id === row.category_id)
                        const colorDot = categoryMeta?.preview_hex || '#9CA3AF'
                        const rowBackground = rowBackgroundFromCategoryHex(colorDot)
                        return (
                          <tr
                            key={row.file_path}
                            className="hover:opacity-80 transition-all"
                            style={{ backgroundColor: rowBackground }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                                  style={{ backgroundColor: colorDot }}
                                />
                                <span className="text-sm font-medium text-gray-900">{basenameOf(row.file_path)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={row.category_id}
                                onChange={(event) => updateProposal(row.file_path, { category_id: event.target.value })}
                                className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                              >
                                {(config?.categories || []).map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{row.ai_name}</td>
                            <td className="px-4 py-3">
                              <input
                                value={row.final_name}
                                onChange={(event) => updateProposal(row.file_path, { final_name: event.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                                disabled={row.status !== 'ready'}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded-full text-xs ${
                                  row.status === 'ready'
                                    ? 'bg-green-100 text-green-700'
                                    : row.status === 'failed'
                                      ? 'bg-red-100 text-red-700'
                                      : row.status === 'pending'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-gray-200">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-sm">{t('import.summary.modified', { count: modifiedCount })}</div>
                    <div className="text-sm">{t('import.summary.conflicts', { count: conflictCount })}</div>
                    <div className="text-sm">{t('import.summary.ready', { count: readyRows.length })}</div>
                  </div>
                </div>
              </WorkflowCard>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="h-full flex flex-col p-6">
            <div className="flex-1 overflow-auto space-y-4">
              <WorkflowCard
                title={t('import.step2.title')}
                rightSlot={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void openStrip()}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      {t('import.step2.openStrip')}
                    </button>
                    <button
                      onClick={markStripReady}
                      className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      disabled={busy}
                    >
                      {t('import.step2.markReady')}
                    </button>
                  </div>
                }
              >
                <div className="text-sm text-gray-700">
                  {t('import.step2.status', {
                    opened: stripOpened || stripReady ? t('import.step2.windowOpened') : t('import.step2.windowNotOpened'),
                    confirmed: stripReady ? t('import.step2.confirmed') : t('import.step2.notConfirmed'),
                  })}
                </div>
              </WorkflowCard>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="h-full flex flex-col p-6">
            <div className="flex-1 overflow-auto space-y-4">
              <WorkflowCard
                title={t('import.step3.title')}
                rightSlot={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void startAutomation()}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      disabled={busy || isStoppingRun || (runState && !terminalStatus(runState.status))}
                    >
                      {t('import.step3.startAutomation')}
                    </button>
                    {runState && !terminalStatus(runState.status) ? (
                      <button
                        onClick={() => void stopAutomation()}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                        disabled={busy || isStoppingRun}
                      >
                        {isStoppingRun ? t('import.step3.stopping') : t('import.step3.stopAutomation')}
                      </button>
                    ) : null}
                  </div>
                }
              >
                <div className="text-sm text-gray-600">{t('import.step3.desc')}</div>
              </WorkflowCard>

              {runState && !terminalStatus(runState.status) ? (
                <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">{t('import.step3.running')}</span>
                    <span className="text-sm font-semibold text-blue-600">
                      {t('import.step3.items', { current: runState.current_index || 0, total: runState.total || 0 })}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{t('import.step3.overallProgress')}</span>
                      <span className="text-xs font-medium text-blue-600">
                        {Math.round(Number(runState.progress || 0))}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out shadow-sm"
                        style={{ width: `${Math.max(0, Math.min(100, Number(runState.progress || 0)))}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    {runState.current_name ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        <span className="text-xs text-gray-700">
                          {t('import.step3.currentItem', { name: runState.current_name })}
                        </span>
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-600">
                      {t('import.step3.status', { status: runState.status || t('import.step3.idle') })}
                    </div>
                    <div className="text-xs text-gray-600">
                      {t('import.step3.stageProgressLabel', { stage: currentStageLabel })}
                    </div>
                    {importEtaText ? <div className="text-xs text-gray-600">{importEtaText}</div> : null}
                    <div className="mt-2 p-2 bg-white rounded border border-blue-100">
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>{t('import.step3.runId', { id: runId || '-' })}</div>
                        <div>{t('import.step3.total', { count: runState.result?.total ?? runState.total ?? 0 })}</div>
                        <div>{t('import.step3.success', { count: runState.result?.success_count ?? 0 })}</div>
                        <div>{t('import.step3.failed', { count: runState.result?.failed_count ?? 0 })}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {runState?.error_message ? (
                <ErrorNotice
                  error={normalizeAppError({
                    success: false,
                    error_code: runState.error_code || 'UNEXPECTED_ERROR',
                    message: runState.error_message,
                  })}
                />
              ) : null}

              {runState && terminalStatus(runState.status) && runState.result ? (
                <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-3 mb-4">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <div>
                      <h3 className="text-lg font-semibold text-green-800">{t('import.step3.completed')}</h3>
                      <p className="text-sm text-green-600 mt-1">
                        {t('import.step3.completedSummary', {
                          success: runState.result.success_count || 0,
                          failed: runState.result.failed_count || 0,
                        })}
                      </p>
                    </div>
                  </div>
                  {runState.result.failed_count > 0 ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
                      {t('import.step3.firstFailure', {
                        message: runState.result.results?.find((item: any) => item.status === 'failed')?.error_message || t('import.step3.unknown'),
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {runState && terminalStatus(runState.status) ? (
                <WorkflowCard>
                  <button
                    onClick={() => void handleSaveSession()}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {t('import.step3.saveSession')}
                  </button>
                </WorkflowCard>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <WorkflowActionBar>
        {step > 1 ? (
        <button
          onClick={goPrev}
          disabled={busy}
          className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {step === 2 ? t('import.nav.prevAnalyzeManual') : t('import.nav.prevStrip')}
        </button>
      ) : null}
        {step < 3 ? (
          <button
            onClick={() => void goNext()}
            disabled={!canNext || busy}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {t('import.nav.next', { name: stepNames[step] })}
          </button>
        ) : null}
      </WorkflowActionBar>

      {showAiSettings && config ? (
        <AiSettingsDialog
          current={config.ai_naming}
          hasKey={hasAiKey}
          apiKeyInput={aiKeyInput}
          onApiKeyInput={setAiKeyInput}
          onCancel={() => setShowAiSettings(false)}
          onSave={(nextAi) => void saveAiSettings(nextAi)}
        />
      ) : null}

      {showCategoryEditor && config ? (
        <CategoryEditorDialog
          categories={config.categories}
          onCancel={() => setShowCategoryEditor(false)}
          onSave={(next) => void saveCategories(next)}
        />
      ) : null}
    </div>
  )
}
