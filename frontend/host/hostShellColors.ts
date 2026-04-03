export type HostShellColorPalette = {
  canvas: string
  surface: string
  surfaceMuted: string
  surfaceRaised: string
  surfaceSelected: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textSubtle: string
  accent: string
  accentSoft: string
  successBorder: string
  successSurface: string
  successText: string
  errorBorder: string
  errorSurface: string
  errorText: string
}

export const hostShellColors: HostShellColorPalette = {
  canvas: 'var(--md-sys-color-background)',
  surface: 'var(--md-sys-color-surface-container-lowest)',
  surfaceMuted: 'var(--md-sys-color-surface-container-low)',
  surfaceRaised: 'var(--md-sys-color-surface-container)',
  surfaceSelected: 'var(--md-sys-color-primary-container)',
  border: 'var(--md-sys-color-outline-variant)',
  borderStrong: 'var(--md-sys-color-outline)',
  text: 'var(--md-sys-color-on-surface)',
  textMuted: 'var(--md-sys-color-on-surface-variant)',
  textSubtle: 'var(--md-sys-color-outline)',
  accent: 'var(--md-sys-color-primary)',
  accentSoft: 'var(--md-sys-color-primary-container)',
  successBorder: 'color-mix(in srgb, var(--presto-status-success) 42%, var(--md-sys-color-outline-variant))',
  successSurface: 'color-mix(in srgb, var(--presto-status-success) 18%, var(--md-sys-color-surface-container-low))',
  successText: 'var(--presto-status-success)',
  errorBorder: 'color-mix(in srgb, var(--presto-status-error) 42%, var(--md-sys-color-outline-variant))',
  errorSurface: 'color-mix(in srgb, var(--presto-status-error) 18%, var(--md-sys-color-surface-container-low))',
  errorText: 'var(--presto-status-error)',
}
