function normalizeProgressNumber(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return numeric
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'completed_with_errors', 'cancelled'])
const etaStateByTask = new Map()

function toIsoSafe(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return null
  }
  return new Date(ms).toISOString()
}

function estimateEtaSeconds(source, nowMs) {
  const status = String(source.status || '').toLowerCase()
  const currentSnapshot = Math.max(0, Math.trunc(normalizeProgressNumber(source.current_snapshot, 0)))
  if (TERMINAL_STATUSES.has(status)) {
    return null
  }
  if ((status === 'running' || status === 'pending') && currentSnapshot <= 1) {
    return null
  }

  const directEta = normalizeProgressNumber(source.eta_seconds, NaN)
  if (Number.isFinite(directEta) && directEta > 0) {
    return Math.max(1, Math.round(directEta))
  }

  const progress = Math.max(0, Math.min(100, normalizeProgressNumber(source.progress, 0)))
  if (progress <= 0 || progress >= 100) {
    return null
  }

  const startedAtRaw = typeof source.started_at === 'string' ? source.started_at : typeof source.created_at === 'string' ? source.created_at : null
  if (!startedAtRaw) {
    return null
  }

  const startedAtMs = Date.parse(startedAtRaw)
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0 || nowMs <= startedAtMs) {
    return null
  }

  const elapsedSeconds = (nowMs - startedAtMs) / 1000
  const estimatedTotalSeconds = elapsedSeconds / (progress / 100)
  const remaining = Math.max(0, estimatedTotalSeconds - elapsedSeconds)
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return null
  }

  return Math.max(1, Math.round(remaining))
}

function resolveEtaWithStickyTarget(taskKey, status, snapshot, progress, rawEtaSeconds, nowMs) {
  if (rawEtaSeconds == null) {
    if (taskKey) {
      etaStateByTask.delete(taskKey)
    }
    return { etaSeconds: null, etaTargetAt: null }
  }

  if (!taskKey) {
    const etaTargetAt = toIsoSafe(nowMs + rawEtaSeconds * 1000)
    return { etaSeconds: rawEtaSeconds, etaTargetAt }
  }

  const normalizedStatus = String(status || '').toLowerCase()
  if (TERMINAL_STATUSES.has(normalizedStatus)) {
    etaStateByTask.delete(taskKey)
    return { etaSeconds: null, etaTargetAt: null }
  }

  const previous = etaStateByTask.get(taskKey) || null
  const progressAdvanced =
    !previous ||
    snapshot > previous.snapshot ||
    progress > previous.progress + 0.01 ||
    normalizedStatus !== previous.status

  const suggestedTargetAtMs = nowMs + rawEtaSeconds * 1000
  let targetAtMs = suggestedTargetAtMs

  if (previous && !progressAdvanced) {
    targetAtMs = previous.targetAtMs
    if (suggestedTargetAtMs < targetAtMs - 1000) {
      targetAtMs = suggestedTargetAtMs
    }
  }

  const remainingSeconds = Math.max(0, Math.round((targetAtMs - nowMs) / 1000))
  etaStateByTask.set(taskKey, {
    status: normalizedStatus,
    snapshot,
    progress,
    targetAtMs,
  })

  return {
    etaSeconds: remainingSeconds,
    etaTargetAt: toIsoSafe(targetAtMs),
  }
}

export function mapExportProgressForMobile(rawResponse, nowIso = new Date().toISOString()) {
  const source =
    rawResponse &&
    typeof rawResponse === 'object' &&
    rawResponse.data &&
    typeof rawResponse.data === 'object'
      ? rawResponse.data
      : {}

  const nowMs = Date.parse(nowIso)
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now()
  const status = String(source.status || 'unknown')
  const progress = Math.max(0, Math.min(100, normalizeProgressNumber(source.progress, 0)))
  const currentSnapshot = Math.max(0, Math.trunc(normalizeProgressNumber(source.current_snapshot, 0)))
  const rawEtaSeconds = estimateEtaSeconds(source, safeNowMs)
  const taskKey = typeof source.task_id === 'string' && source.task_id.trim().length > 0 ? source.task_id.trim() : null
  const stickyEta = resolveEtaWithStickyTarget(taskKey, status, currentSnapshot, progress, rawEtaSeconds, safeNowMs)

  return {
    status,
    progress,
    current_snapshot: currentSnapshot,
    total_snapshots: Math.max(0, Math.trunc(normalizeProgressNumber(source.total_snapshots, 0))),
    current_snapshot_name: typeof source.current_snapshot_name === 'string' ? source.current_snapshot_name : '',
    updated_at: new Date(safeNowMs).toISOString(),
    eta_seconds: stickyEta.etaSeconds,
    eta_target_at: stickyEta.etaTargetAt,
  }
}

export function __resetMobileProgressEtaStateForTest() {
  etaStateByTask.clear()
}
