import type { HTMLAttributes, ReactNode } from 'react'
import Box from '@mui/material/Box'

import { cx } from '../utils/cx'

export interface WorkflowActionBarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  sticky?: boolean
  align?: 'start' | 'end' | 'space-between'
}

export function WorkflowActionBar({
  children,
  sticky = true,
  align = 'end',
  className,
  ...props
}: WorkflowActionBarProps) {
  return (
    <Box
      {...props}
      className={cx(
        'presto-workflow-action-bar',
        sticky && 'presto-workflow-action-bar--sticky',
        className,
      )}
    >
      <Box
        className={cx(
          'presto-workflow-action-bar__inner',
          align === 'start' && 'presto-workflow-action-bar__inner--start',
          align === 'space-between' && 'presto-workflow-action-bar__inner--space-between',
        )}
      >
        {children}
      </Box>
    </Box>
  )
}
