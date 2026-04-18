import { useState } from 'react'
import type { AppViewLogResult } from '@presto/sdk-runtime/clients/app'

import { Switch } from '../../ui'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostShellPreferences } from '../shellPreferences'
import { actionButtonStyle, sectionDescriptionStyle, sectionStyle, sectionTitleStyle, stackStyle } from './pageStyles'
import { hostShellColors } from '../hostShellColors'

export interface DiagnosticsSettingsPageProps {
  locale: HostLocale
  developerMode: HostShellPreferences['developerMode']
  runtime?: {
    app?: {
      viewLog(): Promise<AppViewLogResult>
    }
  }
  onDeveloperModeChange(selected: boolean): void
}

export function DiagnosticsSettingsPage({
  locale,
  developerMode,
  runtime,
  onDeveloperModeChange,
}: DiagnosticsSettingsPageProps) {
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
          selected={developerMode}
          onSelectedChange={onDeveloperModeChange}
        />
      </section>
    </div>
  )
}
