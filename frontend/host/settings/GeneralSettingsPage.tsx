import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { DawTarget } from '@presto/contracts'
import type { AppViewLogResult } from '@presto/sdk-runtime/clients/app'

import { Switch } from '../../ui'
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
      getVersion(): Promise<string>
      getLatestRelease(): Promise<{
        repo: string
        tagName: string
        name: string
        htmlUrl: string
        publishedAt: string
        prerelease: boolean
        draft: boolean
      }>
      viewLog(): Promise<AppViewLogResult>
    }
    shell?: {
      openExternal(url: string): Promise<boolean>
    }
  }
  onDeveloperModeChange(selected: boolean): void
  onLanguageChange(language: HostShellPreferences['language']): void
  onDawTargetChange(target: DawTarget): void
  onCheckConnection(): void
}

type LatestReleaseInfo = {
  repo: string
  tagName: string
  name: string
  htmlUrl: string
  publishedAt: string
  prerelease: boolean
  draft: boolean
}

function normalizeVersion(raw: string): string {
  return String(raw || '').trim().replace(/^v/i, '').split('-')[0]
}

function isLatestVersionNewer(currentRaw: string, latestRaw: string): boolean {
  const currentParts = normalizeVersion(currentRaw)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
  const latestParts = normalizeVersion(latestRaw)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

  const maxLen = Math.max(currentParts.length, latestParts.length, 3)
  for (let index = 0; index < maxLen; index += 1) {
    const current = currentParts[index] || 0
    const latest = latestParts[index] || 0
    if (latest > current) return true
    if (latest < current) return false
  }

  return false
}

export function GeneralSettingsPage({
  locale,
  preferences,
  dawStatus,
  checkingConnection,
  runtime,
  onDeveloperModeChange,
  onLanguageChange,
  onDawTargetChange,
  onCheckConnection,
}: GeneralSettingsPageProps) {
  const [appVersion, setAppVersion] = useState('-')
  const [latestRelease, setLatestRelease] = useState<LatestReleaseInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [viewLogError, setViewLogError] = useState('')

  useEffect(() => {
    if (!runtime?.app?.getVersion) {
      return
    }

    let cancelled = false
    void runtime.app.getVersion().then((version) => {
      if (!cancelled) {
        setAppVersion(version || '-')
      }
    }).catch(() => {
      if (!cancelled) {
        setAppVersion('-')
      }
    })

    return () => {
      cancelled = true
    }
  }, [runtime])

  const hasNewRelease = useMemo(
    () => (latestRelease && appVersion !== '-' ? isLatestVersionNewer(appVersion, latestRelease.tagName) : false),
    [appVersion, latestRelease],
  )

  const checkForUpdates = async (): Promise<void> => {
    if (!runtime?.app?.getLatestRelease) {
      return
    }

    try {
      setCheckingUpdate(true)
      setUpdateError('')
      const [version, release] = await Promise.all([
        runtime.app.getVersion?.() ?? Promise.resolve(appVersion),
        runtime.app.getLatestRelease(),
      ])
      setAppVersion(version || '-')
      setLatestRelease(release)
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : String(error))
    } finally {
      setCheckingUpdate(false)
    }
  }

  const openReleasePage = async (): Promise<void> => {
    const releaseUrl = latestRelease?.htmlUrl
    if (!releaseUrl || !runtime?.shell?.openExternal) {
      return
    }

    try {
      setUpdateError('')
      await runtime.shell.openExternal(releaseUrl)
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : String(error))
    }
  }

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
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.language')}</h2>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={sectionDescriptionStyle}>{translateHost(locale, 'general.language')}</span>
          <select
            aria-label={translateHost(locale, 'general.language')}
            value={preferences.language}
            onChange={(event) => onLanguageChange(event.target.value as HostShellPreferences['language'])}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 14,
              border: `1px solid ${hostShellColors.border}`,
              background: hostShellColors.surface,
              color: hostShellColors.text,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <option value="system">{translateHost(locale, 'general.language.followSystem')}</option>
            <option value="zh-CN">{translateHost(locale, 'general.language.zh-CN')}</option>
            <option value="en">{translateHost(locale, 'general.language.en')}</option>
          </select>
        </label>
      </section>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.daw')}</h2>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={sectionDescriptionStyle}>{translateHost(locale, 'general.adapter')}</span>
          <select
            aria-label="DAW"
            value={preferences.dawTarget}
            onChange={(event) => onDawTargetChange(event.target.value as DawTarget)}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 14,
              border: `1px solid ${hostShellColors.border}`,
              background: hostShellColors.surface,
              color: hostShellColors.text,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <option value="pro_tools">Pro Tools</option>
          </select>
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
              onClick={() => void checkForUpdates()}
              disabled={!runtime?.app?.getLatestRelease || checkingUpdate}
              style={actionButtonStyle}
            >
              {checkingUpdate ? translateHost(locale, 'settings.update.checking') : translateHost(locale, 'settings.update.check')}
            </button>
            {latestRelease?.htmlUrl ? (
              <button
                type="button"
                onClick={() => void openReleasePage()}
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
