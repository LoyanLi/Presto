export function formatVersionLabel(version: string | null | undefined): string {
  const normalized = String(version || '').trim()
  return normalized.replace(/^[vV](?=\d)/, '')
}
