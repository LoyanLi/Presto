export function formatBitDepthLabel(bitDepth?: number): string {
  if (bitDepth === undefined || Number.isNaN(bitDepth)) {
    return 'Unknown'
  }

  const normalizedDepth = Math.trunc(bitDepth)
  if (normalizedDepth <= 0) {
    return 'Unknown'
  }

  if (normalizedDepth === 32) {
    return '32-bit float'
  }

  return `${normalizedDepth}-bit`
}
