import type { ReactNode } from 'react'
import Box from '@mui/material/Box'

import { cx } from '../utils/cx'

export interface WorkflowStepItem {
  id?: string | number
  label: ReactNode
  hint?: ReactNode
}

export interface WorkflowStepperProps {
  steps: Array<ReactNode | WorkflowStepItem>
  currentStep: number
  className?: string
}

function normalizeStep(step: ReactNode | WorkflowStepItem, index: number): WorkflowStepItem {
  if (typeof step === 'object' && step !== null && 'label' in step) {
    return step as WorkflowStepItem
  }
  return {
    id: index,
    label: step,
  }
}

export function WorkflowStepper({ steps, currentStep, className }: WorkflowStepperProps) {
  return (
    <Box className={cx('presto-workflow-stepper', className)}>
      <Box className="presto-workflow-stepper__row">
        {steps.map((rawStep, index) => {
          const step = normalizeStep(rawStep, index)
          const stepNumber = index + 1
          const state =
            stepNumber === currentStep ? 'active' : stepNumber < currentStep ? 'complete' : 'pending'
          return (
            <Box
              key={step.id ?? `${stepNumber}-${String(step.label)}`}
              className={cx(
                'presto-workflow-stepper__item',
                state === 'active' && 'presto-workflow-stepper__item--active',
                state === 'complete' && 'presto-workflow-stepper__item--complete',
              )}
            >
              <span className="presto-workflow-stepper__index">{stepNumber}</span>
              <Box className="presto-workflow-stepper__label-wrap">
                <span className="presto-workflow-stepper__label">{step.label}</span>
                {step.hint ? <span className="presto-workflow-stepper__hint">{step.hint}</span> : null}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
