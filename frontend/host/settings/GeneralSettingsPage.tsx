import type { CSSProperties } from 'react'

import { Select, Switch, type PrestoThemePreference } from '../../ui'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostShellPreferences } from '../shellPreferences'
import { sectionDescriptionStyle, sectionStyle, sectionTitleStyle, stackStyle } from './pageStyles'

export interface GeneralSettingsPageProps {
  locale: HostLocale
  preferences: HostShellPreferences
  themePreference: PrestoThemePreference
  onThemePreferenceChange(preference: PrestoThemePreference): void
  onLanguageChange(language: HostShellPreferences['language']): void
}

export function GeneralSettingsPage({
  locale,
  preferences,
  themePreference,
  onThemePreferenceChange,
  onLanguageChange,
}: GeneralSettingsPageProps) {
  return (
    <div style={stackStyle}>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.theme')}</h2>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={sectionDescriptionStyle}>{translateHost(locale, 'general.theme')}</span>
          <Select
            aria-label={translateHost(locale, 'general.theme')}
            value={themePreference}
            onChange={(event) => onThemePreferenceChange(event.target.value as PrestoThemePreference)}
            options={[
              { value: 'system', label: translateHost(locale, 'general.theme.system') },
              { value: 'light', label: translateHost(locale, 'general.theme.light') },
              { value: 'dark', label: translateHost(locale, 'general.theme.dark') },
            ]}
          />
        </label>
      </section>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.language')}</h2>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={sectionDescriptionStyle}>{translateHost(locale, 'general.language')}</span>
          <Select
            aria-label={translateHost(locale, 'general.language')}
            value={preferences.language}
            onChange={(event) => onLanguageChange(event.target.value as HostShellPreferences['language'])}
            options={[
              { value: 'system', label: translateHost(locale, 'general.language.followSystem') },
              { value: 'zh-CN', label: translateHost(locale, 'general.language.zh-CN') },
              { value: 'en', label: translateHost(locale, 'general.language.en') },
            ]}
          />
        </label>
      </section>
    </div>
  )
}
