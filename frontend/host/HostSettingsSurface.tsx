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

type HostSettingsNavGroupId = 'configuration' | 'extensions' | 'workflowViews' | 'diagnostics'

interface HostSettingsNavItem {
  key: string
  title: string
  isActive: boolean
  kind: 'builtin' | 'plugin'
  pageId: string
  pluginId?: string
}

interface HostSettingsNavGroup {
  id: HostSettingsNavGroupId
  title: string
  isActive: boolean
  items: HostSettingsNavItem[]
  defaultItem: HostSettingsNavItem | null
}

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
  dawPage: ReactElement
  permissionsPage: ReactElement
  updatesPage: ReactElement
  diagnosticsPage: ReactElement
  workflowExtensionsPage: ReactElement
  automationExtensionsPage: ReactElement
  toolExtensionsPage: ReactElement
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
  gridTemplateRows: 'minmax(0, 1fr)',
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
  background: hostShellColors.canvas,
}

const screenFrameStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr)',
  minHeight: 0,
  height: '100%',
  background: hostShellColors.canvas,
  overflow: 'hidden',
}

const bodyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 304px) minmax(0, 1fr)',
  gridTemplateRows: 'minmax(0, 1fr)',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
}

const navStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  gap: 24,
  minWidth: 0,
  padding: 28,
  background: hostShellColors.surfaceMuted,
  borderRight: `1px solid ${hostShellColors.border}`,
  minHeight: 0,
}

const navGroupListStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 10,
  minHeight: 0,
  overflowY: 'auto',
  scrollbarGutter: 'stable',
}

const navGroupButtonStyle = (active = false): CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  border: 'none',
  borderRadius: 18,
  background: active ? hostShellColors.accentSoft : 'transparent',
  color: active ? hostShellColors.text : hostShellColors.textMuted,
  fontSize: 15,
  fontWeight: active ? 600 : 500,
  textAlign: 'left',
  cursor: active ? 'default' : 'pointer',
})

const navGroupLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
  flex: 1,
}

const navGroupLeadingIndicatorStyle = (active = false): CSSProperties => ({
  width: 3,
  height: 14,
  borderRadius: 999,
  flexShrink: 0,
  background: active ? hostShellColors.accent : hostShellColors.borderStrong,
})

const navGroupChevronStyle = (active = false): CSSProperties => ({
  width: 12,
  height: 12,
  display: 'block',
  flexShrink: 0,
  color: active ? hostShellColors.accent : hostShellColors.textMuted,
  transform: active ? 'rotate(90deg)' : 'rotate(0deg)',
  transformOrigin: '50% 50%',
  transformBox: 'fill-box',
  transition: 'transform 140ms ease',
  opacity: active ? 0.95 : 0.7,
})

function NavGroupChevron({ active }: { active: boolean }): ReactElement {
  return (
    <svg viewBox="0 0 12 12" fill="none" style={navGroupChevronStyle(active)}>
      <path d="M4 2.75L8.5 6L4 9.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const navChildListStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  paddingLeft: 12,
  marginLeft: 16,
  borderLeft: `1px solid ${hostShellColors.border}`,
}

const navChildButtonStyle = (active = false): CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '10px 14px',
  border: 'none',
  borderRadius: 14,
  background: active ? hostShellColors.accentSoft : 'transparent',
  color: active ? hostShellColors.text : hostShellColors.textMuted,
  fontSize: 14,
  fontWeight: active ? 600 : 500,
  textAlign: 'left',
  cursor: active ? 'default' : 'pointer',
})

const navChildLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
}

const navChildIndicatorStyle = (active = false): CSSProperties => ({
  width: 4,
  height: 4,
  borderRadius: 999,
  flexShrink: 0,
  background: active ? hostShellColors.accent : hostShellColors.textSubtle,
})

const navUtilityStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  paddingTop: 4,
  borderTop: `1px solid ${hostShellColors.border}`,
}

const contentStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
}

const contentBodyStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 24,
  padding: '0 32px 32px',
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
  padding: '32px 32px 24px',
}

const contentHeaderMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  minWidth: 0,
}

const contentSectionLabelStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.accent,
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
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

  if (pageId === 'daw') {
    return translateHost(locale, 'settings.daw.description')
  }

  if (pageId === 'permissions') {
    return translateHost(locale, 'settings.permissions.description')
  }

  if (pageId === 'updates') {
    return translateHost(locale, 'settings.updates.description')
  }

  if (pageId === 'diagnostics') {
    return translateHost(locale, 'settings.diagnostics.description')
  }

  if (pageId === 'workflowExtensions') {
    return translateHost(locale, 'settings.extensions.workflows.description')
  }

  if (pageId === 'automationExtensions') {
    return translateHost(locale, 'settings.extensions.automation.description')
  }

  if (pageId === 'toolExtensions') {
    return translateHost(locale, 'settings.extensions.tools.description')
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

function selectSettingsNavItem(
  item: HostSettingsNavItem,
  onSelectBuiltin: (pageId: HostBuiltinSettingsPageId) => void,
  onSelectPlugin: (pluginId: string, pageId: string) => void,
) {
  if (item.kind === 'builtin') {
    onSelectBuiltin(item.pageId as HostBuiltinSettingsPageId)
    return
  }

  onSelectPlugin(item.pluginId ?? '', item.pageId)
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
  dawPage,
  permissionsPage,
  updatesPage,
  diagnosticsPage,
  workflowExtensionsPage,
  automationExtensionsPage,
  toolExtensionsPage,
}: HostSettingsSurfaceProps) {
  const builtinSettingsNavItems = builtinSettingsNav.filter(
    (entry) =>
      entry.pageId !== 'diagnostics' &&
      entry.pageId !== 'workflowExtensions' &&
      entry.pageId !== 'automationExtensions' &&
      entry.pageId !== 'toolExtensions',
  )
  const extensionSettingsNavItems = builtinSettingsNav.filter(
    (entry) =>
      entry.pageId === 'workflowExtensions' ||
      entry.pageId === 'automationExtensions' ||
      entry.pageId === 'toolExtensions',
  )
  const showTopbarReturnAction = settingsRoute.kind === 'plugin' && settingsReturnsToWorkspace
  const configurationItems: HostSettingsNavItem[] = builtinSettingsNavItems.map((entry) => ({
    key: entry.pageId,
    title: entry.title,
    isActive: settingsRoute.kind === 'builtin' && settingsRoute.pageId === entry.pageId,
    kind: 'builtin',
    pageId: entry.pageId,
  }))
  const extensionItems: HostSettingsNavItem[] = extensionSettingsNavItems.map((entry) => ({
    key: entry.pageId,
    title: entry.title,
    isActive: settingsRoute.kind === 'builtin' && settingsRoute.pageId === entry.pageId,
    kind: 'builtin',
    pageId: entry.pageId,
  }))
  const workflowViewItems: HostSettingsNavItem[] = pluginSettingsEntries.map((entry) => ({
    key: `${entry.pluginId}:${entry.pageId}`,
    title: entry.title,
    isActive: isSameSettingsRoute(settingsRoute, {
      kind: 'plugin',
      pluginId: entry.pluginId,
      pageId: entry.pageId,
    }),
    kind: 'plugin',
    pluginId: entry.pluginId,
    pageId: entry.pageId,
  }))
  const diagnosticsItems: HostSettingsNavItem[] = [
    {
      key: 'diagnostics',
      title: translateHost(locale, 'settings.diagnostics.title'),
      isActive: settingsRoute.kind === 'builtin' && settingsRoute.pageId === 'diagnostics',
      kind: 'builtin',
      pageId: 'diagnostics',
    },
  ]
  const activeSettingsNavGroupId: HostSettingsNavGroupId | null =
    settingsRoute.kind === 'plugin'
      ? 'workflowViews'
      : settingsRoute.pageId === 'workflowExtensions' ||
          settingsRoute.pageId === 'automationExtensions' ||
          settingsRoute.pageId === 'toolExtensions'
        ? 'extensions'
        : settingsRoute.pageId === 'diagnostics'
          ? 'diagnostics'
          : 'configuration'
  const settingsNavGroups: HostSettingsNavGroup[] = [
    {
      id: 'configuration',
      title: translateHost(locale, 'settings.configuration'),
      isActive: activeSettingsNavGroupId === 'configuration',
      items: configurationItems,
      defaultItem: configurationItems[0] ?? null,
    },
    extensionItems.length > 0
      ? {
          id: 'extensions',
          title: translateHost(locale, 'settings.extensions'),
          isActive: activeSettingsNavGroupId === 'extensions',
          items: extensionItems,
          defaultItem: extensionItems[0] ?? null,
        }
      : null,
    workflowViewItems.length > 0
      ? {
          id: 'workflowViews',
          title: translateHost(locale, 'settings.workflowPages'),
          isActive: activeSettingsNavGroupId === 'workflowViews',
          items: workflowViewItems,
          defaultItem: workflowViewItems[0] ?? null,
        }
      : null,
    {
      id: 'diagnostics',
      title: translateHost(locale, 'settings.diagnostics'),
      isActive: activeSettingsNavGroupId === 'diagnostics',
      items: diagnosticsItems,
      defaultItem: diagnosticsItems[0] ?? null,
    },
  ].filter((group): group is HostSettingsNavGroup => group !== null)
  const activeSettingsNavGroup = settingsNavGroups.find((group) => group.id === activeSettingsNavGroupId) ?? null
  const activeSettingsNavItems = activeSettingsNavGroup?.items ?? []

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

    if (settingsRoute.pageId === 'daw') {
      return dawPage
    }

    if (settingsRoute.pageId === 'permissions') {
      return permissionsPage
    }

    if (settingsRoute.pageId === 'updates') {
      return updatesPage
    }

    if (settingsRoute.pageId === 'diagnostics') {
      return diagnosticsPage
    }

    if (settingsRoute.pageId === 'workflowExtensions') {
      return workflowExtensionsPage
    }

    if (settingsRoute.pageId === 'automationExtensions') {
      return automationExtensionsPage
    }

    if (settingsRoute.pageId === 'toolExtensions') {
      return toolExtensionsPage
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
                  <div style={navGroupListStyle}>
                    {settingsNavGroups.map((group) => (
                      <div key={group.id} style={{ display: 'grid', gap: 8 }}>
                        <button
                          type="button"
                          style={navGroupButtonStyle(group.isActive)}
                          onClick={() => {
                            if (group.defaultItem) {
                              selectSettingsNavItem(group.defaultItem, onSelectBuiltin, onSelectPlugin)
                            }
                          }}
                        >
                          <span style={navGroupLabelStyle}>
                            <span aria-hidden="true" style={navGroupLeadingIndicatorStyle(group.isActive)} />
                            <span>{group.title}</span>
                          </span>
                          {group.items.length > 1 ? (
                            <span aria-hidden="true">
                              <NavGroupChevron active={group.isActive} />
                            </span>
                          ) : (
                            <span aria-hidden="true" style={{ width: 8, height: 8, flexShrink: 0 }} />
                          )}
                        </button>
                        {group.isActive && group.items.length > 1 ? (
                          <div style={navChildListStyle}>
                            {group.items.map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                style={navChildButtonStyle(item.isActive)}
                                onClick={() => selectSettingsNavItem(item, onSelectBuiltin, onSelectPlugin)}
                              >
                                <span style={navChildLabelStyle}>
                                  <span aria-hidden="true" style={navChildIndicatorStyle(item.isActive)} />
                                  <span>{item.title}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {developerMode ? (
                    <div style={navUtilityStyle}>
                      <Button variant="secondary" size="sm" onClick={onOpenDeveloper}>
                        {translateHost(locale, 'general.developer')}
                      </Button>
                    </div>
                  ) : null}
                </aside>

                <div style={contentStyle}>
                  <div style={contentHeaderStyle}>
                    <div style={contentHeaderMetaStyle}>
                      <p style={contentSectionLabelStyle}>{activeSettingsNavGroup?.title ?? translateHost(locale, 'sidebar.settings')}</p>
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

                  <div style={contentBodyStyle}>
                    {renderSettingsContent()}
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        </ShellSurface>
  )
}
