import type { ReactNode, SelectHTMLAttributes } from 'react'
import InputAdornment from '@mui/material/InputAdornment'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import type { SelectProps as MuiSelectProps } from '@mui/material/Select'
import TextField from '@mui/material/TextField'

import { cx } from '../utils/cx'

export interface SelectOption {
  value: string
  label: string
  group?: string
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  options: readonly SelectOption[]
  children?: ReactNode
  selectProps?: Partial<MuiSelectProps>
  startAdornment?: ReactNode
  endAdornment?: ReactNode
}

export function Select({
  label,
  hint,
  error,
  options,
  children,
  selectProps,
  startAdornment,
  endAdornment,
  className,
  ...props
}: SelectProps) {
  let previousGroup = ''

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
      SelectProps={selectProps}
      InputLabelProps={{
        className: 'ui-field__label',
      }}
    >
      {children ?? options.flatMap((option) => {
        const nextNodes = []
        if (option.group && option.group !== previousGroup) {
          previousGroup = option.group
          nextNodes.push(
            <ListSubheader key={`group:${option.group}`}>
              {option.group}
            </ListSubheader>,
          )
        }
        nextNodes.push(
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>,
        )
        return nextNodes
      })}
    </TextField>
  )
}
