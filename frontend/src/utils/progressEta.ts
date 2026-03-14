export function smoothProgress(previous: number, next: number): number {
  const prev = Number.isFinite(previous) ? previous : 0
  const nxt = Number.isFinite(next) ? next : 0
  const clamped = Math.max(0, Math.min(100, nxt))
  return Math.max(prev, clamped)
}

export function estimateEtaFromProgress(
  startedAt: string | null | undefined,
  progress: number,
  minProgressForEta = 5,
): number | null {
  if (!startedAt) {
    return null
  }
  const safeProgress = Math.max(0, Math.min(100, progress))
  if (safeProgress < minProgressForEta || safeProgress >= 100) {
    return null
  }
  const started = new Date(startedAt).getTime()
  if (!Number.isFinite(started) || started <= 0) {
    return null
  }
  const elapsedSeconds = Math.max(0, (Date.now() - started) / 1000)
  if (elapsedSeconds <= 0) {
    return null
  }
  const eta = (elapsedSeconds * (100 - safeProgress)) / safeProgress
  if (!Number.isFinite(eta) || eta < 0) {
    return null
  }
  return Math.round(Math.min(eta, 24 * 60 * 60))
}

export function formatEtaLabel(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '--'
  }
  const total = Math.round(seconds)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  if (hh > 0) {
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
