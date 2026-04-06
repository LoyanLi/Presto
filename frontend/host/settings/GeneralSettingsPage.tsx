import { useState, type CSSProperties } from 'react'
import type { DawTarget } from '@presto/contracts'
import type { AppLatestReleaseInfo, AppViewLogResult } from '@presto/sdk-runtime/clients/app'

import { Select, Switch, type PrestoThemePreference } from '../../ui'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostShellPreferences } from '../shellPreferences'

const stackStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
}

const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 18,
  fontWeight: 600,
}

const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const actionButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 999,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surface,
  color: hostShellColors.text,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

export interface GeneralSettingsPageProps {
  locale: HostLocale
  preferences: HostShellPreferences
  themePreference: PrestoThemePreference
  appVersion: string
  latestRelease: AppLatestReleaseInfo | null
  checkingUpdate: boolean
  updateError: string
  hasNewRelease: boolean
  dawStatus: {
    connected: boolean
    targetLabel: string
    sessionName: string
    statusLabel: string
    lastError: string
  }
  checkingConnection: boolean
  runtime?: {
    app?: {
      viewLog(): Promise<AppViewLogResult>
    }
  }
  onDeveloperModeChange(selected: boolean): void
  onThemePreferenceChange(preference: PrestoThemePreference): void
  onLanguageChange(language: HostShellPreferences['language']): void
  onDawTargetChange(target: DawTarget): void
  onCheckConnection(): void
  onCheckForUpdates(): void
  onOpenReleasePage(): void
  onIncludePrereleaseUpdatesChange(selected: boolean): void
}

export function GeneralSettingsPage({
  locale,
  preferences,
  themePreference,
  appVersion,
  latestRelease,
  checkingUpdate,
  updateError,
  hasNewRelease,
  dawStatus,
  checkingConnection,
  runtime,
  onDeveloperModeChange,
  onThemePreferenceChange,
  onLanguageChange,
  onDawTargetChange,
  onCheckConnection,
  onCheckForUpdates,
  onOpenReleasePage,
  onIncludePrereleaseUpdatesChange,
}: GeneralSettingsPageProps) {
  const [viewLogError, setViewLogError] = useState('')

  const viewLog = async (): Promise<void> => {
    if (!runtime?.app?.viewLog) {
      return
    }

    try {
      setViewLogError('')
      await runtime.app.viewLog()
    } catch (error) {
      setViewLogError(error instanceof Error ? error.message : String(error))
    }
  }

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
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.daw')}</h2>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={sectionDescriptionStyle}>{translateHost(locale, 'general.adapter')}</span>
          <Select
            aria-label="DAW"
            value={preferences.dawTarget}
            onChange={(event) => onDawTargetChange(event.target.value as DawTarget)}
            options={[
              { value: 'pro_tools', label: 'Pro Tools' },
            ]}
          />
        </label>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <p style={{ ...sectionDescriptionStyle, margin: 0 }}>{translateHost(locale, 'general.status')}</p>
              <p
                style={{
                  margin: 0,
                  color: dawStatus.connected ? hostShellColors.successText : hostShellColors.errorText,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {dawStatus.statusLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onCheckConnection}
              style={actionButtonStyle}
            >
              {checkingConnection ? translateHost(locale, 'general.checking') : translateHost(locale, 'general.checkConnection')}
            </button>
          </div>
          <p style={sectionDescriptionStyle}>
            {dawStatus.sessionName
              ? translateHost(locale, 'general.session.value', { name: dawStatus.sessionName })
              : translateHost(locale, 'general.session.none')}
          </p>
          {dawStatus.lastError ? <p style={{ ...sectionDescriptionStyle, color: hostShellColors.errorText }}>{dawStatus.lastError}</p> : null}
        </div>
      </section>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'settings.update.title')}</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={sectionDescriptionStyle}>
            {translateHost(locale, 'settings.update.currentVersion', { value: appVersion })}
          </p>
          <p style={sectionDescriptionStyle}>
            {translateHost(locale, 'settings.update.latestVersion', {
              value: latestRelease?.tagName || translateHost(locale, 'settings.update.notChecked'),
            })}
          </p>
          <Switch
            label={translateHost(locale, 'settings.update.includePrerelease')}
            description={translateHost(locale, 'settings.update.includePrereleaseBody')}
            selected={preferences.includePrereleaseUpdates}
            onSelectedChange={onIncludePrereleaseUpdatesChange}
          />
          {latestRelease ? (
            <p
              style={{
                ...sectionDescriptionStyle,
                color: hasNewRelease ? hostShellColors.successText : hostShellColors.textMuted,
                fontWeight: 600,
              }}
            >
              {hasNewRelease
                ? translateHost(locale, 'settings.update.available', { value: latestRelease.tagName })
                : translateHost(locale, 'settings.update.upToDate')}
            </p>
          ) : null}
          {updateError ? (
            <p style={{ ...sectionDescriptionStyle, color: hostShellColors.errorText }}>
              {translateHost(locale, 'settings.update.failed', { value: updateError })}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => void onCheckForUpdates()}
              disabled={checkingUpdate}
              style={actionButtonStyle}
            >
              {checkingUpdate ? translateHost(locale, 'settings.update.checking') : translateHost(locale, 'settings.update.check')}
            </button>
            {latestRelease?.htmlUrl ? (
              <button
                type="button"
                onClick={() => void onOpenReleasePage()}
                style={actionButtonStyle}
              >
                {translateHost(locale, 'settings.update.openRelease')}
              </button>
            ) : null}
          </div>
        </div>
      </section>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'settings.logs.title')}</h2>
        <p style={sectionDescriptionStyle}>{translateHost(locale, 'settings.logs.body')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => void viewLog()}
            disabled={!runtime?.app?.viewLog}
            style={actionButtonStyle}
          >
            {translateHost(locale, 'settings.logs.view')}
          </button>
        </div>
        {viewLogError ? (
          <p style={{ ...sectionDescriptionStyle, color: hostShellColors.errorText }}>
            {translateHost(locale, 'settings.logs.viewFailed', { value: viewLogError })}
          </p>
        ) : null}
      </section>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.developer')}</h2>
        <p style={sectionDescriptionStyle}>
          {translateHost(locale, 'general.developer.body')}
        </p>
        <Switch
          label={translateHost(locale, 'general.developer.toggle')}
          description={translateHost(locale, 'general.developer.toggleBody')}
          selected={preferences.developerMode}
          onSelectedChange={onDeveloperModeChange}
        />
      </section>
    </div>
  )
}
