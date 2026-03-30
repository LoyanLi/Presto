import type { CSSProperties, ReactElement } from 'react'

import type { PluginRuntime, PrestoClient } from '../../packages/contracts/src'
import { Button, EmptyState, ShellSurface } from '../ui'
import { AutomationSurface } from './automation/AutomationSurface'
import type { HostShellViewId } from './hostShellState'
import { hostShellColors } from './hostShellColors'
import type { HostLocale } from './i18n'
import { translateHost } from './i18n'
import {
  HostPrimarySidebar,
  type HostPrimarySidebarRoute,
  type HostSidebarConnectionStatus,
} from './HostPrimarySidebar'
import type {
  HostAutomationEntry,
  HostPluginHomeEntry,
  HostPluginSettingsEntry,
  HostRenderedPluginPage,
  HostSettingsPageRoute,
  HostWorkspacePageRoute,
} from './pluginHostTypes'

type HostPrimarySurface = Extract<HostShellViewId, 'home' | 'workflows' | 'automation' | 'runs'>

export interface HostHomeSurfaceProps {
  surface: HostPrimarySurface
  developerPresto: PrestoClient
  developerRuntime: PluginRuntime
  sidebarCollapsed: boolean
  connectionStatus: HostSidebarConnectionStatus
  locale: HostLocale
  pluginHomeEntries: readonly HostPluginHomeEntry[]
  automationEntries: readonly HostAutomationEntry[]
  workspacePageRoute: HostWorkspacePageRoute | null
  activeWorkspacePage: HostRenderedPluginPage | null
  workspaceSettingsEntry: HostPluginSettingsEntry | null
  onOpenSettings(route?: HostSettingsPageRoute): void
  onOpenWorkspace(route: HostWorkspacePageRoute): void
  onNavigate(surface: HostPrimarySurface): void
  onToggleSidebar(): void
}

const screenFrameStyle = (sidebarCollapsed: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `${sidebarCollapsed ? 72 : 272}px minmax(0, 1fr)`,
  height: '100vh',
  background: hostShellColors.canvas,
  overflow: 'hidden',
})

const mainPaneStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr)',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: hostShellColors.canvas,
}

const contentStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 24,
  padding: 32,
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarGutter: 'stable',
  boxSizing: 'border-box',
}

const workspaceContentStyle: CSSProperties = {
  display: 'grid',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  padding: 32,
  boxSizing: 'border-box',
}

const titleBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
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

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
}

const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
}

const summaryCardStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  minWidth: 0,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 18,
  fontWeight: 600,
}

const summaryBodyStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const workflowGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
}

const workflowCardStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  minWidth: 0,
  padding: 24,
  borderRadius: 24,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surfaceMuted,
}

const workflowMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const workflowTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 20,
  fontWeight: 600,
}

const workflowDescriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const workflowSurfaceStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 20,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
}

function SummaryCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction(): void
}) {
  return (
    <div style={summaryCardStyle}>
      <h3 style={summaryTitleStyle}>{title}</h3>
      <p style={summaryBodyStyle}>{description}</p>
      <Button variant="secondary" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}

function PlaceholderSection({
  title,
  locale,
}: {
  title: string
  locale: HostLocale
}) {
  return (
    <>
      <div style={titleBarStyle}>
        <h1 style={titleStyle}>{title}</h1>
      </div>
      <EmptyState
        title={title}
        description={translateHost(locale, 'home.placeholder.body')}
        style={summaryCardStyle}
      />
    </>
  )
}

function normalizeSidebarRoute(surface: HostPrimarySurface): HostPrimarySidebarRoute {
  return surface
}

export function HostHomeSurface({
  surface,
  developerPresto,
  developerRuntime,
  sidebarCollapsed,
  connectionStatus,
  locale,
  pluginHomeEntries,
  automationEntries,
  workspacePageRoute,
  activeWorkspacePage,
  workspaceSettingsEntry,
  onOpenSettings,
  onOpenWorkspace,
  onNavigate,
  onToggleSidebar,
}: HostHomeSurfaceProps) {
  const hasActiveWorkspace = surface === 'workflows' && workspacePageRoute !== null

  const renderHomeContent = (): ReactElement => (
    <>
      <div style={titleBarStyle}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h1 style={titleStyle}>{translateHost(locale, 'home.overview')}</h1>
          <p style={eyebrowStyle}>{translateHost(locale, 'home.overview.recommended')}</p>
        </div>
      </div>

      <div style={summaryGridStyle}>
        <SummaryCard
          title={translateHost(locale, 'home.workflows.title')}
          description={translateHost(locale, 'home.workflows.body')}
          actionLabel={translateHost(locale, 'home.workflows.action')}
          onAction={() => onNavigate('workflows')}
        />
        <SummaryCard
          title={translateHost(locale, 'home.automation.title')}
          description={translateHost(locale, 'home.automation.body')}
          actionLabel={translateHost(locale, 'home.automation.action')}
          onAction={() => onNavigate('automation')}
        />
        <SummaryCard
          title={translateHost(locale, 'home.runs.title')}
          description={translateHost(locale, 'home.runs.body')}
          actionLabel={translateHost(locale, 'home.runs.action')}
          onAction={() => onNavigate('runs')}
        />
        <SummaryCard
          title={translateHost(locale, 'home.settings.title')}
          description={translateHost(locale, 'home.settings.body')}
          actionLabel={translateHost(locale, 'home.settings.action')}
          onAction={() => onOpenSettings({ kind: 'builtin', pageId: 'general' })}
        />
      </div>
    </>
  )

  const renderWorkflowLibrary = (): ReactElement => {
    if (workspacePageRoute !== null) {
      return (
        <div style={workflowSurfaceStyle}>
          <div style={titleBarStyle}>
            <h1 style={titleStyle}>{activeWorkspacePage?.title ?? 'Workflow surface'}</h1>
            {workspaceSettingsEntry ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onOpenSettings({
                    kind: 'plugin',
                    pluginId: workspaceSettingsEntry.pluginId,
                    pageId: workspaceSettingsEntry.pageId,
                  })
                }}
              >
                {translateHost(locale, 'home.pluginSettings')}
              </Button>
            ) : null}
          </div>

          {activeWorkspacePage
            ? activeWorkspacePage.render()
            : (
              <EmptyState
                title={translateHost(locale, 'home.workflowUnavailable')}
                description={translateHost(locale, 'home.workflowUnavailable.body')}
                style={summaryCardStyle}
              />
            )}
        </div>
      )
    }

    return (
      <>
        <div style={titleBarStyle}>
          <h1 style={titleStyle}>{translateHost(locale, 'home.workflowLibrary')}</h1>
        </div>

        {pluginHomeEntries.length > 0 ? (
          <div style={workflowGridStyle}>
            {pluginHomeEntries.map((entry) => (
              <div key={`${entry.pluginId}:${entry.pageId}`} style={workflowCardStyle}>
                <div style={workflowMetaStyle}>
                  <h3 style={workflowTitleStyle}>{entry.title}</h3>
                  <p style={workflowDescriptionStyle}>{entry.description}</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onOpenWorkspace({
                        pluginId: entry.pluginId,
                        pageId: entry.pageId,
                      })
                    }}
                  >
                    {translateHost(locale, 'home.openWorkflow')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={translateHost(locale, 'home.noWorkflows')}
            description={translateHost(locale, 'home.noWorkflows.body')}
            style={summaryCardStyle}
          />
        )}
      </>
    )
  }

  const renderContent = (): ReactElement => {
    if (surface === 'workflows') {
      return renderWorkflowLibrary()
    }

    if (surface === 'automation') {
      return <AutomationSurface locale={locale} presto={developerPresto} automationEntries={automationEntries} />
    }

    if (surface === 'runs') {
      return (
        <PlaceholderSection
          title={translateHost(locale, 'home.runs.title')}
          locale={locale}
        />
      )
    }

    return renderHomeContent()
  }

  return (
    <ShellSurface density="standard" edgeToEdge>
      <div style={screenFrameStyle(sidebarCollapsed)}>
        <HostPrimarySidebar
          activeRoute={normalizeSidebarRoute(surface)}
          collapsed={sidebarCollapsed}
          connectionStatus={connectionStatus}
          locale={locale}
          reselectableRoutes={hasActiveWorkspace ? ['workflows'] : undefined}
          onSelect={onNavigate}
          onToggleCollapse={onToggleSidebar}
        />
        <main style={mainPaneStyle}>
          <div style={hasActiveWorkspace ? workspaceContentStyle : contentStyle}>
            {renderContent()}
          </div>
        </main>
      </div>
    </ShellSurface>
  )
}
