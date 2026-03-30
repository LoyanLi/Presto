import type { ReactNode } from 'react'
import Box from '@mui/material/Box'

export interface FilterBarProps {
  children?: ReactNode
  actions?: ReactNode
}

export function FilterBar({ children, actions }: FilterBarProps) {
  return (
    <Box className="presto-filter-bar">
      <Box className="presto-filter-bar__tabs">{children}</Box>
      {actions ? <Box className="presto-filter-bar__actions">{actions}</Box> : null}
    </Box>
  )
}
