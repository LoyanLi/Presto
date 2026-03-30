import type { CSSProperties, ReactElement } from 'react'

import { Button, EmptyState, ShellSurface } from '../ui'
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
  HostBuiltinSettingsPageId,
  HostPluginSettingsEntry,
  HostSettingsPageRoute,
} from './pluginHostTypes'
import { WorkflowSettingsPage } from './settings/WorkflowSettingsPage'

export interface BuiltinSettingsEntry {
  pageId: HostBuiltinSettingsPageId
  title: string
  description: string
}

export interface HostSettingsSurfaceProps {
  settingsRoute: HostSettingsPageRoute
  settingsTitle: string
  sidebarCollapsed: boolean
  connectionStatus: HostSidebarConnectionStatus
  locale: HostLocale
  builtinSettingsNav: readonly BuiltinSettingsEntry[]
  pluginSettingsEntries: readonly HostPluginSettingsEntry[]
  activeSettingsEntry: HostPluginSettingsEntry | null
  surface: HostShellViewId
  developerMode: boolean
  settingsReturnsToWorkspace: boolean
  onSelectBuiltin(pageId: HostBuiltinSettingsPageId): void
  onSelectPlugin(pluginId: string, pageId: string): void
  onOpenDeveloper(): void
  onNavigate(route: HostPrimarySidebarRoute): void
  onToggleSidebar(): void
  onBackToWorkspace(): void
  generalPage: ReactElement
  workflowExtensionsPage: ReactElement
  automationExtensionsPage: ReactElement
}

const appShellStyle = (sidebarCollapsed: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `${sidebarCollapsed ? 72 : 272}px minmax(0, 1fr)`,
  height: '100vh',
  background: hostShellColors.canvas,
  overflow: 'hidden',
})

const settingsViewportStyle: CSSProperties = {
  display: 'grid',
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  scrollbarGutter: 'stable',
  background: hostShellColors.canvas,
}

const screenFrameStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr)',
  minHeight: 0,
  height: '100vh',
  background: hostShellColors.canvas,
  overflow: 'hidden',
}

const bodyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 304px) minmax(0, 1fr)',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
}

const navStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 20,
  minWidth: 0,
  padding: 28,
  background: hostShellColors.surfaceMuted,
  borderRight: `1px solid ${hostShellColors.border}`,
  minHeight: 0,
  overflowY: 'auto',
  scrollbarGutter: 'stable',
}

const navTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.accent,
  fontSize: 12,
  fontWeight: 600,
}

const navDescriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
}

const navListStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const navItemStyle = (active = false): CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  border: 'none',
  borderRadius: 18,
  background: active ? hostShellColors.accentSoft : 'transparent',
  color: active ? hostShellColors.text : hostShellColors.textMuted,
  fontSize: 15,
  fontWeight: active ? 600 : 500,
  textAlign: 'left',
  cursor: active ? 'default' : 'pointer',
})

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

const contentHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 16,
  minWidth: 0,
}

const contentHeaderMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  minWidth: 0,
}

const contentTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: '-0.03em',
}

const contentDescriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 15,
  lineHeight: 1.6,
}

function isSameSettingsRoute(left: HostSettingsPageRoute, right: HostSettingsPageRoute): boolean {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'builtin' && right.kind === 'builtin') {
    return left.pageId === right.pageId
  }

  return left.pluginId === right.pluginId && left.pageId === right.pageId
}

function settingsDescription(locale: HostLocale, pageId: HostBuiltinSettingsPageId): string {
  if (pageId === 'general') {
    return translateHost(locale, 'settings.general.description')
  }

  if (pageId === 'workflowExtensions') {
    return translateHost(locale, 'settings.extensions.workflows.description')
  }

  if (pageId === 'automationExtensions') {
    return translateHost(locale, 'settings.extensions.automation.description')
  }

  return translateHost(locale, 'sidebar.settings')
}

function BuiltinPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        padding: 24,
        borderRadius: 24,
        border: `1px solid ${hostShellColors.border}`,
        background: hostShellColors.surfaceMuted,
      }}
    >
      <h3 style={{ margin: 0, color: hostShellColors.text, fontSize: 18, fontWeight: 600 }}>{title}</h3>
      <p style={{ margin: 0, color: hostShellColors.textMuted, fontSize: 14, lineHeight: 1.55 }}>{description}</p>
    </div>
  )
}

export function HostSettingsSurface({
  settingsRoute,
  settingsTitle,
  sidebarCollapsed,
  connectionStatus,
  locale,
  builtinSettingsNav,
  pluginSettingsEntries,
  activeSettingsEntry,
  surface,
  developerMode,
  settingsReturnsToWorkspace,
  onSelectBuiltin,
  onSelectPlugin,
  onOpenDeveloper,
  onNavigate,
  onToggleSidebar,
  onBackToWorkspace,
  generalPage,
  workflowExtensionsPage,
  automationExtensionsPage,
}: HostSettingsSurfaceProps) {
  const builtinSettingsNavItems = builtinSettingsNav.filter(
    (entry) => entry.pageId !== 'workflowExtensions' && entry.pageId !== 'automationExtensions',
  )
  const extensionSettingsNavItems = builtinSettingsNav.filter(
    (entry) => entry.pageId === 'workflowExtensions' || entry.pageId === 'automationExtensions',
  )
  const showTopbarReturnAction = settingsRoute.kind === 'plugin' && settingsReturnsToWorkspace
  const hasPluginExtensions =
    extensionSettingsNavItems.length > 0 ||
    pluginSettingsEntries.length > 0 ||
    (settingsRoute.kind === 'builtin' &&
      (settingsRoute.pageId === 'workflowExtensions' || settingsRoute.pageId === 'automationExtensions'))

  const renderSettingsContent = (): ReactElement => {
    if (settingsRoute.kind === 'plugin') {
      if (!activeSettingsEntry) {
        return (
          <EmptyState
            title={translateHost(locale, 'settings.unavailable')}
            description={translateHost(locale, 'settings.unavailable.body')}
          />
        )
      }

      return <WorkflowSettingsPage entry={activeSettingsEntry} locale={locale} />
    }

    if (settingsRoute.pageId === 'general') {
      return generalPage
    }

    if (settingsRoute.pageId === 'workflowExtensions') {
      return workflowExtensionsPage
    }

    if (settingsRoute.pageId === 'automationExtensions') {
      return automationExtensionsPage
    }

    const entry = builtinSettingsNav.find((item) => item.pageId === settingsRoute.pageId)
    return <BuiltinPlaceholder title={entry?.title ?? 'Settings'} description={entry?.description ?? 'Page not configured yet.'} />
  }

  return (
    <ShellSurface density="standard" edgeToEdge>
      <div style={appShellStyle(sidebarCollapsed)}>
            <HostPrimarySidebar
              activeRoute="settings"
              collapsed={sidebarCollapsed}
              connectionStatus={connectionStatus}
              locale={locale}
              onSelect={onNavigate}
              onToggleCollapse={onToggleSidebar}
            />
        <div style={settingsViewportStyle}>
          <div style={screenFrameStyle}>
            <div style={bodyStyle}>
                  <aside style={navStyle}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <p style={navTitleStyle}>{translateHost(locale, 'settings.configuration')}</p>
                      <p style={navDescriptionStyle}>
                        {translateHost(locale, 'settings.configuration.body')}
                      </p>
                    </div>

                <div style={navListStyle}>
                  {builtinSettingsNavItems.map((entry) => (
                    <button
                      key={entry.pageId}
                      type="button"
                      style={navItemStyle(settingsRoute.kind === 'builtin' && settingsRoute.pageId === entry.pageId)}
                      onClick={() => onSelectBuiltin(entry.pageId)}
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>

                    {hasPluginExtensions ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <p style={navTitleStyle}>{translateHost(locale, 'settings.extensions')}</p>
                        {extensionSettingsNavItems.map((entry) => (
                          <button
                            key={entry.pageId}
                            type="button"
                            style={navItemStyle(settingsRoute.kind === 'builtin' && settingsRoute.pageId === entry.pageId)}
                            onClick={() => onSelectBuiltin(entry.pageId)}
                          >
                            {entry.title}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {pluginSettingsEntries.length > 0 ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <p style={navTitleStyle}>{translateHost(locale, 'settings.workflowPages')}</p>
                    {pluginSettingsEntries.map((entry) => (
                      <button
                        key={`${entry.pluginId}:${entry.pageId}`}
                        type="button"
                        style={navItemStyle(
                          isSameSettingsRoute(settingsRoute, {
                            kind: 'plugin',
                            pluginId: entry.pluginId,
                            pageId: entry.pageId,
                          }),
                        )}
                        onClick={() => onSelectPlugin(entry.pluginId, entry.pageId)}
                      >
                        {entry.title}
                      </button>
                    ))}
                  </div>
                ) : null}

                    {developerMode ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        <p style={navTitleStyle}>{translateHost(locale, 'settings.diagnostics')}</p>
                        <button type="button" style={navItemStyle(surface === 'developer')} onClick={onOpenDeveloper}>
                          {translateHost(locale, 'general.developer')}
                        </button>
                      </div>
                    ) : null}
              </aside>

              <div style={contentStyle}>
                <div style={contentHeaderStyle}>
                  <div style={contentHeaderMetaStyle}>
                    <h1 style={contentTitleStyle}>{settingsTitle}</h1>
                    <p style={contentDescriptionStyle}>
                      {settingsRoute.kind === 'builtin'
                        ? settingsDescription(locale, settingsRoute.pageId)
                        : translateHost(locale, 'settings.plugin.description')}
                    </p>
                  </div>
                  {showTopbarReturnAction ? (
                    <Button variant="secondary" size="sm" onClick={onBackToWorkspace}>
                      {translateHost(locale, 'settings.back')}
                    </Button>
                  ) : null}
                </div>

                {renderSettingsContent()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShellSurface>
  )
}
