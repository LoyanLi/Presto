export interface HostRunMetricRecord {
  count: number
  lastUsedAt: string
  label?: string
}

export interface HostRunMetricsSnapshot {
  version: 3
  workflows: Record<string, HostRunMetricRecord>
  automations: Record<string, HostRunMetricRecord>
  tools: Record<string, HostRunMetricRecord>
  commands: Record<string, HostRunMetricRecord>
  processedWorkflowJobs: Record<string, string>
  processedToolJobs: Record<string, string>
}

export interface HostRunMetricListItem extends HostRunMetricRecord {
  key: string
}

export interface HostRunMetricsSummary {
  totals: {
    workflowRuns: number
    automationRuns: number
    toolRuns: number
    commandRuns: number
  }
  topWorkflow: HostRunMetricListItem | null
  topAutomation: HostRunMetricListItem | null
  topTool: HostRunMetricListItem | null
  topCommand: HostRunMetricListItem | null
  workflows: HostRunMetricListItem[]
  automations: HostRunMetricListItem[]
  tools: HostRunMetricListItem[]
  commands: HostRunMetricListItem[]
}

export const HOST_RUN_METRICS_STORAGE_KEY = 'presto.host.run-metrics.v3'

type HostRunMetricBucket = keyof Pick<HostRunMetricsSnapshot, 'workflows' | 'automations' | 'tools' | 'commands'>

const listeners = new Set<() => void>()

let hydrated = false
let currentSnapshot: HostRunMetricsSnapshot = createEmptyHostRunMetricsSnapshot()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null
  }

  return globalThis.localStorage ?? null
}

function normalizeMetricRecord(value: unknown): HostRunMetricRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const count = value.count
  const lastUsedAt = value.lastUsedAt
  if (!Number.isFinite(count) || typeof lastUsedAt !== 'string' || lastUsedAt.trim().length === 0) {
    return null
  }

  const label = typeof value.label === 'string' && value.label.trim().length > 0 ? value.label : undefined
  return {
    count: Math.max(0, Math.trunc(count)),
    lastUsedAt,
    ...(label ? { label } : {}),
  }
}

function normalizeMetricBucket(value: unknown): Record<string, HostRunMetricRecord> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const normalized = normalizeMetricRecord(entry)
      return normalized ? [[key, normalized]] : []
    }),
  )
}

function normalizeProcessedWorkflowJobs(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([jobId, processedAt]) =>
      typeof processedAt === 'string' && processedAt.trim().length > 0 ? [[jobId, processedAt]] : [],
    ),
  )
}

function normalizeProcessedToolJobs(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([jobId, processedAt]) =>
      typeof processedAt === 'string' && processedAt.trim().length > 0 ? [[jobId, processedAt]] : [],
    ),
  )
}

function readStoredSnapshot(): HostRunMetricsSnapshot {
  const storage = getStorage()
  if (!storage) {
    return createEmptyHostRunMetricsSnapshot()
  }

  try {
    const raw = storage.getItem(HOST_RUN_METRICS_STORAGE_KEY)
    if (!raw) {
      return createEmptyHostRunMetricsSnapshot()
    }

    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 3) {
      return createEmptyHostRunMetricsSnapshot()
    }

    return {
      version: 3,
      workflows: normalizeMetricBucket(parsed.workflows),
      automations: normalizeMetricBucket(parsed.automations),
      tools: normalizeMetricBucket(parsed.tools),
      commands: normalizeMetricBucket(parsed.commands),
      processedWorkflowJobs: normalizeProcessedWorkflowJobs(parsed.processedWorkflowJobs),
      processedToolJobs: normalizeProcessedToolJobs(parsed.processedToolJobs),
    }
  } catch {
    return createEmptyHostRunMetricsSnapshot()
  }
}

function persistSnapshot(snapshot: HostRunMetricsSnapshot): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(HOST_RUN_METRICS_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore storage write failures and keep in-memory state consistent.
  }
}

function ensureHydrated(): void {
  if (hydrated) {
    return
  }

  currentSnapshot = readStoredSnapshot()
  hydrated = true
}

function emitChange(): void {
  listeners.forEach((listener) => listener())
}

function updateSnapshot(
  updater: (snapshot: HostRunMetricsSnapshot) => HostRunMetricsSnapshot,
): HostRunMetricsSnapshot {
  ensureHydrated()
  const nextSnapshot = updater(currentSnapshot)
  if (nextSnapshot === currentSnapshot) {
    return currentSnapshot
  }

  currentSnapshot = nextSnapshot
  persistSnapshot(currentSnapshot)
  emitChange()
  return currentSnapshot
}

function updateBucket(
  snapshot: HostRunMetricsSnapshot,
  bucket: HostRunMetricBucket,
  key: string,
  label: string | undefined,
  at: string,
  count = 1,
): HostRunMetricsSnapshot {
  const normalizedKey = key.trim()
  if (normalizedKey.length === 0 || !Number.isFinite(count)) {
    return snapshot
  }

  const increment = Math.max(0, Math.trunc(count))
  if (increment === 0) {
    return snapshot
  }

  const previous = snapshot[bucket][normalizedKey]
  const nextRecord: HostRunMetricRecord = {
    count: (previous?.count ?? 0) + increment,
    lastUsedAt: at,
  }

  if (label && label.trim().length > 0) {
    nextRecord.label = label
  } else if (previous?.label) {
    nextRecord.label = previous.label
  }

  return {
    ...snapshot,
    [bucket]: {
      ...snapshot[bucket],
      [normalizedKey]: nextRecord,
    },
  }
}

function sumCounts(bucket: Record<string, HostRunMetricRecord>): number {
  return Object.values(bucket).reduce((total, entry) => total + entry.count, 0)
}

function sortBucket(bucket: Record<string, HostRunMetricRecord>): HostRunMetricListItem[] {
  return Object.entries(bucket)
    .map(([key, value]) => ({
      key,
      ...value,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.lastUsedAt.localeCompare(left.lastUsedAt) ||
        left.key.localeCompare(right.key),
    )
}

export function createEmptyHostRunMetricsSnapshot(): HostRunMetricsSnapshot {
  return {
    version: 3,
    workflows: {},
    automations: {},
    tools: {},
    commands: {},
    processedWorkflowJobs: {},
    processedToolJobs: {},
  }
}

export function hydrateHostRunMetricsState(): HostRunMetricsSnapshot {
  ensureHydrated()
  return currentSnapshot
}

export function getHostRunMetricsSnapshot(): HostRunMetricsSnapshot {
  ensureHydrated()
  return currentSnapshot
}

export function subscribeHostRunMetrics(listener: () => void): () => void {
  ensureHydrated()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function recordWorkflowRunSuccess({
  workflowId,
  label,
  at = new Date().toISOString(),
}: {
  workflowId: string
  label?: string
  at?: string
}): HostRunMetricsSnapshot {
  return updateSnapshot((snapshot) => updateBucket(snapshot, 'workflows', workflowId, label, at))
}

export function recordAutomationRunSuccess({
  automationKey,
  label,
  at = new Date().toISOString(),
}: {
  automationKey: string
  label?: string
  at?: string
}): HostRunMetricsSnapshot {
  return updateSnapshot((snapshot) => updateBucket(snapshot, 'automations', automationKey, label, at))
}

export function recordCommandRunSuccess({
  capabilityId,
  at = new Date().toISOString(),
}: {
  capabilityId: string
  at?: string
}): HostRunMetricsSnapshot {
  return updateSnapshot((snapshot) => updateBucket(snapshot, 'commands', capabilityId, undefined, at))
}

export function recordToolRunSuccess({
  toolKey,
  label,
  jobId,
  at = new Date().toISOString(),
}: {
  toolKey: string
  label?: string
  jobId?: string
  at?: string
}): HostRunMetricsSnapshot {
  return updateSnapshot((snapshot) => {
    const normalizedJobId = typeof jobId === 'string' ? jobId.trim() : ''
    const normalizedToolKey = toolKey.trim()
    if (normalizedToolKey.length === 0 || (normalizedJobId.length > 0 && snapshot.processedToolJobs[normalizedJobId])) {
      return snapshot
    }

    const nextSnapshot = updateBucket(snapshot, 'tools', normalizedToolKey, label, at)
    if (normalizedJobId.length === 0) {
      return nextSnapshot
    }

    return {
      ...nextSnapshot,
      processedToolJobs: {
        ...nextSnapshot.processedToolJobs,
        [normalizedJobId]: at,
      },
    }
  })
}

export function recordWorkflowJobSuccess({
  jobId,
  workflowId,
  label,
  commandCounts,
  at = new Date().toISOString(),
}: {
  jobId: string
  workflowId: string
  label?: string
  commandCounts?: Record<string, number>
  at?: string
}): HostRunMetricsSnapshot {
  return updateSnapshot((snapshot) => {
    const normalizedJobId = jobId.trim()
    const normalizedWorkflowId = workflowId.trim()
    if (normalizedJobId.length === 0 || normalizedWorkflowId.length === 0 || snapshot.processedWorkflowJobs[normalizedJobId]) {
      return snapshot
    }

    let nextSnapshot = updateBucket(snapshot, 'workflows', normalizedWorkflowId, label, at)
    for (const [capabilityId, count] of Object.entries(commandCounts ?? {})) {
      nextSnapshot = updateBucket(nextSnapshot, 'commands', capabilityId, undefined, at, count)
    }

    return {
      ...nextSnapshot,
      processedWorkflowJobs: {
        ...nextSnapshot.processedWorkflowJobs,
        [normalizedJobId]: at,
      },
    }
  })
}

export function createHostRunMetricsSummary(
  snapshot: HostRunMetricsSnapshot = getHostRunMetricsSnapshot(),
): HostRunMetricsSummary {
  const workflows = sortBucket(snapshot.workflows)
  const automations = sortBucket(snapshot.automations)
  const tools = sortBucket(snapshot.tools)
  const commands = sortBucket(snapshot.commands)

  return {
    totals: {
      workflowRuns: sumCounts(snapshot.workflows),
      automationRuns: sumCounts(snapshot.automations),
      toolRuns: sumCounts(snapshot.tools),
      commandRuns: sumCounts(snapshot.commands),
    },
    topWorkflow: workflows[0] ?? null,
    topAutomation: automations[0] ?? null,
    topTool: tools[0] ?? null,
    topCommand: commands[0] ?? null,
    workflows,
    automations,
    tools,
    commands,
  }
}

export function resetHostRunMetricsForTesting(): void {
  hydrated = false
  currentSnapshot = createEmptyHostRunMetricsSnapshot()
  listeners.clear()
}
