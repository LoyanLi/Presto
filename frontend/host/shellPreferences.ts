import type { DawTarget } from '@presto/contracts'
import type { HostLanguagePreference } from './i18n'

export type HostShellLanguage = HostLanguagePreference

export interface HostShellPreferences {
  language: HostShellLanguage
  developerMode: boolean
  dawTarget: DawTarget
}

const STORAGE_KEY = 'presto.host.shell.preferences'
const listeners = new Set<(preferences: HostShellPreferences) => void>()

const defaultPreferences: HostShellPreferences = {
  language: 'system',
  developerMode: false,
  dawTarget: 'pro_tools',
}

function normalizePreferences(value: unknown): HostShellPreferences {
  const candidate = value && typeof value === 'object' ? (value as Partial<HostShellPreferences>) : {}

  return {
    language:
      candidate.language === 'system' || candidate.language === 'zh-CN' || candidate.language === 'en'
        ? candidate.language
        : 'system',
    developerMode: candidate.developerMode === true,
    dawTarget: candidate.dawTarget === 'pro_tools' ? 'pro_tools' : 'pro_tools',
  }
}

export function getHostShellPreferences(): HostShellPreferences {
  if (typeof window === 'undefined') {
    return defaultPreferences
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return defaultPreferences
  }

  try {
    return normalizePreferences(JSON.parse(raw))
  } catch {
    return defaultPreferences
  }
}

export function setHostShellPreferences(
  nextPreferences: Partial<HostShellPreferences>,
  options?: { persist?: boolean },
): HostShellPreferences {
  const resolved = normalizePreferences({
    ...getHostShellPreferences(),
    ...nextPreferences,
  })

  if ((options?.persist ?? true) && typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved))
  }

  listeners.forEach((listener) => listener(resolved))
  return resolved
}

export function subscribeHostShellPreferences(
  listener: (preferences: HostShellPreferences) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
