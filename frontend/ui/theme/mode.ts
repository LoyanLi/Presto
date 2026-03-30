import type { PrestoThemeMode } from './tokens'

const STORAGE_KEY = 'presto.ui.theme.mode'
const THEME_ATTRIBUTE = 'data-presto-theme'
const listeners = new Set<(mode: PrestoThemeMode) => void>()

function resolvePreferredMode(): PrestoThemeMode {
  return 'light'
}

function normalizeMode(value: unknown): PrestoThemeMode {
  return 'light'
}

export function getThemeMode(): PrestoThemeMode {
  const resolved = resolvePreferredMode()

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved)
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, resolved)
  }

  return resolved
}

export function setThemeMode(mode: PrestoThemeMode, options?: { persist?: boolean }): void {
  const resolved = normalizeMode(mode)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved)
  }
  if ((options?.persist ?? true) && typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, resolved)
  }
  listeners.forEach((listener) => listener(resolved))
}

export function initThemeMode(defaultMode?: PrestoThemeMode): PrestoThemeMode {
  const nextMode = normalizeMode(defaultMode ?? getThemeMode())
  setThemeMode(nextMode, { persist: false })
  return nextMode
}

export function subscribeThemeMode(listener: (mode: PrestoThemeMode) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
