import type { CSSProperties, ReactElement } from 'react'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import CableOutlined from '@mui/icons-material/CableOutlined'
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined'
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined'
import WidgetsOutlined from '@mui/icons-material/WidgetsOutlined'
import prestoLogoPng from '../../assets/PrestoLogoPng.png'
import { hostShellColors } from './hostShellColors'
import type { HostLocale } from './i18n'
import { translateHost } from './i18n'

export interface HostSidebarConnectionStatus {
  connected: boolean
  targetLabel: string
  sessionName: string
  statusLabel: string
}

export type HostPrimarySidebarRoute = 'home' | 'workflows' | 'tools' | 'automation' | 'runs' | 'settings'

const HOST_SIDEBAR_EXPANDED_WIDTH = 272
const HOST_SIDEBAR_COLLAPSED_WIDTH = 72

const sidebarStyle = (collapsed: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: 16,
  background: hostShellColors.surface,
  borderRight: `1px solid ${hostShellColors.border}`,
  height: '100vh',
  overflow: 'hidden',
  width: collapsed ? HOST_SIDEBAR_COLLAPSED_WIDTH : HOST_SIDEBAR_EXPANDED_WIDTH,
})

const sidebarHeaderStyle = (collapsed: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  gap: 8,
  minHeight: 64,
  padding: '12px 16px',
  boxSizing: 'border-box',
})

const logoRowStyle = (collapsed: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  height: 44,
  minWidth: 0,
  justifyContent: collapsed ? 'center' : 'flex-start',
  flex: '1 1 auto',
})

const brandTitleStyle = (collapsed: boolean): CSSProperties => ({
  margin: 0,
  color: hostShellColors.text,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.5,
  display: collapsed ? 'none' : 'block',
})

const collapsedBrandIconStyle: CSSProperties = {
  width: 40,
  height: 40,
  objectFit: 'contain',
  display: 'block',
  flexShrink: 0,
  filter: 'var(--presto-logo-filter, none)',
}

const navStackStyle = (collapsed: boolean): CSSProperties => ({
  display: 'grid',
  alignContent: 'start',
  gap: 8,
  padding: '0 16px 0',
  minHeight: 0,
  boxSizing: 'border-box',
})

// Left bottom connection indicator stays pinned below the navigation stack.
const connectionFooterStyle = (collapsed: boolean): CSSProperties => ({
  display: 'grid',
  gap: 10,
  padding: '0 16px 18px',
  minWidth: 0,
  alignSelf: 'end',
  boxSizing: 'border-box',
})

const connectionChipStyle = (connected: boolean, collapsed: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  gap: 10,
  height: 44,
  minWidth: 0,
  padding: collapsed ? '0' : '0 12px',
  borderRadius: 18,
  border: `1px solid ${connected ? hostShellColors.successBorder : hostShellColors.errorBorder}`,
  background: connected ? hostShellColors.successSurface : hostShellColors.errorSurface,
  color: connected ? hostShellColors.successText : hostShellColors.errorText,
  boxSizing: 'border-box',
})

const footerToggleButtonStyle = (collapsed: boolean): CSSProperties => ({
  width: '100%',
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  gap: 0,
  minWidth: 0,
  padding: collapsed ? '0' : '0 4px',
  border: 'none',
  borderRadius: 0,
  background: 'transparent',
  color: hostShellColors.textSubtle,
  cursor: 'pointer',
})

const connectionMetaStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
}

const connectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const connectionDetailStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  opacity: 0.8,
}

const navIconStyle: CSSProperties = {
  width: 20,
  height: 20,
  color: hostShellColors.textSubtle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const navItemStyle = (active = false, collapsed = false, clickable = true): CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'space-between',
  gap: 12,
  height: 44,
  minWidth: 0,
  padding: collapsed ? '0' : '0 14px 0 20px',
  border: 'none',
  borderRadius: 18,
  background: active ? hostShellColors.surfaceMuted : 'transparent',
  color: hostShellColors.text,
  fontSize: 15,
  fontWeight: 500,
  textAlign: 'left',
  cursor: clickable ? 'pointer' : 'default',
  boxSizing: 'border-box',
})

function SidebarNavItem({
  label,
  icon,
  active = false,
  collapsed = false,
  disabled = false,
  onClick,
}: {
  label: string
  icon: ReactElement
  active?: boolean
  collapsed?: boolean
  disabled?: boolean
  onClick?(): void
}) {
  return (
    <button
      type="button"
      style={navItemStyle(active, collapsed, !disabled)}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {collapsed ? null : <span>{label}</span>}
      <span aria-hidden style={navIconStyle}>{icon}</span>
    </button>
  )
}

export interface HostPrimarySidebarProps {
  activeRoute: HostPrimarySidebarRoute
  collapsed: boolean
  connectionStatus: HostSidebarConnectionStatus
  locale: HostLocale
  reselectableRoutes?: readonly HostPrimarySidebarRoute[]
  onSelect(route: HostPrimarySidebarRoute): void
  onToggleCollapse(): void
}

export function HostPrimarySidebar({
  activeRoute,
  collapsed,
  connectionStatus,
  locale,
  reselectableRoutes = [],
  onSelect,
  onToggleCollapse,
}: HostPrimarySidebarProps) {
  const canReselect = (route: HostPrimarySidebarRoute): boolean =>
    !reselectableRoutes.includes(route)
      ? activeRoute === route
      : false

  return (
    <aside style={sidebarStyle(collapsed)}>
      <div style={sidebarHeaderStyle(collapsed)}>
        <div style={logoRowStyle(collapsed)}>
          <img src={prestoLogoPng} alt="" aria-hidden="true" style={collapsedBrandIconStyle} />
          <h2 style={brandTitleStyle(collapsed)}>Presto</h2>
        </div>
      </div>

      <div style={navStackStyle(collapsed)}>
        <SidebarNavItem
          label={translateHost(locale, 'sidebar.home')}
          icon={<HomeOutlined sx={{ fontSize: 24 }} />}
          active={activeRoute === 'home'}
          disabled={canReselect('home')}
          collapsed={collapsed}
          onClick={() => onSelect('home')}
        />
        <SidebarNavItem
          label={translateHost(locale, 'sidebar.workflows')}
          icon={<AccountTreeOutlined sx={{ fontSize: 24 }} />}
          active={activeRoute === 'workflows'}
          disabled={canReselect('workflows')}
          collapsed={collapsed}
          onClick={() => onSelect('workflows')}
        />
        <SidebarNavItem
          label={translateHost(locale, 'sidebar.tools')}
          icon={<BuildOutlined sx={{ fontSize: 24 }} />}
          active={activeRoute === 'tools'}
          disabled={canReselect('tools')}
          collapsed={collapsed}
          onClick={() => onSelect('tools')}
        />
        <SidebarNavItem
          label={translateHost(locale, 'sidebar.automation')}
          icon={<WidgetsOutlined sx={{ fontSize: 24 }} />}
          active={activeRoute === 'automation'}
          disabled={canReselect('automation')}
          collapsed={collapsed}
          onClick={() => onSelect('automation')}
        />
        <SidebarNavItem
          label={translateHost(locale, 'sidebar.runs')}
          icon={<HistoryOutlined sx={{ fontSize: 24 }} />}
          active={activeRoute === 'runs'}
          disabled={canReselect('runs')}
          collapsed={collapsed}
          onClick={() => onSelect('runs')}
        />
        <SidebarNavItem
          label={translateHost(locale, 'sidebar.settings')}
          icon={<SettingsOutlined sx={{ fontSize: 24 }} />}
          active={activeRoute === 'settings'}
          disabled={canReselect('settings')}
          collapsed={collapsed}
          onClick={() => onSelect('settings')}
        />
      </div>

      <div style={connectionFooterStyle(collapsed)}>
        <button
          type="button"
          aria-label={collapsed ? translateHost(locale, 'sidebar.expand') : translateHost(locale, 'sidebar.collapse')}
          style={footerToggleButtonStyle(collapsed)}
          onClick={onToggleCollapse}
        >
          <span aria-hidden style={navIconStyle}>
            {collapsed ? <ChevronRightOutlined sx={{ fontSize: 18 }} /> : <ChevronLeftOutlined sx={{ fontSize: 18 }} />}
          </span>
        </button>
        <div
          style={connectionChipStyle(connectionStatus.connected, collapsed)}
          title={`${connectionStatus.targetLabel} · ${connectionStatus.statusLabel}${connectionStatus.sessionName ? ` · ${connectionStatus.sessionName}` : ''}`}
          aria-label={`DAW connection ${connectionStatus.statusLabel}`}
        >
          <span aria-hidden style={navIconStyle}>
            {connectionStatus.connected ? <CableOutlined sx={{ fontSize: 20 }} /> : <LinkOffOutlined sx={{ fontSize: 20 }} />}
          </span>
          {collapsed ? null : (
            <span style={connectionMetaStyle}>
              <span style={connectionTitleStyle}>{connectionStatus.statusLabel}</span>
              <span style={connectionDetailStyle}>{connectionStatus.sessionName || connectionStatus.targetLabel}</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}
