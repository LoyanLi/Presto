import type { CSSProperties } from 'react'

const dialogOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'rgba(7, 10, 18, 0.52)',
  zIndex: 1400,
}

const dialogCardStyle: CSSProperties = {
  width: 'min(100%, 440px)',
  display: 'grid',
  gap: 16,
  padding: 24,
  borderRadius: 24,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface-container-high)',
  color: 'var(--md-sys-color-on-surface)',
  boxShadow: '0 24px 80px rgba(9, 13, 24, 0.28)',
}

const dialogTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
}

const dialogBodyStyle: CSSProperties = {
  margin: 0,
  color: 'var(--md-sys-color-on-surface-variant)',
  fontSize: 14,
  lineHeight: 1.6,
}

const dialogMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  padding: 16,
  borderRadius: 18,
  background: 'var(--md-sys-color-surface-container-low)',
}

const dialogActionsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  flexWrap: 'wrap',
}

const dialogButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)',
  color: 'var(--md-sys-color-on-surface)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const dialogPrimaryButtonStyle: CSSProperties = {
  ...dialogButtonStyle,
  borderColor: 'var(--md-sys-color-primary)',
  background: 'var(--md-sys-color-primary)',
  color: 'var(--md-sys-color-on-primary)',
}

export interface HostUpdateDialogCopy {
  title: string
  body: string
  currentVersion: string
  latestVersion: string
  channel: string
  publishedAt: string
  later: string
  openRelease: string
}

export interface HostAccessibilityDialogCopy {
  title: string
  body: string
  steps: string
  help: string
  later: string
  openSettings: string
}

export function HostUpdateDialog({
  copy,
  onClose,
  onOpenRelease,
}: {
  copy: HostUpdateDialogCopy
  onClose(): void
  onOpenRelease(): void
}) {
  return (
    <div style={dialogOverlayStyle}>
      <div role="dialog" aria-modal="true" style={dialogCardStyle}>
        <div style={{ display: 'grid', gap: 8 }}>
          <h2 style={dialogTitleStyle}>{copy.title}</h2>
          <p style={dialogBodyStyle}>{copy.body}</p>
        </div>
        <div style={dialogMetaStyle}>
          <p style={dialogBodyStyle}>{copy.currentVersion}</p>
          <p style={dialogBodyStyle}>{copy.latestVersion}</p>
          <p style={dialogBodyStyle}>{copy.channel}</p>
          <p style={dialogBodyStyle}>{copy.publishedAt}</p>
        </div>
        <div style={dialogActionsStyle}>
          <button type="button" style={dialogButtonStyle} onClick={onClose}>
            {copy.later}
          </button>
          <button type="button" style={dialogPrimaryButtonStyle} onClick={onOpenRelease}>
            {copy.openRelease}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HostAccessibilityDialog({
  copy,
  onClose,
  onOpenSettings,
}: {
  copy: HostAccessibilityDialogCopy
  onClose(): void
  onOpenSettings(): void
}) {
  return (
    <div style={dialogOverlayStyle}>
      <div role="dialog" aria-modal="true" style={dialogCardStyle}>
        <div style={{ display: 'grid', gap: 8 }}>
          <h2 style={dialogTitleStyle}>{copy.title}</h2>
          <p style={dialogBodyStyle}>{copy.body}</p>
        </div>
        <div style={dialogMetaStyle}>
          <p style={dialogBodyStyle}>{copy.steps}</p>
          <p style={dialogBodyStyle}>{copy.help}</p>
        </div>
        <div style={dialogActionsStyle}>
          <button type="button" style={dialogButtonStyle} onClick={onClose}>
            {copy.later}
          </button>
          <button type="button" style={dialogPrimaryButtonStyle} onClick={onOpenSettings}>
            {copy.openSettings}
          </button>
        </div>
      </div>
    </div>
  )
}
