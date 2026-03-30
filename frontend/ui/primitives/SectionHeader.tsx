import type { HTMLAttributes, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { cx } from '../utils/cx'

export interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <Box
      {...props}
      className={cx('presto-section-header', className)}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--presto-space-md)',
      }}
    >
      <Stack className="presto-section-header__left" spacing={0.5}>
        {eyebrow ? (
          <Typography component="p" className="presto-section-header__eyebrow">
            {eyebrow}
          </Typography>
        ) : null}
        <Typography component="h2" className="presto-section-header__title">
          {title}
        </Typography>
        {description ? (
          <Typography component="p" className="presto-section-header__description">
            {description}
          </Typography>
        ) : null}
      </Stack>
      {actions ? <Box>{actions}</Box> : null}
    </Box>
  )
}
