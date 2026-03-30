import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export interface HeroCardProps {
  title: ReactNode
  description: ReactNode
  stats?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
}

export function HeroCard({ title, description, stats, actions, footer }: HeroCardProps) {
  return (
    <Paper component="section" elevation={0} className="presto-hero-card">
      <Stack className="presto-hero-card__inner" spacing={2}>
        <Box>
          <Typography component="h2" className="presto-hero-card__title">
            {title}
          </Typography>
          <Typography component="p" className="presto-hero-card__description">
            {description}
          </Typography>
        </Box>
        {stats ? <div className="presto-hero-card__stats">{stats}</div> : null}
        {actions ? <div className="presto-hero-card__actions">{actions}</div> : null}
        {footer ? <div>{footer}</div> : null}
      </Stack>
    </Paper>
  )
}
