import type { HTMLAttributes, ReactNode } from 'react'
import Paper from '@mui/material/Paper'

import { cx } from '../utils/cx'

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  muted?: boolean
}

export function Panel({
  eyebrow,
  title,
  description,
  actions,
  footer,
  muted = false,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <Paper
      {...props}
      component="section"
      elevation={0}
      className={cx('ui-panel', muted && 'ui-panel--muted', className)}
    >
      {eyebrow || title || description || actions ? (
        <header className="ui-panel__header">
          <div className="ui-panel__header-main">
            {eyebrow ? <p className="ui-panel__eyebrow">{eyebrow}</p> : null}
            {title ? <h3 className="ui-panel__title">{title}</h3> : null}
            {description ? <p className="ui-panel__description">{description}</p> : null}
          </div>
          {actions ? <div className="ui-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="ui-panel__body">{children}</div>
      {footer ? <footer className="ui-panel__footer">{footer}</footer> : null}
    </Paper>
  )
}
