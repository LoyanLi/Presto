export {
  md3ColorSchemes,
  md3Shape,
  md3Spacing,
  md3Status,
  md3ThemeTokens,
  md3Typography,
  type Md3ColorScheme,
  type PrestoThemeMode,
} from './theme/tokens'

import { md3ColorSchemes, md3Shape, md3Spacing, md3Status, md3ThemeTokens, md3Typography } from './theme/tokens'

export const prestoColorRoles = md3ColorSchemes.light

export const prestoTypographyRoles = {
  headline: md3Typography.brand,
  body: md3Typography.plain,
  label: md3Typography.plain,
  mono: md3Typography.mono,
  sizeDisplay: md3Typography.displaySize,
  sizeTitle: md3Typography.headlineSize,
  sizeHeading: md3Typography.titleSize,
  sizeBody: md3Typography.bodySize,
  sizeCaption: md3Typography.smallSize,
  sizeMicro: md3Typography.smallSize,
} as const

export const prestoRadiusScale = {
  xs: md3Shape.cornerExtraSmall,
  sm: md3Shape.cornerSmall,
  md: md3Shape.cornerMedium,
  lg: md3Shape.cornerLarge,
  pill: md3Shape.cornerFull,
} as const

export const prestoSpacingScale = {
  xs: md3Spacing.xs,
  sm: md3Spacing.sm,
  md: md3Spacing.md,
  lg: md3Spacing.lg,
  xl: md3Spacing.xl,
  x2: md3Spacing.x2,
  x3: md3Spacing.x3,
} as const

export const prestoBorderRoles = {
  subtle: `1px solid color-mix(in srgb, ${prestoColorRoles.outlineVariant} 42%, transparent)`,
  standard: `1px solid color-mix(in srgb, ${prestoColorRoles.outline} 36%, transparent)`,
  strong: `1px solid color-mix(in srgb, ${prestoColorRoles.primary} 32%, transparent)`,
  focusRing: `0 0 0 3px color-mix(in srgb, ${prestoColorRoles.primary} 22%, transparent)`,
} as const

export const prestoSurfaceRoles = {
  canvas: prestoColorRoles.background,
  panel: prestoColorRoles.surfaceContainerLow,
  panelMuted: prestoColorRoles.surfaceContainer,
  panelRaised: prestoColorRoles.surfaceContainerHigh,
  chip: prestoColorRoles.surfaceContainerHighest,
  field: prestoColorRoles.surfaceContainerHighest,
  code: '#111318',
  codeHeader: '#1a1d24',
} as const

export const prestoStatusRoles = md3Status

export const prestoDesignTokens = {
  colorSchemes: md3ThemeTokens.colorSchemes,
  color: prestoColorRoles,
  typography: prestoTypographyRoles,
  radius: prestoRadiusScale,
  spacing: prestoSpacingScale,
  border: prestoBorderRoles,
  surface: prestoSurfaceRoles,
  status: prestoStatusRoles,
} as const

export type PrestoDesignTokens = typeof prestoDesignTokens
