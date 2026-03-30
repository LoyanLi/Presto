import type { ButtonHTMLAttributes, ReactNode } from 'react'
import MuiIconButton from '@mui/material/IconButton'

import { cx } from '../utils/cx'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLElement> {
  icon: ReactNode
  label: string
}

export function IconButton({ icon, label, className, disabled, ...props }: IconButtonProps) {
  return (
    <MuiIconButton
      {...props}
      type={props.type ?? 'button'}
      disabled={Boolean(disabled)}
      disableRipple
      aria-label={label}
      title={label}
      className={cx('ui-icon-button', className)}
      color="inherit"
      size="small"
    >
      <span aria-hidden className="ui-icon-button__icon">
        {icon}
      </span>
    </MuiIconButton>
  )
}
