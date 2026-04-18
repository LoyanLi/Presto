import type { CSSProperties } from 'react'

import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostPermissionId, HostPermissionStatus } from '../requiredPermissions'
import { actionButtonStyle, sectionDescriptionStyle, sectionStyle, sectionTitleStyle, stackStyle } from './pageStyles'

const permissionListStyle: CSSProperties = {
  display: 'grid',
  gap: 0,
}

const permissionRowStyle = (index: number): CSSProperties => ({
  display: 'grid',
  gap: 10,
  padding: '14px 0',
  ...(index > 0 ? { borderTop: `1px solid ${hostShellColors.border}` } : {}),
})

const permissionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
}

const permissionStatusStyle = (granted: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 28,
  padding: '0 10px',
  borderRadius: 999,
  background: granted ? 'rgba(23, 140, 87, 0.12)' : 'rgba(209, 58, 49, 0.12)',
  color: granted ? hostShellColors.successText : hostShellColors.errorText,
  fontSize: 13,
  fontWeight: 700,
})

function permissionTitle(locale: HostLocale, permissionId: HostPermissionId): string {
  if (permissionId === 'macAccessibility') {
    return translateHost(locale, 'settings.permissions.macAccessibility.title')
  }

  return permissionId
}

function permissionDescription(locale: HostLocale, permissionId: HostPermissionId): string {
  if (permissionId === 'macAccessibility') {
    return translateHost(locale, 'settings.permissions.macAccessibility.body')
  }

  return permissionId
}

function permissionActionLabel(locale: HostLocale, permissionId: HostPermissionId): string {
  if (permissionId === 'macAccessibility') {
    return translateHost(locale, 'settings.permissions.macAccessibility.openSettings')
  }

  return translateHost(locale, 'settings.permissions.openSystemSettings')
}

function permissionStatusLabel(
  locale: HostLocale,
  permission: HostPermissionStatus,
  checkingPermissions: boolean,
): string {
  if (checkingPermissions && !permission.checked) {
    return translateHost(locale, 'settings.permissions.status.checking')
  }

  if (permission.granted) {
    return translateHost(locale, 'settings.permissions.status.granted')
  }

  return translateHost(locale, 'settings.permissions.status.missing')
}

export interface PermissionsSettingsPageProps {
  locale: HostLocale
  checkingPermissions: boolean
  permissionStatus: readonly HostPermissionStatus[]
  onRecheckPermissions(): void
  onOpenPermissionSettings(permissionId: HostPermissionId): void
}

export function PermissionsSettingsPage({
  locale,
  checkingPermissions,
  permissionStatus,
  onRecheckPermissions,
  onOpenPermissionSettings,
}: PermissionsSettingsPageProps) {
  return (
    <div style={stackStyle}>
      <section style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <h2 style={sectionTitleStyle}>{translateHost(locale, 'settings.permissions.title')}</h2>
            <p style={sectionDescriptionStyle}>{translateHost(locale, 'settings.permissions.body')}</p>
          </div>
          <button
            type="button"
            onClick={onRecheckPermissions}
            style={actionButtonStyle}
          >
            {checkingPermissions
              ? translateHost(locale, 'settings.permissions.rechecking')
              : translateHost(locale, 'settings.permissions.recheck')}
          </button>
        </div>
        <div style={permissionListStyle}>
          {permissionStatus.map((permission, index) => (
            <div key={permission.id} style={permissionRowStyle(index)}>
              <div style={permissionHeaderStyle}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <p style={{ margin: 0, color: hostShellColors.text, fontSize: 15, fontWeight: 700 }}>
                    {permissionTitle(locale, permission.id)}
                  </p>
                  <p style={sectionDescriptionStyle}>{permissionDescription(locale, permission.id)}</p>
                </div>
                <span style={permissionStatusStyle(permission.granted)}>
                  {permissionStatusLabel(locale, permission, checkingPermissions)}
                </span>
              </div>
              {!permission.granted ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onOpenPermissionSettings(permission.id)}
                    style={actionButtonStyle}
                  >
                    {permissionActionLabel(locale, permission.id)}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
