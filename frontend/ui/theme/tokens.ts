export type PrestoThemeMode = 'light' | 'dark'

export interface Md3ColorScheme {
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  secondaryContainer: string
  onSecondaryContainer: string
  tertiary: string
  onTertiary: string
  tertiaryContainer: string
  onTertiaryContainer: string
  error: string
  onError: string
  errorContainer: string
  onErrorContainer: string
  background: string
  onBackground: string
  surface: string
  onSurface: string
  surfaceVariant: string
  onSurfaceVariant: string
  outline: string
  outlineVariant: string
  inverseSurface: string
  inverseOnSurface: string
  inversePrimary: string
  shadow: string
  scrim: string
  surfaceTint: string
  surfaceContainerLowest: string
  surfaceContainerLow: string
  surfaceContainer: string
  surfaceContainerHigh: string
  surfaceContainerHighest: string
}

const haloLightColorScheme: Md3ColorScheme = {
  primary: '#5b4ed6',
  onPrimary: '#ffffff',
  primaryContainer: '#e7e4ff',
  onPrimaryContainer: '#21185f',
  secondary: '#5f6b8a',
  onSecondary: '#ffffff',
  secondaryContainer: '#e7ebf5',
  onSecondaryContainer: '#1f2638',
  tertiary: '#7a62ba',
  onTertiary: '#ffffff',
  tertiaryContainer: '#ede5ff',
  onTertiaryContainer: '#2e1c62',
  error: '#b3261e',
  onError: '#ffffff',
  errorContainer: '#fce8e6',
  onErrorContainer: '#601410',
  background: '#f7f8fc',
  onBackground: '#171a24',
  surface: '#f7f8fc',
  onSurface: '#171a24',
  surfaceVariant: '#e7e9f2',
  onSurfaceVariant: '#525b71',
  outline: '#77809a',
  outlineVariant: '#c8cedd',
  inverseSurface: '#232835',
  inverseOnSurface: '#f5f7fb',
  inversePrimary: '#c9c2ff',
  shadow: '#000000',
  scrim: '#000000',
  surfaceTint: '#5b4ed6',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4fa',
  surfaceContainer: '#edf0f7',
  surfaceContainerHigh: '#e9ebf4',
  surfaceContainerHighest: '#e2e5f0',
}

export const md3ColorSchemes: Record<PrestoThemeMode, Md3ColorScheme> = {
  light: haloLightColorScheme,
  dark: { ...haloLightColorScheme },
}

export const md3Shape = {
  cornerExtraSmall: '4px',
  cornerSmall: '10px',
  cornerMedium: '14px',
  cornerLarge: '18px',
  cornerExtraLarge: '24px',
  cornerFull: '999px',
} as const

export const md3Spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  x2: '32px',
  x3: '40px',
} as const

export const md3Typography = {
  brand: "'Inter', 'Segoe UI', sans-serif",
  plain: "'Inter', 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, monospace",
  displaySize: '3rem',
  headlineSize: '1.5rem',
  titleSize: '1.05rem',
  bodySize: '0.95rem',
  labelSize: '0.82rem',
  smallSize: '0.74rem',
} as const

export const md3Status = {
  live: '#6f83ff',
  public: '#7f889d',
  success: '#3f8f6b',
  warning: '#b37a2a',
  error: '#be4a4a',
} as const

export const md3ThemeTokens = {
  colorSchemes: md3ColorSchemes,
  shape: md3Shape,
  spacing: md3Spacing,
  typography: md3Typography,
  status: md3Status,
} as const
