import type { CSSProperties } from 'react'

import { hostShellColors } from '../hostShellColors'

export const stackStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
}

export const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

export const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 18,
  fontWeight: 600,
}

export const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

export const actionButtonStyle: CSSProperties = {
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
