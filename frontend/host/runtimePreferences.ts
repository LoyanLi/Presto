import type { AppConfig } from '@presto/contracts'
import type { HostShellPreferences } from './shellPreferences'

export function getHostShellPreferencesFromConfig(config: Pick<AppConfig, 'uiPreferences' | 'hostPreferences'>): HostShellPreferences {
  return {
    language:
      config.hostPreferences?.language === 'zh-CN' || config.hostPreferences?.language === 'en'
        ? config.hostPreferences.language
        : 'system',
    developerMode: config.uiPreferences?.developerModeEnabled === true,
    dawTarget: config.hostPreferences?.dawTarget === 'pro_tools' ? config.hostPreferences.dawTarget : 'pro_tools',
  }
}

export function applyHostShellPreferencesToConfig(
  config: AppConfig,
  preferences: HostShellPreferences,
): AppConfig {
  return {
    ...config,
    uiPreferences: {
      ...config.uiPreferences,
      developerModeEnabled: preferences.developerMode,
    },
    hostPreferences: {
      ...config.hostPreferences,
      language: preferences.language,
      dawTarget: preferences.dawTarget,
    },
  }
}
