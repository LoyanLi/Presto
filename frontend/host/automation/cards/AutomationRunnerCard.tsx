import { useMemo, useState } from 'react'

import type {
  PluginAutomationOptionDefinition,
  PluginAutomationRunResult,
} from '@presto/contracts'
import { Button, Select, Switch } from '../../../ui'
import type { AutomationRunState, AutomationStepState } from '../model'
import { hostShellColors } from '../../hostShellColors'
import type { HostLocale } from '../../i18n'
import { translateHost } from '../../i18n'
import type { HostAutomationEntry } from '../../pluginHostTypes'

const cardStyle = {
  display: 'grid',
  gap: 16,
  minWidth: 0,
  alignSelf: 'start',
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

const metaPillStyle = {
  justifySelf: 'start',
  padding: '4px 10px',
  borderRadius: 999,
  background: hostShellColors.surface,
  color: hostShellColors.textMuted,
  fontSize: 12,
  fontWeight: 600,
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

function getAutomationErrorMessage(locale: HostLocale, error: unknown): string {
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

  return translateHost(locale, 'automation.generic.error.unknown')
}

function buildDefaultInput(optionsSchema: readonly PluginAutomationOptionDefinition[]): Record<string, unknown> {
  return Object.fromEntries(optionsSchema.map((option) => [
    option.optionId,
    option.defaultValue ?? (option.kind === 'boolean' ? false : option.options[0]?.value ?? ''),
  ]))
}

function normalizeRunResult(result: PluginAutomationRunResult): AutomationRunState {
  return {
    steps: result.steps ?? [],
    summary: result.summary,
  }
}

export function AutomationRunnerCard({
  locale,
  entry,
}: {
  locale: HostLocale
  entry: HostAutomationEntry
}) {
  const [running, setRunning] = useState(false)
  const [values, setValues] = useState<Record<string, unknown>>(() => buildDefaultInput(entry.optionsSchema))
  const [steps, setSteps] = useState<AutomationStepState[]>([])
  const [result, setResult] = useState<AutomationRunState | null>(null)
  const actionLabel = useMemo(
    () => (running ? translateHost(locale, 'automation.generic.running') : translateHost(locale, 'automation.generic.action')),
    [locale, running],
  )
  const minimumHostVersionLabel =
    entry.currentDawLabel && entry.currentDawMinimumHostVersion
      ? `${entry.currentDawLabel} ≥ ${entry.currentDawMinimumHostVersion}`
      : null

  const runAutomation = async () => {
    setRunning(true)
    setResult(null)
    setSteps([
      {
        id: 'automation.execute',
        status: 'running',
        message: translateHost(locale, 'automation.generic.step.execute'),
      },
    ])

    try {
      const nextResult = normalizeRunResult(await entry.execute(values))
      setSteps(nextResult.steps ?? [])
      setResult(nextResult)
    } catch (error) {
      const message = getAutomationErrorMessage(locale, error)
      setResult({ error: message, steps: [] })
      setSteps((currentSteps) =>
        currentSteps.map((step) => (step.status === 'running' ? { ...step, status: 'failed', message } : step)),
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={titleStyle}>{entry.title}</h2>
        {entry.description ? <p style={bodyStyle}>{entry.description}</p> : null}
        {minimumHostVersionLabel ? <span style={metaPillStyle}>{minimumHostVersionLabel}</span> : null}
      </div>

      {entry.optionsSchema.length > 0 ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {entry.optionsSchema.map((option) => {
            if (option.kind === 'boolean') {
              return (
                <Switch
                  key={option.optionId}
                  label={option.label}
                  description={option.description}
                  selected={Boolean(values[option.optionId])}
                  disabled={running}
                  onSelectedChange={(selected) => {
                    setValues((current) => ({ ...current, [option.optionId]: selected }))
                  }}
                />
              )
            }

            return (
              <Select
                key={option.optionId}
                label={option.label}
                hint={option.description}
                value={String(values[option.optionId] ?? '')}
                options={option.options}
                disabled={running}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [option.optionId]: event.target.value }))
                }}
              />
            )
          })}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Button variant="primary" size="sm" onClick={() => void runAutomation()} disabled={running}>
          {actionLabel}
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
      {result?.summary ? <p style={{ margin: 0, color: hostShellColors.text, fontSize: 13 }}>{result.summary}</p> : null}
    </section>
  )
}

export { getAutomationErrorMessage }
