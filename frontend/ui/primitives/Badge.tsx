import type { HTMLAttributes, ReactNode } from 'react'
import Chip from '@mui/material/Chip'

import { cx } from '../utils/cx'

export type BadgeTone = 'neutral' | 'brand' | 'live' | 'public' | 'success' | 'warning' | 'danger' | 'error'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
}

function resolveTone(tone: BadgeTone): string {
  switch (tone) {
    case 'brand':
      return 'live'
    case 'danger':
      return 'error'
    default:
      return tone
  }
}

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <Chip
      {...props}
      size="small"
      className={cx('ui-badge', `ui-badge--${resolveTone(tone)}`, className)}
      label={(
        <span className="ui-badge__content">
          {dot ? <span aria-hidden className="ui-badge__dot" /> : null}
          <span>{children}</span>
        </span>
      )}
    />
  )
}
