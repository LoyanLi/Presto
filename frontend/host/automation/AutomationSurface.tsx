import type { CSSProperties } from 'react'

import { EmptyState } from '../../ui'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostAutomationEntry } from '../pluginHostTypes'
import { AutomationRunnerCard } from './cards/AutomationRunnerCard'

const titleBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  minWidth: 0,
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: '-0.03em',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
  alignItems: 'start',
}

const emptyStateStyle: CSSProperties = {
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

export function AutomationSurface({
  locale,
  automationEntries,
}: {
  locale: HostLocale
  automationEntries: readonly HostAutomationEntry[]
}) {
  return (
    <>
      <div style={titleBarStyle}>
        <h1 style={titleStyle}>{translateHost(locale, 'home.automation.title')}</h1>
      </div>
      {automationEntries.length > 0 ? (
        <div style={gridStyle}>
          {automationEntries.map((entry) => (
            <AutomationRunnerCard key={`${entry.pluginId}:${entry.itemId}`} locale={locale} entry={entry} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={translateHost(locale, 'home.noAutomation')}
          description={translateHost(locale, 'home.noAutomation.body')}
          style={emptyStateStyle}
        />
      )}
    </>
  )
}
