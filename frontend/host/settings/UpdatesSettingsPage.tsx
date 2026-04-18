import type { AppLatestReleaseInfo } from '@presto/sdk-runtime/clients/app'

import { Switch } from '../../ui'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostShellPreferences } from '../shellPreferences'
import { actionButtonStyle, sectionDescriptionStyle, sectionStyle, sectionTitleStyle, stackStyle } from './pageStyles'

export interface UpdatesSettingsPageProps {
  locale: HostLocale
  appVersion: string
  latestRelease: AppLatestReleaseInfo | null
  checkingUpdate: boolean
  updateError: string
  hasNewRelease: boolean
  includePrereleaseUpdates: HostShellPreferences['includePrereleaseUpdates']
  onCheckForUpdates(): void
  onOpenReleasePage(): void
  onIncludePrereleaseUpdatesChange(selected: boolean): void
}

export function UpdatesSettingsPage({
  locale,
  appVersion,
  latestRelease,
  checkingUpdate,
  updateError,
  hasNewRelease,
  includePrereleaseUpdates,
  onCheckForUpdates,
  onOpenReleasePage,
  onIncludePrereleaseUpdatesChange,
}: UpdatesSettingsPageProps) {
  return (
    <div style={stackStyle}>
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
            selected={includePrereleaseUpdates}
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
            <button
              type="button"
              onClick={() => void onOpenReleasePage()}
              style={actionButtonStyle}
            >
              {translateHost(locale, 'settings.update.openRelease')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
