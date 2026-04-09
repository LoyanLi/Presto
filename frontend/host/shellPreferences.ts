import { SUPPORTED_DAW_TARGETS, isSupportedDawTarget, type SupportedDawTarget } from '@presto/contracts'
import type { HostLanguagePreference } from './i18n'

export type HostShellLanguage = HostLanguagePreference

export interface HostShellPreferences {
  language: HostShellLanguage
  developerMode: boolean
  dawTarget: SupportedDawTarget
  includePrereleaseUpdates: boolean
}

const listeners = new Set<(preferences: HostShellPreferences) => void>()

const defaultPreferences: HostShellPreferences = {
  language: 'system',
  developerMode: true,
  dawTarget: SUPPORTED_DAW_TARGETS[0],
  includePrereleaseUpdates: false,
}

let currentPreferences: HostShellPreferences = defaultPreferences

function normalizePreferences(value: unknown): HostShellPreferences {
  const candidate = value && typeof value === 'object' ? (value as Partial<HostShellPreferences>) : {}

  return {
    language:
      candidate.language === 'system' || candidate.language === 'zh-CN' || candidate.language === 'en'
        ? candidate.language
        : 'system',
    developerMode: candidate.developerMode === true,
    dawTarget: isSupportedDawTarget(candidate.dawTarget) ? candidate.dawTarget : defaultPreferences.dawTarget,
    includePrereleaseUpdates: candidate.includePrereleaseUpdates === true,
  }
}

export function getHostShellPreferences(): HostShellPreferences {
  return currentPreferences
}

export function hydrateHostShellPreferences(nextPreferences: Partial<HostShellPreferences>): HostShellPreferences {
  currentPreferences = normalizePreferences({
    ...defaultPreferences,
    ...nextPreferences,
  })
  listeners.forEach((listener) => listener(currentPreferences))
  return currentPreferences
}

export function setHostShellPreferences(nextPreferences: Partial<HostShellPreferences>): HostShellPreferences {
  currentPreferences = normalizePreferences({
    ...currentPreferences,
    ...nextPreferences,
  })
  listeners.forEach((listener) => listener(currentPreferences))
  return currentPreferences
}

export function subscribeHostShellPreferences(
  listener: (preferences: HostShellPreferences) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetHostShellPreferencesForTesting(): void {
  currentPreferences = defaultPreferences
  listeners.clear()
}
