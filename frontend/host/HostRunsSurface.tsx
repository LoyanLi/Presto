import { useMemo, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'

import { EmptyState } from '../ui'
import { hostShellColors } from './hostShellColors'
import type { HostLocale } from './i18n'
import { formatCapabilityLabel, translateHost } from './i18n'
import {
  createHostRunMetricsSummary,
  getHostRunMetricsSnapshot,
  subscribeHostRunMetrics,
  type HostRunMetricListItem,
  type HostRunMetricsSummary,
} from './hostRunMetrics'

const runsSurfaceClassName = 'host-runs-surface'
const runsSurfaceGridClassName = 'host-runs-surface__grid'

const runsSurfaceResponsiveStyles = `
.${runsSurfaceGridClassName} {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@container (max-width: 759px) {
  .${runsSurfaceGridClassName} {
    grid-template-columns: minmax(0, 1fr);
  }
}
`

const pageStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 24,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
  containerType: 'inline-size',
}

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
  gridAutoRows: 'minmax(0, 1fr)',
  gap: 16,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
}

const sectionCardStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 16,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
  overflow: 'hidden',
}

const sectionHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 20,
  fontWeight: 600,
}

const sectionContentStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarGutter: 'stable',
}

const sectionBodyStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const listStyle: CSSProperties = {
  display: 'grid',
  gap: 0,
  margin: 0,
  padding: 0,
  listStyle: 'none',
}

const listItemStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: 16,
  alignItems: 'center',
  minWidth: 0,
  padding: '18px 0',
  borderTop: `1px solid ${hostShellColors.border}`,
}

const firstListItemStyle: CSSProperties = {
  ...listItemStyle,
  borderTop: 'none',
  paddingTop: 0,
}

const listItemInfoStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
}

const listItemNameStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.45,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const listItemCountStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.45,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

const listItemMetaStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
}

const emptySectionStyle: CSSProperties = {
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const sectionEmptyStateStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
}

const sectionEmptyStateTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 16,
  fontWeight: 600,
}

const sectionEmptyStateBodyStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
}

function formatMetricTimestamp(locale: HostLocale, value: string): string {
  if (!value) {
    return translateHost(locale, 'runs.lastUsed.never')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderMetricLabel(
  locale: HostLocale,
  item: HostRunMetricListItem,
  kind: 'workflow' | 'automation' | 'command',
): string {
  if (kind === 'command') {
    return formatCapabilityLabel(locale, item.key)
  }

  return item.label ?? item.key
}

function RankingSection({
  locale,
  title,
  items,
  kind,
  description,
}: {
  locale: HostLocale
  title: string
  items: HostRunMetricListItem[]
  kind: 'workflow' | 'automation' | 'command'
  description?: string
}) {
  return (
    <section style={sectionCardStyle}>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        {description ? <p style={sectionBodyStyle}>{description}</p> : null}
      </div>

      <div style={sectionContentStyle}>
        {items.length > 0 ? (
          <ol style={listStyle}>
            {items.map((item, index) => (
              <li key={item.key} style={index === 0 ? firstListItemStyle : listItemStyle}>
                <div style={listItemInfoStyle}>
                  <p style={listItemNameStyle}>{renderMetricLabel(locale, item, kind)}</p>
                  <p style={listItemMetaStyle}>
                    {translateHost(locale, 'runs.lastUsed', {
                      value: formatMetricTimestamp(locale, item.lastUsedAt),
                    })}
                  </p>
                </div>
                <p style={listItemCountStyle}>{translateHost(locale, 'runs.count', { value: item.count })}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div style={sectionEmptyStateStyle}>
            <p style={sectionEmptyStateTitleStyle}>{translateHost(locale, 'runs.list.empty')}</p>
            <p style={sectionEmptyStateBodyStyle}>{translateHost(locale, 'runs.empty.body')}</p>
          </div>
        )}
      </div>
    </section>
  )
}

export function HostRunsSurfaceView({
  locale,
  summary,
}: {
  locale: HostLocale
  summary: HostRunMetricsSummary
}) {
  const isEmpty =
    summary.totals.workflowRuns === 0 &&
    summary.totals.automationRuns === 0 &&
    summary.totals.commandRuns === 0

  return (
    <div className={runsSurfaceClassName} style={pageStyle}>
      <style>{runsSurfaceResponsiveStyles}</style>
      <div style={titleBarStyle}>
        <h1 style={titleStyle}>{translateHost(locale, 'home.runs.title')}</h1>
      </div>

      {isEmpty ? (
        <EmptyState
          title={translateHost(locale, 'runs.empty.title')}
          description={translateHost(locale, 'runs.empty.body')}
          style={emptySectionStyle}
        />
      ) : (
        <div className={runsSurfaceGridClassName} style={gridStyle}>
          <RankingSection locale={locale} title={translateHost(locale, 'runs.list.workflows')} items={summary.workflows} kind="workflow" />
          <RankingSection locale={locale} title={translateHost(locale, 'runs.list.automations')} items={summary.automations} kind="automation" />
          <RankingSection
            locale={locale}
            title={translateHost(locale, 'runs.list.commands')}
            description={translateHost(locale, 'runs.totals.body')}
            items={summary.commands}
            kind="command"
          />
        </div>
      )}
    </div>
  )
}

export function HostRunsSurface({ locale }: { locale: HostLocale }) {
  const snapshot = useSyncExternalStore(subscribeHostRunMetrics, getHostRunMetricsSnapshot, getHostRunMetricsSnapshot)
  const summary = useMemo(() => createHostRunMetricsSummary(snapshot), [snapshot])

  return <HostRunsSurfaceView locale={locale} summary={summary} />
}
