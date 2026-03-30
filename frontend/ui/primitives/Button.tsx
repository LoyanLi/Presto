import type { ButtonHTMLAttributes, ReactNode } from 'react'
import MuiButton from '@mui/material/Button'

import { cx } from '../utils/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  busy?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

const variantByTone: Record<ButtonVariant, 'contained' | 'outlined' | 'text'> = {
  primary: 'contained',
  secondary: 'outlined',
  tertiary: 'text',
  danger: 'contained',
  ghost: 'text',
}

const colorByTone: Record<ButtonVariant, 'primary' | 'inherit' | 'error'> = {
  primary: 'primary',
  secondary: 'inherit',
  tertiary: 'inherit',
  danger: 'error',
  ghost: 'inherit',
}

const sizeByScale: Record<ButtonSize, 'small' | 'medium' | 'large'> = {
  sm: 'small',
  md: 'medium',
  lg: 'large',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  busy = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled || busy)

  return (
    <MuiButton
      {...props}
      type={props.type ?? 'button'}
      variant={variantByTone[variant]}
      color={colorByTone[variant]}
      size={sizeByScale[size]}
      disabled={isDisabled}
      fullWidth={fullWidth}
      disableElevation
      disableRipple
      startIcon={leadingIcon}
      endIcon={trailingIcon}
      className={cx(
        'ui-button',
        'ui-button--halo',
        `ui-button--${variant}`,
        size !== 'md' && `ui-button--${size}`,
        fullWidth && 'ui-button--full',
        className,
      )}
      aria-busy={busy || undefined}
    >
      {busy ? 'Running...' : children}
    </MuiButton>
  )
}
