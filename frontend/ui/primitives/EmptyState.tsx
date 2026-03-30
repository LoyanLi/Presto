import type { HTMLAttributes, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { cx } from '../utils/cx'

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
}

export function EmptyState({ title, description, actions, className, ...props }: EmptyStateProps) {
  return (
    <Stack {...props} className={cx('presto-empty-state', className)} spacing={1}>
      <Typography component="h3" className="presto-empty-state__title">
        {title}
      </Typography>
      <Typography component="p" className="presto-empty-state__description">
        {description}
      </Typography>
      {actions ? <Box sx={{ marginTop: 'var(--presto-space-sm)' }}>{actions}</Box> : null}
    </Stack>
  )
}
