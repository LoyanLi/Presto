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

function getStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  const candidate =
    globalThis.localStorage ??
    (typeof window !== 'undefined' ? window.localStorage : undefined)
  if (
    candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function'
  ) {
    return candidate
  }

  return null
}

function getMatchMedia():
  | ((query: string) => Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener' | 'addListener' | 'removeListener'>)
  | null {
  if (typeof globalThis.matchMedia === 'function') {
    return globalThis.matchMedia.bind(globalThis)
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia.bind(window)
  }
  return null
}

function getThemeDocument(): Document | null {
  const candidate =
    globalThis.document ??
    (typeof window !== 'undefined' ? window.document : undefined)
  if (candidate?.documentElement) {
    return candidate
  }

  return null
}

function normalizePreference(value: unknown): PrestoThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }
  return 'system'
}

function readStoredPreference(): PrestoThemePreference {
  const storage = getStorage()
  if (!storage) {
    return 'system'
  }

  try {
    return normalizePreference(storage.getItem(STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function resolveSystemMode(): PrestoThemeMode {
  const matchMedia = getMatchMedia()
  if (matchMedia) {
    return matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light'
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
  const documentValue = getThemeDocument()
  if (!documentValue) {
    return
  }

  if (documentValue.documentElement.dataset) {
    documentValue.documentElement.dataset.prestoTheme = mode
  }
  if (typeof documentValue.documentElement.setAttribute === 'function') {
    documentValue.documentElement.setAttribute(THEME_ATTRIBUTE, mode)
  }
}

function getThemePreferenceState(): PrestoThemePreference {
  if (preference === null) {
    preference = readStoredPreference()
  }

  return preference
}

function persistPreference(selectedPreference: PrestoThemePreference): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(STORAGE_KEY, selectedPreference)
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
  const matchMedia = getMatchMedia()
  if (systemMediaQueryList || !matchMedia) {
    return
  }

  systemMediaQueryList = matchMedia(SYSTEM_DARK_QUERY)
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
