import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react'

import { CAPABILITY_REGISTRY, type PrestoClient } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'
import type { BackendCapabilityDefinition } from '@presto/sdk-runtime/clients/backend'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  JsonView,
  Panel,
  Textarea,
  type BadgeTone,
} from '../ui'
import { validateCapabilityPayloadForDaw } from './capabilityFieldSupport'
import {
  CORE_CONSOLE_CAPABILITY_IDS,
  DEVELOPER_CAPABILITIES,
  type CapabilityStatus,
  type DeveloperCapabilityDefinition as DeveloperCapabilityOverlay,
  type DeveloperCapabilityId,
} from './developerCapabilityInventory'

type ExecutionPhase = 'idle' | 'running' | 'success' | 'error' | 'disabled'
type CapabilityFilter = 'all' | string

interface CapabilityExecutionState {
  payloadText: string
  resultText: string
  errorText: string
  phase: ExecutionPhase
}

type DeveloperCapabilityDefinition = BackendCapabilityDefinition & DeveloperCapabilityOverlay

type CoreIoPublicClient = {
  import: {
    run: {
      start(payload: unknown): Promise<unknown>
    }
  }
  export: {
    range: {
      set(payload: unknown): Promise<unknown>
    }
    start(payload: unknown): Promise<unknown>
    direct: {
      start(payload: unknown): Promise<unknown>
    }
  }
}

type ManualJobsPublicClient = {
  create(payload: unknown): Promise<unknown>
  update(payload: unknown): Promise<unknown>
}

export interface DeveloperCapabilityConsoleProps {
  presto: PrestoClient
  developerRuntime: PrestoRuntime
  activeDawTarget?: string | null
  smokeTarget?: string | null
  smokeImportFolder?: string | null
}

const WRITE_STATUSES = new Set<CapabilityStatus>(['live'])
const CORE_CONSOLE_CAPABILITY_ID_SET = new Set(CORE_CONSOLE_CAPABILITY_IDS)
const CORE_IO_CAPABILITY_ID_SET = new Set<DeveloperCapabilityId>([
  'import.run.start',
  'export.range.set',
  'export.start',
  'export.direct.start',
])
const developerConsoleShellStyle: CSSProperties = {
  display: 'grid',
  minHeight: 0,
  height: '100%',
}

const developerConsoleMainStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) minmax(320px, 0.95fr)',
  gap: 12,
  alignItems: 'stretch',
  minHeight: 0,
  overflow: 'hidden',
}

const developerConsoleListStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 10,
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: 2,
  scrollbarGutter: 'stable',
}

const developerConsoleInspectorStyle: CSSProperties = {
  display: 'grid',
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: 2,
  scrollbarGutter: 'stable',
}

const developerConsoleListPanelStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minHeight: 0,
}

const developerConsoleRegistryHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const developerConsoleRegistrySearchStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const developerConsoleRegistryTreeStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 8,
}

const developerConsoleRegistryRowStyle = (active: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '3px minmax(0, 1fr)',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
  padding: '7px 8px',
  borderRadius: 10,
  border: `1px solid ${
    active ? 'color-mix(in srgb, var(--presto-color-primary) 34%, transparent)' : 'transparent'
  }`,
  background: active
    ? 'color-mix(in srgb, var(--presto-color-primary-container) 72%, var(--presto-panel-muted) 28%)'
    : 'var(--presto-panel-muted)',
  cursor: 'pointer',
})

const developerConsoleRegistryAccentStyle = (active: boolean): CSSProperties => ({
  width: 3,
  height: 28,
  borderRadius: 999,
  background: active ? 'var(--presto-color-primary)' : 'transparent',
})

const developerConsoleRegistryRowCopyStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
}

const developerConsoleRegistryRowTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  fontWeight: 700,
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const developerConsoleInspectorPanelStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 10,
  minHeight: 0,
}

const developerConsoleOutputSectionStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  alignContent: 'start',
}

const developerConsoleInspectorSummaryCardStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minHeight: 212,
  maxHeight: 212,
}

const developerConsoleInspectorPayloadCardStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const developerConsoleInspectorOutputCardStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minHeight: 332,
  maxHeight: 332,
}

const developerConsoleInspectorCardBodyStyle: CSSProperties = {
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  paddingRight: 2,
  scrollbarGutter: 'stable',
}

const developerConsoleInspectorPayloadBodyStyle: CSSProperties = {
  display: 'grid',
  overflow: 'visible',
}

const developerConsoleOutputHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const developerConsoleInspectorEmptyStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const developerConsoleInspectorTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.96rem',
  fontWeight: 700,
}

const developerConsoleInspectorCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  lineHeight: 1.5,
}

const developerCapabilityNoteStyle: CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function createExecutionState(capability: DeveloperCapabilityOverlay): CapabilityExecutionState {
  return {
    payloadText: pretty(capability.defaultPayload),
    resultText: '',
    errorText: '',
    phase: WRITE_STATUSES.has(capability.status) ? 'idle' : 'disabled',
  }
}

function createSeedDefinitions(
  overlays: readonly DeveloperCapabilityOverlay[],
): DeveloperCapabilityDefinition[] {
  const overlayById = new Map(overlays.map((capability) => [capability.id, capability]))

  return CAPABILITY_REGISTRY
    .filter((capability) => CORE_CONSOLE_CAPABILITY_ID_SET.has(capability.id as DeveloperCapabilityId))
    .flatMap((capability) => {
      const overlay = overlayById.get(capability.id as DeveloperCapabilityId)
      if (!overlay) {
        return []
      }

      return [
        {
          ...capability,
          ...overlay,
        },
      ]
    })
}

function parsePayload(text: string): unknown {
  if (!text.trim()) {
    return {}
  }
  return JSON.parse(text)
}

function isJobNotRunningError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const value = error as {
    code?: unknown
    message?: unknown
    details?: { rawCode?: unknown; rawMessage?: unknown } | null
  }
  const code = typeof value.code === 'string' ? value.code : ''
  const rawCode = typeof value.details?.rawCode === 'string' ? value.details.rawCode : ''
  const message = typeof value.message === 'string' ? value.message : ''
  const rawMessage = typeof value.details?.rawMessage === 'string' ? value.details.rawMessage : ''

  return (
    code === 'JOB_NOT_RUNNING' ||
    rawCode === 'JOB_NOT_RUNNING' ||
    message.includes('JOB_NOT_RUNNING') ||
    rawMessage.includes('JOB_NOT_RUNNING')
  )
}

function isCapabilityFieldsUnsupportedError(error: unknown): boolean {
  const unsupportedFieldsMarker = { code: 'CAPABILITY_FIELDS_UNSUPPORTED' as const }

  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === unsupportedFieldsMarker.code,
  )
}

function statusTone(status: CapabilityStatus): BadgeTone {
  return status === 'live' ? 'brand' : 'public'
}

function categoryTone(domain: string): BadgeTone {
  switch (domain) {
    case 'import':
    case 'export':
      return 'warning'
    case 'jobs':
      return 'success'
    case 'daw':
    case 'track':
    case 'transport':
      return 'brand'
    default:
      return 'public'
  }
}

function phaseTone(phase: ExecutionPhase): BadgeTone {
  switch (phase) {
    case 'running':
      return 'brand'
    case 'success':
      return 'success'
    case 'error':
      return 'danger'
    case 'disabled':
      return 'public'
    case 'idle':
    default:
      return 'neutral'
  }
}

function capabilityMatchesFilter(
  capability: DeveloperCapabilityDefinition,
  filter: CapabilityFilter,
): boolean {
  return filter === 'all' ? true : capability.domain === filter
}

function formatCategoryLabel(domain: string): string {
  if (domain === 'daw') {
    return 'DAW'
  }

  return domain
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase())
}

function formatCapabilitySegment(segment: string): string {
  if (segment === 'daw') {
    return 'DAW'
  }

  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase())
}

function formatDawTarget(target: string): string {
  return target
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function resolveCapabilityFieldSupport(
  capability: DeveloperCapabilityDefinition,
  activeDawTarget?: string | null,
) {
  if (activeDawTarget && capability.fieldSupport[activeDawTarget]) {
    return {
      dawTarget: activeDawTarget,
      support: capability.fieldSupport[activeDawTarget],
    }
  }

  if (capability.fieldSupport[capability.canonicalSource]) {
    return {
      dawTarget: capability.canonicalSource,
      support: capability.fieldSupport[capability.canonicalSource],
    }
  }

  const [fallbackTarget, fallbackSupport] = Object.entries(capability.fieldSupport)[0] ?? []
  if (!fallbackTarget || !fallbackSupport) {
    return null
  }

  return {
    dawTarget: fallbackTarget,
    support: fallbackSupport,
  }
}

function formatCapabilityTitle(capability: DeveloperCapabilityDefinition): string {
  const segments = capability.id.split('.')
  const labelSegments = segments.length > 1 ? segments.slice(1) : segments
  return `${formatCategoryLabel(capability.domain)} / ${labelSegments.map(formatCapabilitySegment).join(' / ')}`
}

function capabilitySearchMatchesQuery(
  capability: DeveloperCapabilityDefinition,
  searchQuery: string,
): boolean {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return [
    capability.id,
    capability.domain,
    formatCapabilityTitle(capability),
    capability.note,
  ].some((value) => value.toLowerCase().includes(normalizedQuery))
}

async function invokePublicCapability(
  presto: PrestoClient,
  capabilityId: DeveloperCapabilityId,
  payload: unknown,
): Promise<unknown> {
  switch (capabilityId) {
    case 'system.health':
      return presto.system.health()
    case 'config.get':
      return presto.config.get()
    case 'config.update':
      return presto.config.update(payload as never)
    case 'daw.connection.connect':
      return presto.daw.connection.connect(payload as never)
    case 'daw.connection.disconnect':
      return presto.daw.connection.disconnect()
    case 'daw.connection.getStatus':
      return presto.daw.connection.getStatus()
    case 'session.getInfo':
      return presto.session.getInfo()
    case 'session.getLength':
      return presto.session.getLength()
    case 'session.save':
      return presto.session.save()
    case 'session.applySnapshot':
      return presto.session.applySnapshot(payload as never)
    case 'session.getSnapshotInfo':
      return presto.session.getSnapshotInfo(payload as never)
    case 'track.list':
      return presto.track.list()
    case 'track.listNames':
      return presto.track.listNames()
    case 'track.selection.get':
      return presto.track.selection.get()
    case 'track.rename':
      return presto.track.rename(payload as never)
    case 'track.select':
      return presto.track.select(payload as never)
    case 'track.color.apply':
      return presto.track.color.apply(payload as never)
    case 'track.hidden.set':
      return presto.track.hidden.set(payload as never)
    case 'track.inactive.set':
      return presto.track.inactive.set(payload as never)
    case 'track.mute.set':
      return presto.track.mute.set(payload as never)
    case 'track.solo.set':
      return presto.track.solo.set(payload as never)
    case 'track.recordEnable.set':
      return presto.track.recordEnable.set(payload as never)
    case 'track.recordSafe.set':
      return presto.track.recordSafe.set(payload as never)
    case 'track.inputMonitor.set':
      return presto.track.inputMonitor.set(payload as never)
    case 'track.online.set':
      return presto.track.online.set(payload as never)
    case 'track.frozen.set':
      return presto.track.frozen.set(payload as never)
    case 'track.open.set':
      return presto.track.open.set(payload as never)
    case 'clip.selectAllOnTrack':
      return presto.clip.selectAllOnTrack(payload as never)
    case 'transport.play':
      return presto.transport.play()
    case 'transport.stop':
      return presto.transport.stop()
    case 'transport.record':
      return presto.transport.record()
    case 'transport.getStatus':
      return presto.transport.getStatus()
    case 'stripSilence.open':
      return presto.stripSilence.open()
    case 'stripSilence.execute':
      return presto.stripSilence.execute(payload as never)
    case 'jobs.get':
      return presto.jobs.get((payload as { jobId: string }).jobId)
    case 'jobs.list':
      return presto.jobs.list(payload as never)
    case 'jobs.create': {
      const method = (presto.jobs as Partial<ManualJobsPublicClient>).create
      if (typeof method !== 'function') {
        throw {
          code: 'JOBS_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.jobs.create is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'jobs.update': {
      const method = (presto.jobs as Partial<ManualJobsPublicClient>).update
      if (typeof method !== 'function') {
        throw {
          code: 'JOBS_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.jobs.update is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'jobs.cancel':
      return presto.jobs.cancel((payload as { jobId: string }).jobId)
    case 'jobs.delete':
      return presto.jobs.delete((payload as { jobId: string }).jobId)
    case 'import.run.start': {
      const method = (presto as Partial<CoreIoPublicClient>).import?.run?.start
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.import.run.start is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'export.range.set': {
      const method = (presto as Partial<CoreIoPublicClient>).export?.range?.set
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.export.range.set is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'export.start': {
      const method = (presto as Partial<CoreIoPublicClient>).export?.start
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.export.start is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'export.direct.start': {
      const method = (presto as Partial<CoreIoPublicClient>).export?.direct?.start
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.export.direct.start is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    default:
      throw new Error(`unsupported_capability:${capabilityId}`)
  }
}

export function DeveloperCapabilityConsole({
  presto,
  developerRuntime,
  activeDawTarget,
  smokeTarget,
  smokeImportFolder,
}: DeveloperCapabilityConsoleProps) {
  const isSmokeMode =
    smokeTarget === 'developer-read' ||
    smokeTarget === 'developer-write' ||
    smokeTarget === 'track-write' ||
    smokeTarget === 'strip-silence' ||
    smokeTarget === 'core-io-write'
  const capabilityOverlayById = useMemo(
    () => new Map(DEVELOPER_CAPABILITIES.map((capability) => [capability.id, capability])),
    [],
  )
  const seededDefinitions = useMemo(() => createSeedDefinitions(DEVELOPER_CAPABILITIES), [])
  const filter: CapabilityFilter = 'all'
  const [searchQuery, setSearchQuery] = useState('')
  const [definitions, setDefinitions] = useState<DeveloperCapabilityDefinition[]>(() => seededDefinitions)
  const [catalogErrorText, setCatalogErrorText] = useState('')
  const [activeCapabilityId, setActiveCapabilityId] = useState<DeveloperCapabilityId | null>(
    () => seededDefinitions[0]?.id ?? null,
  )
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [states, setStates] = useState<Record<string, CapabilityExecutionState>>({})

  useEffect(() => {
    let cancelled = false

    void developerRuntime.backend
      .listCapabilities()
      .then((capabilities) => {
        if (cancelled) {
          return
        }

        const nextDefinitions = capabilities
          .filter((capability) => CORE_CONSOLE_CAPABILITY_ID_SET.has(capability.id as DeveloperCapabilityId))
          .flatMap((capability) => {
            const overlay = capabilityOverlayById.get(capability.id as DeveloperCapabilityId)
            if (!overlay) {
              return []
            }

            return [
              {
                ...capability,
                ...overlay,
              },
            ]
          })

        setDefinitions(nextDefinitions)
        setCatalogErrorText('')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setDefinitions(seededDefinitions)
        setCatalogErrorText(pretty(error))
      })

    return () => {
      cancelled = true
    }
  }, [capabilityOverlayById, developerRuntime, seededDefinitions])

  useEffect(() => {
    setStates((current) => {
      const nextStates = { ...current }
      for (const capability of definitions) {
        if (!nextStates[capability.id]) {
          nextStates[capability.id] = createExecutionState(capability)
        }
      }
      return nextStates
    })
  }, [definitions])

  const visibleDefinitions = useMemo(
    () =>
      definitions.filter(
        (capability) =>
          capabilityMatchesFilter(capability, filter) &&
          capabilitySearchMatchesQuery(capability, deferredSearchQuery),
      ),
    [definitions, deferredSearchQuery, filter],
  )

  const visibleCapabilityCount = visibleDefinitions.length

  const visibleCapabilityIds = useMemo(
    () => visibleDefinitions.map((capability) => capability.id),
    [visibleDefinitions],
  )
  const activeCapability = useMemo(
    () =>
      activeCapabilityId ? definitions.find((capability) => capability.id === activeCapabilityId) ?? null : null,
    [activeCapabilityId, definitions],
  )
  const activeCapabilityFieldSupport = useMemo(
    () => (activeCapability ? resolveCapabilityFieldSupport(activeCapability, activeDawTarget) : null),
    [activeCapability, activeDawTarget],
  )
  const activeCapabilityState = activeCapability ? states[activeCapability.id] ?? createExecutionState(activeCapability) : null

  useEffect(() => {
    if (activeCapabilityId && visibleCapabilityIds.includes(activeCapabilityId)) {
      return
    }
    setActiveCapabilityId(visibleCapabilityIds[0] ?? null)
  }, [activeCapabilityId, visibleCapabilityIds])

  const updateState = (
    capabilityId: DeveloperCapabilityId,
    updater: (prev: CapabilityExecutionState) => CapabilityExecutionState,
  ) => {
    setStates((prev) => ({
      ...prev,
      [capabilityId]:
        updater(
          prev[capabilityId] ??
            createExecutionState(
              capabilityOverlayById.get(capabilityId) ?? {
                id: capabilityId,
                domain: 'system',
                status: 'live',
                minimumDawVersion: 'Unknown',
                sideEffect: false,
                defaultPayload: {},
                note: '',
              },
            ),
        ),
    }))
  }

  const resetPayloadToDefault = (capability: DeveloperCapabilityDefinition) => {
    updateState(capability.id, (prev) => ({
      ...prev,
      payloadText: pretty(capability.defaultPayload),
    }))
  }

  const executeCapability = async (
    capability: DeveloperCapabilityDefinition,
    payloadOverride?: unknown,
  ): Promise<unknown> => {
    if (!WRITE_STATUSES.has(capability.status)) {
      updateState(capability.id, (prev) => ({
        ...prev,
        phase: 'disabled',
        errorText: pretty({
          code: 'CAPABILITY_UNAVAILABLE',
          message: capability.note,
        }),
      }))
      return null
    }

    let resolvedPayload: unknown = payloadOverride ?? {}
    try {
      resolvedPayload = payloadOverride ?? parsePayload(states[capability.id]?.payloadText ?? '{}')
      setActiveCapabilityId(capability.id)
      validateCapabilityPayloadForDaw(capability, resolvedPayload, activeDawTarget ?? capability.canonicalSource)
      updateState(capability.id, (prev) => ({
        ...prev,
        phase: 'running',
        errorText: '',
      }))

      const result = await invokePublicCapability(presto, capability.id, resolvedPayload)
      updateState(capability.id, (prev) => ({
        ...prev,
        phase: 'success',
        payloadText: pretty(resolvedPayload),
        resultText: pretty(result),
        errorText: '',
      }))
      return result
    } catch (error) {
      if (capability.id === 'jobs.cancel' && isJobNotRunningError(error)) {
        const toleratedResult = {
          cancelled: false,
          toleratedError: 'JOB_NOT_RUNNING',
          reason: 'job_already_completed',
        }
        updateState(capability.id, (prev) => ({
          ...prev,
          phase: 'success',
          payloadText: pretty(resolvedPayload),
          resultText: pretty(toleratedResult),
          errorText: '',
        }))
        return toleratedResult
      }

      if (isCapabilityFieldsUnsupportedError(error)) {
        updateState(capability.id, (prev) => ({
          ...prev,
          phase: 'error',
          payloadText: pretty(resolvedPayload),
          errorText: pretty(error),
        }))
        throw error
      }

      updateState(capability.id, (prev) => ({
        ...prev,
        phase: 'error',
        payloadText: pretty(resolvedPayload),
        errorText: pretty(error),
      }))
      throw error
    }
  }

  const pickPreferredTrackName = (tracks: Array<{ name?: string }> | undefined): string => {
    const preferredTrackNames = ['Crash_Cymbal', 'Kick', 'Snare']
    const availableTrackNames = (tracks ?? [])
      .map((track) => track.name)
      .filter((trackName): trackName is string => Boolean(trackName))
    return preferredTrackNames.find((candidate) => availableTrackNames.includes(candidate)) ?? availableTrackNames[0] ?? ''
  }

  const pickCancelableJobId = (
    jobs: Array<{ jobId?: string; state?: string }> | undefined,
  ): string => {
    const activeJob = (jobs ?? []).find((job) => job.jobId && (job.state === 'queued' || job.state === 'running'))
    if (activeJob?.jobId) {
      return activeJob.jobId
    }

    const fallbackJob = (jobs ?? []).find((job) => job.jobId)
    if (fallbackJob?.jobId) {
      return fallbackJob.jobId
    }

    throw new Error('core_io_smoke_no_job_available')
  }

  useEffect(() => {
    if (!isSmokeMode) {
      return
    }

    let cancelled = false
    const capabilityById = new Map(definitions.map((capability) => [capability.id, capability]))

    const invoke = async (capabilityId: DeveloperCapabilityId, payloadOverride?: unknown) => {
      const capability = capabilityById.get(capabilityId)
      if (!capability) {
        throw new Error(`missing capability: ${capabilityId}`)
      }
      return executeCapability(capability, payloadOverride)
    }

    const runReadSmoke = async () => {
      for (const capabilityId of [
        'system.health',
        'config.get',
        'daw.connection.getStatus',
        'transport.getStatus',
        'session.getInfo',
        'track.list',
      ] as const) {
        if (cancelled) {
          return
        }
        await invoke(capabilityId)
      }
    }

    const runWriteSmoke = async () => {
      const configResult = (await invoke('config.get')) as { config?: Record<string, unknown> }
      await invoke('config.update', { config: configResult.config ?? {} })
      await invoke('daw.connection.connect', {})
      await invoke('daw.connection.getStatus')
      await invoke('transport.getStatus')
      const trackList = (await invoke('track.list')) as { tracks?: Array<{ name?: string }> }
      const trackName = pickPreferredTrackName(trackList.tracks)
      if (!trackName) {
        throw new Error('developer_write_smoke_no_track_name')
      }
      await invoke('session.save')
      await invoke('track.rename', {
        currentName: trackName,
        newName: trackName,
      })
      await invoke('track.select', { trackName })
      await invoke('track.color.apply', {
        trackName,
        colorSlot: 1,
      })
      await invoke('track.hidden.set', {
        trackNames: [trackName],
        enabled: false,
      })
      await invoke('track.inactive.set', {
        trackNames: [trackName],
        enabled: false,
      })
      await invoke('clip.selectAllOnTrack', { trackName })
      await invoke('track.mute.set', {
        trackNames: [trackName],
        enabled: true,
      })
      await invoke('track.solo.set', {
        trackNames: [trackName],
        enabled: false,
      })
      await invoke('transport.play')
      await invoke('transport.stop')
      await invoke('transport.record')
      await invoke('transport.stop')
      await invoke('daw.connection.disconnect')
    }

    const runTrackWriteSmoke = async () => {
      const trackList = (await invoke('track.list')) as { tracks?: Array<{ name?: string }> }
      const trackName = pickPreferredTrackName(trackList.tracks)
      if (!trackName) {
        throw new Error('track_write_smoke_no_track_name')
      }

      await invoke('track.color.apply', {
        trackName,
        colorSlot: 1,
      })
    }

    const runStripSilenceSmoke = async () => {
      const trackList = (await invoke('track.list')) as { tracks?: Array<{ name?: string }> }
      const trackName = pickPreferredTrackName(trackList.tracks)
      if (!trackName) {
        throw new Error('strip_silence_smoke_no_track_name')
      }

      await invoke('track.select', { trackName })
      await invoke('clip.selectAllOnTrack', { trackName })
      await invoke('stripSilence.open')
      await invoke('stripSilence.execute', { trackName })
    }

    const runCoreIoSmoke = async () => {
      const importFolder = smokeImportFolder || '/private/tmp/presto-core-io-import'

      await invoke('export.range.set', {
        inTime: '00:00:00:00',
        outTime: '00:00:10:00',
      })

      const importJobAccepted = (await invoke('import.run.start', {
        folderPaths: [importFolder],
      })) as { jobId?: string }
      const exportJobAccepted = (await invoke('export.start', {
        outputPath: '/private/tmp/presto-core-io-export',
        fileName: 'presto-core-io-smoke-main',
        fileType: 'WAV',
        offline: true,
        audio: {
          format: 'interleaved',
          bitDepth: 24,
          sampleRate: 48000,
        },
      })) as { jobId?: string }
      const exportDirectJobAccepted = (await invoke('export.direct.start', {
        outputPath: '/private/tmp/presto-core-io-export',
        fileName: 'presto-core-io-smoke-direct',
        fileType: 'WAV',
        offline: true,
        audio: {
          format: 'interleaved',
          bitDepth: 24,
          sampleRate: 48000,
        },
      })) as { jobId?: string }
      const manualJobAccepted = (await invoke('jobs.create', {
        capability: 'jobs.create',
        targetDaw: 'pro_tools',
        state: 'queued',
        progress: {
          phase: 'queued',
          current: 0,
          total: 1,
          percent: 0,
          message: 'Manual placeholder job queued by core-io smoke.',
        },
        metadata: {
          source: 'developer-core-io-smoke',
        },
      })) as { job?: { jobId?: string } }

      const manualJobId = manualJobAccepted.job?.jobId
      if (!manualJobId) {
        throw new Error('core_io_smoke_missing_manual_job_id')
      }

      await invoke('jobs.update', {
        jobId: manualJobId,
        state: 'running',
        progress: {
          phase: 'running',
          current: 1,
          total: 2,
          percent: 50,
          message: 'Manual job running in core-io smoke.',
        },
      })
      await invoke('jobs.update', {
        jobId: manualJobId,
        state: 'succeeded',
        progress: {
          phase: 'succeeded',
          current: 2,
          total: 2,
          percent: 100,
          message: 'Manual job finished in core-io smoke.',
        },
        result: {
          source: 'developer-core-io-smoke',
          producerJobs: [
            importJobAccepted.jobId,
            exportJobAccepted.jobId,
            exportDirectJobAccepted.jobId,
          ],
        },
      })
      await invoke('jobs.get', { jobId: manualJobId })

      const jobsList = (await invoke('jobs.list', { limit: 20 })) as {
        jobs?: Array<{ jobId?: string; state?: string }>
      }
      const jobId = pickCancelableJobId(jobsList.jobs)
      await invoke('jobs.get', { jobId })
      await invoke('jobs.cancel', { jobId })
      await invoke('jobs.delete', { jobId })
    }

    void (async () => {
      try {
        if (smokeTarget === 'developer-read') {
          await runReadSmoke()
          return
        }
        if (smokeTarget === 'strip-silence') {
          await runStripSilenceSmoke()
          return
        }
        if (smokeTarget === 'track-write') {
          await runTrackWriteSmoke()
          return
        }
        if (smokeTarget === 'core-io-write') {
          await runCoreIoSmoke()
          return
        }
        await runWriteSmoke()
      } catch (_error) {
        // The per-capability panels already render structured errors.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [definitions, isSmokeMode, presto, smokeImportFolder, smokeTarget])

  return (
    <div style={developerConsoleShellStyle}>
      <div style={developerConsoleMainStyle}>
        <Panel
          title="Command Registry"
          muted={true}
          actions={<Badge tone="neutral">{visibleCapabilityCount} visible</Badge>}
          style={developerConsoleListPanelStyle}
        >
          <div style={developerConsoleRegistryHeaderStyle}>
            <div style={developerConsoleRegistrySearchStyle}>
              <Input
                aria-label="Search commands"
                placeholder="Search commands"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="developer-console-scrollless" style={developerConsoleListStyle}>
            {visibleDefinitions.length === 0 ? (
              <EmptyState
                title={catalogErrorText ? 'Capability metadata unavailable' : 'No commands match the current search'}
                description={
                  catalogErrorText
                    ? catalogErrorText
                    : 'Try another search term to inspect a different command.'
                }
              />
            ) : null}

            <div style={developerConsoleRegistryTreeStyle}>
              {visibleDefinitions.map((capability) => {
                const isActive = activeCapabilityId === capability.id

                return (
                  <button
                    key={capability.id}
                    type="button"
                    style={developerConsoleRegistryRowStyle(isActive)}
                    onClick={() => setActiveCapabilityId(capability.id)}
                  >
                    <span aria-hidden style={developerConsoleRegistryAccentStyle(isActive)} />
                    <span style={developerConsoleRegistryRowCopyStyle}>
                      <span style={developerConsoleRegistryRowTitleStyle}>{capability.id}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </Panel>

        <div className="developer-console-scrollless" style={developerConsoleInspectorStyle}>
          {activeCapability ? (
            <div style={developerConsoleInspectorPanelStyle}>
              <Panel
                eyebrow="Inspector"
                title="Summary"
                description={activeCapability.id}
                muted={true}
                style={developerConsoleInspectorSummaryCardStyle}
                actions={
                  <Badge tone={phaseTone(activeCapabilityState?.phase ?? 'idle')}>
                    {activeCapabilityState?.phase ?? 'idle'}
                  </Badge>
                }
              >
                <div className="developer-console-scrollless" style={developerConsoleInspectorCardBodyStyle}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <p style={developerConsoleInspectorCopyStyle}>
                      Select a command from the registry to inspect and execute it here.
                    </p>
                    <p style={developerConsoleInspectorTitleStyle}>{formatCapabilityTitle(activeCapability)}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Badge tone={statusTone(activeCapability.status)}>{activeCapability.status}</Badge>
                      <Badge tone={categoryTone(activeCapability.domain)}>{formatCategoryLabel(activeCapability.domain)}</Badge>
                      <Badge tone="neutral">Min DAW {activeCapability.minimumDawVersion}</Badge>
                      <Badge tone="neutral">
                        Canonical {formatDawTarget(activeCapability.canonicalSource)}
                      </Badge>
                      {CORE_IO_CAPABILITY_ID_SET.has(activeCapability.id) ? (
                        <Badge tone="brand">PTSL-backed core I/O producer</Badge>
                      ) : null}
                    </div>
                    <p style={developerConsoleInspectorCopyStyle}>{activeCapability.note}</p>
                    <p style={developerConsoleInspectorCopyStyle}>
                      Supported DAWs: {activeCapability.supportedDaws.map(formatDawTarget).join(', ')}
                    </p>
                    {activeCapabilityFieldSupport ? (
                      <p style={developerConsoleInspectorCopyStyle}>
                        Field support ({formatDawTarget(activeCapabilityFieldSupport.dawTarget)}): request [
                        {activeCapabilityFieldSupport.support.requestFields.join(', ') || 'none'}], response [
                        {activeCapabilityFieldSupport.support.responseFields.join(', ') || 'none'}]
                      </p>
                    ) : (
                      <p style={developerConsoleInspectorCopyStyle}>Field support: none declared.</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        variant={activeCapability.sideEffect ? 'danger' : 'primary'}
                        size="sm"
                        disabled={
                          !WRITE_STATUSES.has(activeCapability.status) ||
                          activeCapabilityState?.phase === 'running'
                        }
                        busy={activeCapabilityState?.phase === 'running'}
                        onClick={() => {
                          void executeCapability(activeCapability)
                        }}
                      >
                        {!WRITE_STATUSES.has(activeCapability.status) &&
                        activeCapabilityState?.phase !== 'running'
                          ? 'Unavailable'
                          : 'Execute'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel
                title="Payload"
                muted={true}
                style={developerConsoleInspectorPayloadCardStyle}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => resetPayloadToDefault(activeCapability)}
                  >
                    Reset to Default
                  </Button>
                }
              >
                <div style={developerConsoleInspectorPayloadBodyStyle}>
                  <Textarea
                    label="Payload JSON"
                    hint="Editable request payload"
                    value={activeCapabilityState?.payloadText ?? pretty(activeCapability.defaultPayload)}
                    onChange={(event) =>
                      updateState(activeCapability.id, (prev) => ({
                        ...prev,
                        payloadText: event.target.value,
                      }))
                    }
                    minHeight={240}
                  />
                </div>
              </Panel>

              <Panel title="Output" muted={true} style={developerConsoleInspectorOutputCardStyle}>
                <div className="developer-console-scrollless" style={developerConsoleInspectorCardBodyStyle}>
                  <div style={developerConsoleOutputSectionStyle}>
                    <div style={developerConsoleOutputHeaderStyle}>
                      <Badge tone="success">Result</Badge>
                    </div>
                        <JsonView
                          className="developer-console-output-surface"
                          title="Result"
                          tone="success"
                          value={activeCapabilityState?.resultText || 'No result yet.'}
                        />
                      </div>

                      <div style={developerConsoleOutputSectionStyle}>
                        <div style={developerConsoleOutputHeaderStyle}>
                          <Badge tone={activeCapabilityState?.errorText ? 'danger' : 'neutral'}>Error</Badge>
                        </div>
                        <JsonView
                          className="developer-console-output-surface"
                          title="Error"
                          tone="error"
                          value={activeCapabilityState?.errorText || 'No error.'}
                        />
                  </div>
                </div>
              </Panel>
            </div>
          ) : (
            <Panel
              eyebrow="Inspector"
              title="Select a command"
              description="Choose a capability from the left list to edit payload and review results."
              muted={true}
            >
              <div style={developerConsoleInspectorEmptyStyle}>
                <p style={developerConsoleInspectorTitleStyle}>Select a command</p>
                <p style={developerConsoleInspectorCopyStyle}>
                  The inspector stays fixed while the command registry on the left keeps its own scroll position.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
