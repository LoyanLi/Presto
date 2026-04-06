import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import type { HostPluginSettingsEntry } from '../pluginHostTypes'
import { formatHostErrorMessage } from '../errorDisplay'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import { WorkflowSettingsFieldList, setValueAtPath } from './workflowSettingsFields'

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const stackStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  paddingBottom: 96,
}

const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 18,
  fontWeight: 600,
}

const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const floatingActionsWrapStyle: CSSProperties = {
  position: 'sticky',
  bottom: 24,
  display: 'flex',
  justifyContent: 'flex-end',
  pointerEvents: 'none',
  background: 'transparent',
  zIndex: 2,
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 999,
  border: `1px solid ${hostShellColors.accent}`,
  background: hostShellColors.surface,
  color: hostShellColors.accent,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  background: hostShellColors.accent,
  borderColor: hostShellColors.accent,
  color: hostShellColors.surface,
}

const floatingActionsCardStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'end',
  gap: 8,
  pointerEvents: 'auto',
}

function equalSettingsValue(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function WorkflowSettingsPage({
  entry,
  locale,
}: {
  entry: HostPluginSettingsEntry
  locale: HostLocale
}) {
  const [savedValue, setSavedValue] = useState<Record<string, unknown>>(() => cloneValue(entry.defaults))
  const [draftValue, setDraftValue] = useState<Record<string, unknown>>(() => cloneValue(entry.defaults))
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setSavedValue(cloneValue(entry.defaults))
    setDraftValue(cloneValue(entry.defaults))
    setStatus('loading')
    setErrorMessage('')

    void entry
      .load()
      .then((loadedValue) => {
        if (cancelled) {
          return
        }
        setSavedValue(cloneValue(loadedValue))
        setDraftValue(cloneValue(loadedValue))
        setStatus('idle')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setStatus('error')
        setErrorMessage(formatHostErrorMessage(error, translateHost(locale, 'settings.workflow.loadError')))
      })

    return () => {
      cancelled = true
    }
  }, [entry, locale])

  const isDirty = useMemo(() => !equalSettingsValue(savedValue, draftValue), [draftValue, savedValue])

  const statusText =
    status === 'loading'
      ? translateHost(locale, 'settings.workflow.loading')
      : status === 'saving'
        ? translateHost(locale, 'settings.workflow.saving')
        : status === 'saved'
          ? translateHost(locale, 'settings.workflow.saved')
          : status === 'error'
            ? errorMessage || translateHost(locale, 'settings.workflow.error')
            : isDirty
              ? translateHost(locale, 'settings.workflow.unsaved')
              : ''

  return (
    <div style={stackStyle}>
      {entry.sections.map((section) => (
        <section key={section.sectionId} style={sectionStyle}>
          <div style={{ display: 'grid', gap: 6 }}>
            <h2 style={sectionTitleStyle}>{section.title}</h2>
            {section.description ? <p style={sectionDescriptionStyle}>{section.description}</p> : null}
          </div>
          <WorkflowSettingsFieldList
            locale={locale}
            fields={section.fields}
            value={draftValue}
            onChange={(path, nextValue) => {
              setDraftValue((current) => setValueAtPath(current, path, nextValue))
              setStatus('idle')
            }}
            importInputRef={importInputRef}
          />
        </section>
      ))}

      <div style={floatingActionsWrapStyle}>
        <div style={floatingActionsCardStyle}>
          {statusText ? (
            <p
              style={{
                margin: 0,
                color:
                  status === 'error'
                    ? hostShellColors.errorText
                    : status === 'saved'
                      ? hostShellColors.accent
                      : hostShellColors.textMuted,
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {statusText}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={secondaryButtonStyle}
            disabled={!isDirty || status === 'saving'}
            onClick={() => {
              setDraftValue(cloneValue(savedValue))
              setStatus('idle')
            }}
          >
            {translateHost(locale, 'settings.workflow.reset')}
          </button>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={!isDirty || status === 'saving'}
            onClick={() => {
              setStatus('saving')
              setErrorMessage('')
              void entry
                .save(draftValue)
                .then((nextSavedValue) => {
                  setSavedValue(cloneValue(nextSavedValue))
                  setDraftValue(cloneValue(nextSavedValue))
                  setStatus('saved')
                })
                .catch((error) => {
                  setStatus('error')
                  setErrorMessage(formatHostErrorMessage(error, translateHost(locale, 'settings.workflow.error')))
                })
            }}
          >
            {translateHost(locale, 'settings.workflow.save')}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
