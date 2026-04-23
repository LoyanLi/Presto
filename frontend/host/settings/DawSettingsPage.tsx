import type { CSSProperties } from 'react'
import { SUPPORTED_DAW_TARGETS, type DawTarget } from '@presto/contracts'

import { Select } from '../../ui'
import { hostShellColors } from '../hostShellColors'
import { dawLabel } from '../hostShellHelpers'
import type { HostDawConnectionState } from '../hooks/useDawStatusPolling'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import { actionButtonStyle, sectionDescriptionStyle, sectionStyle, sectionTitleStyle, stackStyle } from './pageStyles'

export interface DawSettingsPageProps {
  locale: HostLocale
  dawTarget: DawTarget
  dawStatus: {
    status: HostDawConnectionState
    targetLabel: string
    sessionName: string
    statusLabel: string
    lastError: string
  }
  checkingConnection: boolean
  onDawTargetChange(target: DawTarget): void
  onCheckConnection(): void
}

export function DawSettingsPage({
  locale,
  dawTarget,
  dawStatus,
  checkingConnection,
  onDawTargetChange,
  onCheckConnection,
}: DawSettingsPageProps) {
  const statusColor = dawStatus.status === 'connected'
    ? hostShellColors.successText
    : dawStatus.status === 'disconnected'
      ? hostShellColors.errorText
      : hostShellColors.textMuted

  return (
    <div style={stackStyle}>
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{translateHost(locale, 'general.daw')}</h2>
        <label style={{ display: 'grid', gap: 8 }}>
          <span style={sectionDescriptionStyle}>{translateHost(locale, 'general.adapter')}</span>
          <Select
            aria-label="DAW"
            value={dawTarget}
            onChange={(event) => onDawTargetChange(event.target.value as DawTarget)}
            options={SUPPORTED_DAW_TARGETS.map((target) => ({ value: target, label: dawLabel(target) }))}
          />
        </label>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <p style={{ ...sectionDescriptionStyle, margin: 0 }}>{translateHost(locale, 'general.status')}</p>
              <p
                style={{
                  margin: 0,
                  color: statusColor,
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
    </div>
  )
}
