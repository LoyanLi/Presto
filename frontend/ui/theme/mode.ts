import type { PrestoThemeMode } from './tokens'

export type PrestoThemePreference = 'system' | PrestoThemeMode

const STORAGE_KEY = 'presto.ui.theme.mode'
const THEME_ATTRIBUTE = 'data-presto-theme'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'
const listeners = new Set<(mode: PrestoThemeMode) => void>()
const preferenceListeners = new Set<(preference: PrestoThemePreference) => void>()
let preference: PrestoThemePreference | null = null
let effectiveMode: PrestoThemeMode | null = null
let systemMediaQueryList: MediaQueryList | null = null

function normalizePreference(value: unknown): PrestoThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }
  return 'system'
}

function readStoredPreference(): PrestoThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    return normalizePreference(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function resolveSystemMode(): PrestoThemeMode {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light'
  }

  if (systemMediaQueryList) {
    return systemMediaQueryList.matches ? 'dark' : 'light'
  }

  return 'light'
}

function resolveEffectiveMode(selectedPreference: PrestoThemePreference): PrestoThemeMode {
  if (selectedPreference === 'system') {
    return resolveSystemMode()
  }

  return selectedPreference
}

function applyThemeAttribute(mode: PrestoThemeMode): void {
  if (typeof document === 'undefined') {
    return
  }

  if (document.documentElement.dataset) {
    document.documentElement.dataset.prestoTheme = mode
  }
  if (typeof document.documentElement.setAttribute === 'function') {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, mode)
  }
}

function getThemePreferenceState(): PrestoThemePreference {
  if (preference === null) {
    preference = readStoredPreference()
  }

  return preference
}

function persistPreference(selectedPreference: PrestoThemePreference): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, selectedPreference)
  } catch {
    // Ignore storage write failures and keep runtime theme state.
  }
}

function emitModeIfChanged(nextMode: PrestoThemeMode): void {
  if (effectiveMode === nextMode) {
    return
  }

  effectiveMode = nextMode
  listeners.forEach((listener) => listener(nextMode))
}

function emitPreferenceIfChanged(nextPreference: PrestoThemePreference, previousPreference: PrestoThemePreference): void {
  if (nextPreference === previousPreference) {
    return
  }

  preferenceListeners.forEach((listener) => listener(nextPreference))
}

function recomputeEffectiveMode(options?: { notify?: boolean }): PrestoThemeMode {
  const nextMode = resolveEffectiveMode(getThemePreferenceState())
  applyThemeAttribute(nextMode)
  if (options?.notify) {
    emitModeIfChanged(nextMode)
  } else {
    effectiveMode = nextMode
  }
  return nextMode
}

function onSystemThemeChange(): void {
  if (getThemePreferenceState() !== 'system') {
    return
  }

  recomputeEffectiveMode({ notify: true })
}

function ensureSystemThemeSubscription(): void {
  if (systemMediaQueryList || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }

  systemMediaQueryList = window.matchMedia(SYSTEM_DARK_QUERY)
  if (typeof systemMediaQueryList.addEventListener === 'function') {
    systemMediaQueryList.addEventListener('change', onSystemThemeChange)
  } else if (typeof systemMediaQueryList.addListener === 'function') {
    systemMediaQueryList.addListener(onSystemThemeChange)
  }
}

export function getThemeMode(): PrestoThemeMode {
  ensureSystemThemeSubscription()
  return recomputeEffectiveMode()
}

export function getThemePreference(): PrestoThemePreference {
  ensureSystemThemeSubscription()
  return getThemePreferenceState()
}

function applyThemePreference(preferenceMode: PrestoThemePreference, options?: { persist?: boolean }): void {
  ensureSystemThemeSubscription()
  const previousPreference = getThemePreferenceState()
  preference = normalizePreference(preferenceMode)
  if (options?.persist ?? true) {
    persistPreference(preference)
  }
  emitPreferenceIfChanged(preference, previousPreference)
  recomputeEffectiveMode({ notify: true })
}

export function setThemePreference(preferenceMode: PrestoThemePreference, options?: { persist?: boolean }): void {
  applyThemePreference(preferenceMode, options)
}

export function setThemeMode(mode: PrestoThemeMode, options?: { persist?: boolean }): void {
  applyThemePreference(mode, options)
}

export function initThemeMode(_defaultMode?: PrestoThemeMode): PrestoThemeMode {
  ensureSystemThemeSubscription()
  return recomputeEffectiveMode()
}

export function subscribeThemeMode(listener: (mode: PrestoThemeMode) => void): () => void {
  ensureSystemThemeSubscription()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function subscribeThemePreference(
  listener: (preference: PrestoThemePreference) => void,
): () => void {
  ensureSystemThemeSubscription()
  preferenceListeners.add(listener)
  return () => {
    preferenceListeners.delete(listener)
  }
}
