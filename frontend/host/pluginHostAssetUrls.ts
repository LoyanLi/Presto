import { convertFileSrc, isTauri } from '@tauri-apps/api/core'

function encodeTauriAssetPath(pathValue: string): string {
  const normalizedPath = pathValue.replace(/\\/g, '/')
  const hasLeadingSlash = normalizedPath.startsWith('/')
  const segments = normalizedPath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment))

  if (!hasLeadingSlash) {
    return `/${segments.join('/')}`
  }

  const [firstSegment = '', ...remainingSegments] = segments
  const encodedRootedFirstSegment = encodeURIComponent(`/${decodeURIComponent(firstSegment)}`)
  return `/${[encodedRootedFirstSegment, ...remainingSegments].join('/')}`
}

function isAbsoluteUrl(pathValue: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(pathValue)
}

export function toRuntimeAssetUrl(pathValue: string): string {
  if (isAbsoluteUrl(pathValue)) {
    return pathValue
  }

  if (isTauri()) {
    return convertFileSrc(pathValue)
  }

  return new URL(pathValue, 'file://').href
}

export function toRuntimeModuleUrl(pathValue: string): string {
  if (isAbsoluteUrl(pathValue)) {
    return pathValue
  }

  if (isTauri()) {
    const runtimeAssetUrl = convertFileSrc(pathValue)
    return new URL(encodeTauriAssetPath(pathValue), runtimeAssetUrl).href
  }

  return new URL(pathValue, 'file://').href
}
