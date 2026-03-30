import type { ReactNode, SelectHTMLAttributes } from 'react'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'

import { cx } from '../utils/cx'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  options: readonly SelectOption[]
  startAdornment?: ReactNode
  endAdornment?: ReactNode
}

export function Select({
  label,
  hint,
  error,
  options,
  startAdornment,
  endAdornment,
  className,
  ...props
}: SelectProps) {
  return (
    <TextField
      {...props}
      select
      variant="outlined"
      size="small"
      className={cx('ui-select', 'ui-select--halo', className)}
      label={label}
      helperText={error ?? hint}
      error={Boolean(error)}
      fullWidth
      InputProps={{
        startAdornment: startAdornment ? <InputAdornment position="start">{startAdornment}</InputAdornment> : undefined,
        endAdornment: endAdornment ? <InputAdornment position="end">{endAdornment}</InputAdornment> : undefined,
      }}
      FormHelperTextProps={{
        className: error ? 'ui-field__error' : 'ui-field__helper',
      }}
      InputLabelProps={{
        className: 'ui-field__label',
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  )
}
