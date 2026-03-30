import type { ReactNode, TextareaHTMLAttributes } from 'react'
import TextField from '@mui/material/TextField'

import { cx } from '../utils/cx'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  minHeight?: string | number
}

export function Textarea({
  label,
  hint,
  error,
  minHeight,
  className,
  rows,
  ...props
}: TextareaProps) {
  return (
    <TextField
      {...props}
      multiline
      minRows={typeof rows === 'number' ? rows : 3}
      variant="outlined"
      size="small"
      className={cx('ui-input', 'ui-input--halo', 'ui-input--textarea', className)}
      label={label}
      helperText={error ?? hint}
      error={Boolean(error)}
      fullWidth
      InputProps={{
        className: cx(minHeight && 'ui-input__control--textarea'),
        style: minHeight ? { minHeight } : undefined,
      }}
      FormHelperTextProps={{
        className: error ? 'ui-field__error' : 'ui-field__helper',
      }}
      InputLabelProps={{
        className: 'ui-field__label',
      }}
    />
  )
}
