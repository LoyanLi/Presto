import type { ReactNode } from 'react'
import FormControlLabel from '@mui/material/FormControlLabel'
import MuiSwitch from '@mui/material/Switch'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { cx } from '../utils/cx'

export interface SwitchProps {
  label?: ReactNode
  description?: ReactNode
  selected?: boolean
  disabled?: boolean
  required?: boolean
  icons?: boolean
  showOnlySelectedIcon?: boolean
  ariaLabel?: string
  className?: string
  onSelectedChange?(selected: boolean): void
}

export function Switch({
  label,
  description,
  selected,
  disabled,
  required,
  icons,
  showOnlySelectedIcon,
  ariaLabel,
  className,
  onSelectedChange,
}: SwitchProps) {
  const resolvedAriaLabel = ariaLabel ?? (typeof label === 'string' ? label : undefined)

  return (
    <FormControlLabel
      className={cx('ui-switch', 'ui-switch--halo', className)}
      control={(
        <MuiSwitch
          className="ui-switch__control"
          checked={Boolean(selected)}
          disabled={Boolean(disabled)}
          required={Boolean(required)}
          inputProps={{
            'aria-label': resolvedAriaLabel,
          }}
        />
      )}
      label={(
        <Stack spacing={0.25}>
          {label ? (
            <Typography component="span" className="ui-switch__label">
              {label}
            </Typography>
          ) : null}
          {description ? (
            <Typography component="span" className="ui-switch__description">
              {description}
            </Typography>
          ) : null}
        </Stack>
      )}
      sx={{
        alignItems: 'flex-start',
        gap: 1,
        margin: 0,
      }}
      onChange={(_event, nextSelected) => onSelectedChange?.(nextSelected)}
    />
  )
}
