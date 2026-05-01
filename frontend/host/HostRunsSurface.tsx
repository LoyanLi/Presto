import { useMemo, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'

import { Button, EmptyState, Tabs } from '../ui'
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

type RunMetricKind = 'workflow' | 'automation' | 'tool' | 'command'
type RunsSurfaceViewMode = 'overview' | RunMetricKind
type RunMetricLabelOverrides = Partial<Record<Exclude<RunMetricKind, 'command'>, Record<string, string>>>

const runsSurfaceOverviewGridClassName = 'host-runs-surface__overview-grid'

const runsSurfaceResponsiveStyles = `
.${runsSurfaceOverviewGridClassName} {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@container (max-width: 759px) {
  .${runsSurfaceOverviewGridClassName} {
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

const headerStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  minWidth: 0,
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: '-0.03em',
}

const bodyStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.6,
  maxWidth: 760,
}

const contentStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
}

const overviewLayoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto auto',
  alignContent: 'start',
  gap: 16,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarGutter: 'stable',
}

const overviewGridStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  alignContent: 'start',
}

const overviewCardStyle: CSSProperties = {
  appearance: 'none',
  display: 'grid',
  gap: 12,
  width: '100%',
  padding: 22,
  border: `1px solid ${hostShellColors.border}`,
  borderRadius: 24,
  background: hostShellColors.surfaceMuted,
  color: hostShellColors.text,
  textAlign: 'left',
  cursor: 'pointer',
}

const overviewCardLabelStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const overviewCardValueStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 34,
  fontWeight: 600,
  lineHeight: 1,
}

const overviewCardMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
}

const overviewCardTopStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.45,
}

const overviewCardHintStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
}

const overviewHintStyle: CSSProperties = {
  padding: 20,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const detailLayoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 16,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
}

const detailToolbarStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  minWidth: 0,
}

const detailTabsWrapStyle: CSSProperties = {
  minWidth: 0,
  padding: 8,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
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

const runSectionDefinitions: readonly {
  id: RunMetricKind
  totalKey: 'workflowRuns' | 'automationRuns' | 'toolRuns' | 'commandRuns'
  totalLabelKey: 'runs.total.workflows' | 'runs.total.automations' | 'runs.total.tools' | 'runs.total.commands'
  listTitleKey: 'runs.list.workflows' | 'runs.list.automations' | 'runs.list.tools' | 'runs.list.commands'
  summaryKey: 'workflows' | 'automations' | 'tools' | 'commands'
  topKey: 'topWorkflow' | 'topAutomation' | 'topTool' | 'topCommand'
  descriptionKey?: 'runs.totals.body'
}[] = [
  {
    id: 'workflow',
    totalKey: 'workflowRuns',
    totalLabelKey: 'runs.total.workflows',
    listTitleKey: 'runs.list.workflows',
    summaryKey: 'workflows',
    topKey: 'topWorkflow',
  },
  {
    id: 'automation',
    totalKey: 'automationRuns',
    totalLabelKey: 'runs.total.automations',
    listTitleKey: 'runs.list.automations',
    summaryKey: 'automations',
    topKey: 'topAutomation',
  },
  {
    id: 'tool',
    totalKey: 'toolRuns',
    totalLabelKey: 'runs.total.tools',
    listTitleKey: 'runs.list.tools',
    summaryKey: 'tools',
    topKey: 'topTool',
  },
  {
    id: 'command',
    totalKey: 'commandRuns',
    totalLabelKey: 'runs.total.commands',
    listTitleKey: 'runs.list.commands',
    summaryKey: 'commands',
    topKey: 'topCommand',
    descriptionKey: 'runs.totals.body',
  },
]

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
  kind: RunMetricKind,
  labelOverrides?: RunMetricLabelOverrides,
): string {
  if (kind === 'command') {
    return formatCapabilityLabel(locale, item.key)
  }

  const override = labelOverrides?.[kind]?.[item.key]
  if (override && override.trim().length > 0) {
    return override
  }

  return item.label ?? item.key
}

function buildRunSections(
  locale: HostLocale,
  summary: HostRunMetricsSummary,
  labelOverrides?: RunMetricLabelOverrides,
) {
  return runSectionDefinitions.map((definition) => {
    const topItem = summary[definition.topKey]

    return {
      id: definition.id,
      kind: definition.id,
      totalCount: summary.totals[definition.totalKey],
      totalLabel: translateHost(locale, definition.totalLabelKey),
      title: translateHost(locale, definition.listTitleKey),
      description: definition.descriptionKey ? translateHost(locale, definition.descriptionKey) : undefined,
      items: summary[definition.summaryKey],
      highlightLabel: topItem
        ? renderMetricLabel(locale, topItem, definition.id, labelOverrides)
        : translateHost(locale, 'runs.highlights.none'),
      highlightMeta: topItem
        ? translateHost(locale, 'runs.lastUsed', {
            value: formatMetricTimestamp(locale, topItem.lastUsedAt),
          })
        : undefined,
    }
  })
}

function RankingSection({
  locale,
  title,
  items,
  kind,
  description,
  labelOverrides,
}: {
  locale: HostLocale
  title: string
  items: HostRunMetricListItem[]
  kind: RunMetricKind
  description?: string
  labelOverrides?: RunMetricLabelOverrides
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
                  <p style={listItemNameStyle}>{renderMetricLabel(locale, item, kind, labelOverrides)}</p>
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
  initialView = 'overview',
  labelOverrides,
}: {
  locale: HostLocale
  summary: HostRunMetricsSummary
  initialView?: RunsSurfaceViewMode
  labelOverrides?: RunMetricLabelOverrides
}) {
  const [view, setView] = useState<RunsSurfaceViewMode>(initialView)
  const sections = useMemo(() => buildRunSections(locale, summary, labelOverrides), [locale, labelOverrides, summary])
  const activeSection = view === 'overview' ? null : sections.find((section) => section.id === view) ?? sections[0]

  const isEmpty =
    summary.totals.workflowRuns === 0 &&
    summary.totals.automationRuns === 0 &&
    summary.totals.toolRuns === 0 &&
    summary.totals.commandRuns === 0

  return (
    <div className="host-runs-surface" style={pageStyle}>
      <style>{runsSurfaceResponsiveStyles}</style>
      <div style={headerStyle}>
        <h1 style={titleStyle}>{translateHost(locale, 'home.runs.title')}</h1>
        <p style={bodyStyle}>{translateHost(locale, 'runs.body')}</p>
      </div>

      {isEmpty ? (
        <EmptyState
          title={translateHost(locale, 'runs.empty.title')}
          description={translateHost(locale, 'runs.empty.body')}
          style={emptySectionStyle}
        />
      ) : (
        <div style={contentStyle}>
          {activeSection ? (
            <div style={detailLayoutStyle}>
              <div style={detailToolbarStyle}>
                <div>
                  <Button variant="secondary" size="sm" onClick={() => setView('overview')}>
                    {translateHost(locale, 'runs.overview.back')}
                  </Button>
                </div>
                <div style={detailTabsWrapStyle}>
                  <Tabs
                    items={sections.map((section) => ({
                      id: section.id,
                      label: section.totalLabel,
                      count: section.totalCount,
                    }))}
                    value={activeSection.id}
                    onChange={(nextValue) => setView(nextValue)}
                  />
                </div>
              </div>

              <RankingSection
                locale={locale}
                title={activeSection.title}
                description={activeSection.description}
                items={activeSection.items}
                kind={activeSection.kind}
                labelOverrides={labelOverrides}
              />
            </div>
          ) : (
            <div style={overviewLayoutStyle}>
              <div className={runsSurfaceOverviewGridClassName} style={overviewGridStyle}>
                {sections.map((section) => (
                  <button key={section.id} type="button" style={overviewCardStyle} onClick={() => setView(section.id)}>
                    <p style={overviewCardLabelStyle}>{section.totalLabel}</p>
                    <p style={overviewCardValueStyle}>{section.totalCount}</p>
                    <div style={overviewCardMetaStyle}>
                      <p style={overviewCardTopStyle}>{section.highlightLabel}</p>
                      {section.highlightMeta ? <p style={overviewCardHintStyle}>{section.highlightMeta}</p> : null}
                    </div>
                  </button>
                ))}
              </div>

              <section style={overviewHintStyle}>
                <p style={sectionEmptyStateTitleStyle}>{translateHost(locale, 'runs.overview.prompt')}</p>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function HostRunsSurface({
  locale,
  labelOverrides,
}: {
  locale: HostLocale
  labelOverrides?: RunMetricLabelOverrides
}) {
  const snapshot = useSyncExternalStore(subscribeHostRunMetrics, getHostRunMetricsSnapshot, getHostRunMetricsSnapshot)
  const summary = useMemo(() => createHostRunMetricsSummary(snapshot), [snapshot])

  return <HostRunsSurfaceView locale={locale} summary={summary} labelOverrides={labelOverrides} />
}
