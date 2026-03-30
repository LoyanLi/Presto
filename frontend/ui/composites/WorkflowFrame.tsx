import type { HTMLAttributes, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'

import { cx } from '../utils/cx'
import { PageHeader } from './PageHeader'
import { WorkflowStepper } from './WorkflowStepper'

export interface WorkflowFrameProps extends HTMLAttributes<HTMLElement> {
  title?: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  metadata?: ReactNode
  actions?: ReactNode
  steps?: Array<ReactNode | { id?: string | number; label: ReactNode; hint?: ReactNode }>
  currentStep?: number
  children: ReactNode
  footer?: ReactNode
}

export function WorkflowFrame({
  title,
  subtitle,
  eyebrow,
  metadata,
  actions,
  steps,
  currentStep = 1,
  children,
  footer,
  className,
  ...props
}: WorkflowFrameProps) {
  const hasHeader = Boolean(title || subtitle || eyebrow || metadata || actions)

  return (
    <Paper
      {...props}
      component="section"
      elevation={0}
      className={cx('presto-workflow-frame', className)}
    >
      {hasHeader ? (
        <Box className="presto-workflow-frame__header">
          <PageHeader
            eyebrow={eyebrow}
            title={title ?? ''}
            subtitle={subtitle}
            metadata={metadata}
            actions={actions}
          />
        </Box>
      ) : null}
      {Array.isArray(steps) && steps.length > 0 ? (
        <WorkflowStepper steps={steps} currentStep={currentStep} className="presto-workflow-frame__steps" />
      ) : null}
      <Box className="presto-workflow-frame__body">{children}</Box>
      {footer ? <Box className="presto-workflow-frame__footer">{footer}</Box> : null}
    </Paper>
  )
}
