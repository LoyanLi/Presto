import type { CSSProperties } from 'react'

import type { PrestoClient } from '../../../packages/contracts/src'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type { HostAutomationEntry } from '../pluginHostTypes'
import { SplitStereoToMonoCard } from './cards/SplitStereoToMonoCard'

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
}

export function AutomationSurface({
  locale,
  presto,
  automationEntries,
}: {
  locale: HostLocale
  presto: PrestoClient
  automationEntries: readonly HostAutomationEntry[]
}) {
  const supportedEntries = automationEntries.filter((entry) => entry.automationType === 'splitStereoToMono')

  return (
    <>
      <div style={titleBarStyle}>
        <h1 style={titleStyle}>{translateHost(locale, 'home.automation.title')}</h1>
      </div>
      <div style={gridStyle}>
        {supportedEntries.map((entry) => (
          <SplitStereoToMonoCard key={entry.itemId} locale={locale} presto={presto} />
        ))}
      </div>
    </>
  )
}
