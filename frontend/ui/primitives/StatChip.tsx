import type { HTMLAttributes, ReactNode } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

import { cx } from '../utils/cx'

export type StatChipTone = 'neutral' | 'brand' | 'live' | 'warning' | 'error'

export interface StatChipProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
  value: ReactNode
  tone?: StatChipTone
}

function resolveTone(tone: StatChipTone): string {
  return tone === 'brand' ? 'live' : tone
}

export function StatChip({ label, value, tone = 'neutral', className, ...props }: StatChipProps) {
  const resolvedTone = resolveTone(tone)
  return (
    <Paper
      {...props}
      elevation={0}
      className={cx('presto-stat-chip', resolvedTone !== 'neutral' && `presto-stat-chip--${resolvedTone}`, className)}
    >
      <Typography component="p" className="presto-stat-chip__label">
        {label}
      </Typography>
      <Typography component="p" className="presto-stat-chip__value">
        {value}
      </Typography>
    </Paper>
  )
}
