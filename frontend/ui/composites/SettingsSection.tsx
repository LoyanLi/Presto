import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

export interface SettingsSectionProps {
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export function SettingsSection({ title, description, footer, children }: SettingsSectionProps) {
  return (
    <Paper component="section" elevation={0} className="presto-settings-section presto-settings-section--halo">
      <Box component="header" className="presto-settings-section__header">
        <Typography component="h3" className="presto-settings-section__title">
          {title}
        </Typography>
        {description ? (
          <Typography component="p" className="presto-settings-section__description">
            {description}
          </Typography>
        ) : null}
      </Box>
      <Box className="presto-settings-section__content">{children}</Box>
      {footer ? (
        <Box
          className="presto-settings-section__footer"
          style={{
            padding: 'var(--presto-space-md) var(--presto-space-lg)',
            background: 'color-mix(in srgb, var(--presto-color-surface-container-high) 88%, transparent)',
          }}
        >
          {footer}
        </Box>
      ) : null}
    </Paper>
  )
}
