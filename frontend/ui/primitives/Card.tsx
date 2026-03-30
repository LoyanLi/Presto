import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import Paper from '@mui/material/Paper'

import { cx } from '../utils/cx'

export type CardTone = 'default' | 'muted' | 'inset'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  interactive?: boolean
  elevated?: boolean
  children: ReactNode
}

export function Card({
  tone = 'default',
  interactive = false,
  elevated = false,
  className,
  style,
  children,
  ...props
}: CardProps) {
  const inlineStyle: CSSProperties = {
    ...style,
    ...(interactive
      ? {
          transition: 'box-shadow 160ms ease, transform 160ms ease',
        }
      : undefined),
    ...(elevated ? { boxShadow: 'var(--ui-shadow-3)' } : undefined),
  }

  return (
    <Paper
      {...props}
      elevation={0}
      className={cx('ui-card', 'ui-card--halo', `ui-card--${tone}`, interactive && 'ui-card--interactive', className)}
      style={inlineStyle}
    >
      {children}
    </Paper>
  )
}
