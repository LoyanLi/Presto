import { useState } from 'react'

import type { PrestoClient } from '@presto/contracts'
import { Button, Select } from '../../../ui'
import { hostShellColors } from '../../hostShellColors'
import type { HostLocale } from '../../i18n'
import { translateHost } from '../../i18n'
import type { AutomationStepState, SplitStereoToMonoResultState } from '../model'

const cardStyle = {
  display: 'grid',
  gap: 16,
  minWidth: 0,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const titleStyle = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 20,
  fontWeight: 600,
}

const bodyStyle = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const stepListStyle = {
  display: 'grid',
  gap: 8,
  margin: 0,
  padding: 0,
  listStyle: 'none',
}

const stepItemStyle = (status: AutomationStepState['status']) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
  color: hostShellColors.text,
  fontSize: 13,
  opacity: status === 'pending' ? 0.7 : 1,
})

const stepDotStyle = (status: AutomationStepState['status']) => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
  background:
    status === 'succeeded'
      ? hostShellColors.successText
      : status === 'failed'
        ? hostShellColors.errorText
        : status === 'running'
          ? hostShellColors.text
          : hostShellColors.textSubtle,
})

export function getSplitStereoAutomationErrorMessage(locale: HostLocale, error: unknown): string {
  if (error instanceof Error) {
    const message = String(error.message ?? '').trim()
    if (message) {
      return message
    }
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim()
    if (message) {
      return message
    }
  }

  return translateHost(locale, 'automation.splitStereo.error.unknown')
}

export function SplitStereoToMonoCard({
  locale,
  presto,
}: {
  locale: HostLocale
  presto: PrestoClient
}) {
  const [keepChannel, setKeepChannel] = useState<'left' | 'right'>('left')
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<AutomationStepState[]>([])
  const [result, setResult] = useState<SplitStereoToMonoResultState | null>(null)

  const runAutomation = async () => {
    if (!presto.automation || typeof presto.automation.splitStereoToMono?.execute !== 'function') {
      setResult({ error: translateHost(locale, 'automation.splitStereo.error.apiUnavailable') })
      return
    }

    setRunning(true)
    setResult(null)
    setSteps([
      {
        id: 'selection.read',
        status: 'running',
        message: translateHost(locale, 'automation.splitStereo.step.selection'),
      },
    ])

    try {
      setSteps([
        {
          id: 'selection.read',
          status: 'succeeded',
          message: translateHost(locale, 'automation.splitStereo.step.selection'),
        },
        {
          id: 'automation.execute',
          status: 'running',
          message: translateHost(locale, 'automation.splitStereo.step.execute'),
        },
      ])

      const response = await presto.automation.splitStereoToMono.execute({ keepChannel })

      setSteps([
        {
          id: 'selection.read',
          status: 'succeeded',
          message: translateHost(locale, 'automation.splitStereo.step.selection'),
        },
        {
          id: 'automation.execute',
          status: 'succeeded',
          message: translateHost(locale, 'automation.splitStereo.step.execute'),
        },
      ])

      setResult({
        items: response.items,
      })
    } catch (error) {
      const message = getSplitStereoAutomationErrorMessage(locale, error)
      setResult({
        error: message,
      })
      setSteps((currentSteps) =>
        currentSteps.map((step) =>
          step.status === 'running'
            ? {
                ...step,
                status: 'failed',
                message,
              }
            : step,
        ),
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={titleStyle}>{translateHost(locale, 'automation.splitStereo.title')}</h2>
        <p style={bodyStyle}>{translateHost(locale, 'automation.splitStereo.body')}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ minWidth: 220, flex: '1 1 220px' }}>
          <Select
            label={translateHost(locale, 'automation.splitStereo.keepChannel')}
            value={keepChannel}
            options={[
              { value: 'left', label: translateHost(locale, 'automation.splitStereo.keepChannel.left') },
              { value: 'right', label: translateHost(locale, 'automation.splitStereo.keepChannel.right') },
            ]}
            onChange={(event) => {
              setKeepChannel(event.target.value === 'right' ? 'right' : 'left')
            }}
            disabled={running}
          />
        </div>
        <Button variant="primary" size="sm" onClick={() => void runAutomation()} disabled={running}>
          {running ? translateHost(locale, 'automation.splitStereo.running') : translateHost(locale, 'automation.splitStereo.action')}
        </Button>
      </div>

      {steps.length > 0 ? (
        <ul style={stepListStyle}>
          {steps.map((step) => (
            <li key={step.id} style={stepItemStyle(step.status)}>
              <span aria-hidden style={stepDotStyle(step.status)} />
              <span>{step.message ?? step.id}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {result?.error ? <p style={{ margin: 0, color: hostShellColors.errorText, fontSize: 13 }}>{result.error}</p> : null}
      {result?.items && result.items.length > 0 ? (
        <p style={{ margin: 0, color: hostShellColors.text, fontSize: 13 }}>
          {translateHost(locale, 'automation.splitStereo.result.success', {
            trackName:
              result.items.length === 1
                ? result.items[0]?.keptTrackName ?? ''
                : `${result.items.length} tracks`,
          })}
        </p>
      ) : null}

      <p style={{ margin: 0, color: hostShellColors.textMuted, fontSize: 13, lineHeight: 1.55 }}>
        {translateHost(locale, 'automation.splitStereo.note')}
      </p>
    </section>
  )
}
