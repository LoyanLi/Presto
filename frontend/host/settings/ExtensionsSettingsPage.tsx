import { useState, type CSSProperties } from 'react'

import { Badge, Button, EmptyState, SettingsSection } from '../../ui'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'
import type {
  HostExtensionType,
  HostPluginManagerModel,
  HostPluginRecord,
  HostPluginSettingsEntry,
} from '../pluginHostTypes'

export interface ExtensionsSettingsPageProps {
  locale: HostLocale
  extensionType: HostExtensionType
  pluginManagerModel?: HostPluginManagerModel
  pluginSettingsEntries: readonly HostPluginSettingsEntry[]
  onInstallPluginDirectory?(): void | Promise<void>
  onInstallPluginZip?(): void | Promise<void>
  onSetPluginEnabled?(pluginId: string, enabled: boolean): void | Promise<void>
  onUninstallPlugin?(pluginId: string): void | Promise<void>
  onRefreshPlugins?(): void | Promise<void>
}

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
}

const groupStackStyle: CSSProperties = {
  display: 'grid',
  gap: 24,
}

const groupSectionStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const groupTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 18,
  fontWeight: 600,
}

const listStyle: CSSProperties = {
  display: 'grid',
  gap: 0,
}

const listItemStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
  gap: 16,
  alignItems: 'center',
  padding: '18px 0',
  borderTop: `1px solid ${hostShellColors.border}`,
}

const firstListItemStyle: CSSProperties = {
  ...listItemStyle,
  borderTop: 'none',
  paddingTop: 0,
}

const infoStackStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
}

const metaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
}

const listTitleStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 16,
  fontWeight: 600,
}

const compactMetaStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
}

const actionClusterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
}

const statusBadgeStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'end',
}

const expandedPanelStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  gridColumn: '1 / -1',
  padding: '4px 0 0 0',
}

const expandedMetaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const expandedMetaCardStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  padding: 12,
  borderRadius: 14,
  background: hostShellColors.surfaceMuted,
}

const expandedLabelStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 11,
  fontWeight: 600,
}

const expandedValueStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.text,
  fontSize: 13,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
}

const settingsBadgeStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  background: hostShellColors.surfaceMuted,
  color: hostShellColors.textMuted,
  fontSize: 12,
  fontWeight: 600,
}

const helperTextStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
}

const sectionHeaderTextStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
}

function settingsPageCount(pluginId: string, entries: readonly HostPluginSettingsEntry[]): number {
  return entries.filter((entry) => entry.pluginId === pluginId).length
}

function settingsLabel(locale: HostLocale, pluginId: string, entries: readonly HostPluginSettingsEntry[]): string {
  const count = settingsPageCount(pluginId, entries)
  return count === 1
    ? translateHost(locale, 'extensions.settingsPage.one')
    : translateHost(locale, 'extensions.settingsPage.many', { count })
}

function ExpandedMetaField({ label, value }: { label: string; value: string }) {
  return (
    <div style={expandedMetaCardStyle}>
      <p style={expandedLabelStyle}>{label}</p>
      <p style={expandedValueStyle}>{value}</p>
    </div>
  )
}

function confirmUninstall(plugin: HostPluginRecord, onUninstallPlugin?: (pluginId: string) => void | Promise<void>) {
  if (!onUninstallPlugin) {
    return
  }

  const approved =
    typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? true
      : window.confirm(`Remove extension from Presto?\n\n${plugin.displayName} (${plugin.pluginId}) will be uninstalled.`)

  if (!approved) {
    return
  }

  void onUninstallPlugin(plugin.pluginId)
}

function togglePluginEnabled(
  plugin: HostPluginRecord,
  onSetPluginEnabled?: (pluginId: string, enabled: boolean) => void | Promise<void>,
) {
  if (!onSetPluginEnabled) {
    return
  }

  void onSetPluginEnabled(plugin.pluginId, plugin.enabled === false)
}

function pluginStatusTone(plugin: HostPluginRecord): 'brand' | 'warning' | 'neutral' {
  if (plugin.status === 'ready') {
    return 'brand'
  }
  if (plugin.status === 'disabled') {
    return 'neutral'
  }
  return 'warning'
}

function ExtensionList({
  locale,
  extensions,
  pluginManagerModel,
  pluginSettingsEntries,
  expandedPluginId,
  onToggleExpanded,
  onSetPluginEnabled,
  onUninstallPlugin,
}: {
  locale: HostLocale
  extensions: readonly HostPluginRecord[]
  pluginManagerModel?: HostPluginManagerModel
  pluginSettingsEntries: readonly HostPluginSettingsEntry[]
  expandedPluginId: string | null
  onToggleExpanded(pluginId: string): void
  onSetPluginEnabled?: (pluginId: string, enabled: boolean) => void | Promise<void>
  onUninstallPlugin?: (pluginId: string) => void | Promise<void>
}) {
  return (
    <div style={listStyle}>
      {extensions.map((plugin, index) => {
        const settingsCount = settingsPageCount(plugin.pluginId, pluginSettingsEntries)

        return (
          <div key={plugin.pluginId} style={index === 0 ? firstListItemStyle : listItemStyle}>
            <div style={infoStackStyle}>
              <h3 style={listTitleStyle}>{plugin.displayName}</h3>
              <div style={metaRowStyle}>
                <p style={compactMetaStyle}>{plugin.version}</p>
                {settingsCount > 0 ? (
                  <span style={settingsBadgeStyle}>{settingsLabel(locale, plugin.pluginId, pluginSettingsEntries)}</span>
                ) : null}
              </div>
            </div>

            <div style={statusBadgeStyle}>
              <Badge tone={pluginStatusTone(plugin)}>{plugin.status}</Badge>
            </div>

            <div style={actionClusterStyle}>
              <Button
                variant="secondary"
                size="sm"
                disabled={pluginManagerModel?.isBusy}
                onClick={() => onToggleExpanded(plugin.pluginId)}
              >
                {expandedPluginId === plugin.pluginId
                  ? translateHost(locale, 'extensions.less')
                  : translateHost(locale, 'extensions.more')}
              </Button>
            </div>

            {expandedPluginId === plugin.pluginId ? (
              <div style={expandedPanelStyle}>
                <p style={helperTextStyle}>{plugin.description ?? translateHost(locale, 'extensions.noDescription')}</p>

                <div style={expandedMetaGridStyle}>
                  <ExpandedMetaField label={translateHost(locale, 'extensions.meta.pluginId')} value={plugin.pluginId} />
                  <ExpandedMetaField label={translateHost(locale, 'extensions.meta.version')} value={plugin.version} />
                  <ExpandedMetaField label={translateHost(locale, 'extensions.meta.source')} value={plugin.origin} />
                  <ExpandedMetaField
                    label={translateHost(locale, 'extensions.meta.settings')}
                    value={settingsLabel(locale, plugin.pluginId, pluginSettingsEntries)}
                  />
                  {plugin.pluginRoot ? (
                    <ExpandedMetaField label={translateHost(locale, 'extensions.meta.root')} value={plugin.pluginRoot} />
                  ) : null}
                </div>

                <div style={actionClusterStyle}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pluginManagerModel?.isBusy}
                    onClick={() => togglePluginEnabled(plugin, onSetPluginEnabled)}
                  >
                    {plugin.enabled === false
                      ? translateHost(locale, 'extensions.enable')
                      : translateHost(locale, 'extensions.disable')}
                  </Button>
                </div>

                {plugin.origin === 'installed' ? (
                  <div style={actionClusterStyle}>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={pluginManagerModel?.isBusy}
                      onClick={() => confirmUninstall(plugin, onUninstallPlugin)}
                    >
                      {translateHost(locale, 'extensions.uninstall')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function filterExtensions(
  extensions: readonly HostPluginRecord[],
  extensionType: HostExtensionType,
): HostPluginRecord[] {
  return extensions.filter((extension) => extension.extensionType === extensionType)
}

export function ExtensionsSettingsPage({
  locale,
  extensionType,
  pluginManagerModel,
  pluginSettingsEntries,
  onInstallPluginDirectory,
  onInstallPluginZip,
  onSetPluginEnabled,
  onUninstallPlugin,
  onRefreshPlugins,
}: ExtensionsSettingsPageProps) {
  const extensions = pluginManagerModel?.plugins ?? []
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null)
  const filteredExtensions = filterExtensions(extensions, extensionType)
  const titleKey = extensionType === 'workflow' ? 'extensions.group.workflow' : 'extensions.group.automation'

  return (
    <>
      <SettingsSection title={translateHost(locale, 'extensions.management')}>
        <div style={actionRowStyle}>
          <Button variant="secondary" onClick={() => void onRefreshPlugins?.()} disabled={pluginManagerModel?.isBusy}>
            {translateHost(locale, 'extensions.refresh')}
          </Button>
          <Button variant="secondary" onClick={() => void onInstallPluginDirectory?.()} disabled={pluginManagerModel?.isBusy}>
            {translateHost(locale, 'extensions.installDirectory')}
          </Button>
          <Button variant="primary" onClick={() => void onInstallPluginZip?.()} disabled={pluginManagerModel?.isBusy}>
            {translateHost(locale, 'extensions.installZip')}
          </Button>
        </div>
        <p style={sectionHeaderTextStyle}>
          <code>{translateHost(locale, 'extensions.managedRoot', { path: pluginManagerModel?.managedRoot ?? 'Unavailable' })}</code>
        </p>
        {pluginManagerModel?.statusMessage ? <p style={sectionHeaderTextStyle}>{pluginManagerModel.statusMessage}</p> : null}
      </SettingsSection>

      {filteredExtensions.length > 0 ? (
        <SettingsSection title={translateHost(locale, 'extensions.installed')}>
          <div style={groupStackStyle}>
            <div style={groupSectionStyle}>
              <h3 style={groupTitleStyle}>{translateHost(locale, titleKey)}</h3>
              <ExtensionList
                locale={locale}
                extensions={filteredExtensions}
                pluginManagerModel={pluginManagerModel}
                pluginSettingsEntries={pluginSettingsEntries}
                expandedPluginId={expandedPluginId}
                onToggleExpanded={(pluginId) => {
                  setExpandedPluginId((current) => current === pluginId ? null : pluginId)
                }}
                onSetPluginEnabled={onSetPluginEnabled}
                onUninstallPlugin={onUninstallPlugin}
              />
            </div>
          </div>
        </SettingsSection>
      ) : (
        <EmptyState
          title={translateHost(locale, 'extensions.none')}
          description={translateHost(locale, 'extensions.none.body')}
          actions={(
            <div style={actionRowStyle}>
              <Button variant="secondary" onClick={() => void onInstallPluginDirectory?.()}>
                {translateHost(locale, 'extensions.installDirectory')}
              </Button>
              <Button variant="primary" onClick={() => void onInstallPluginZip?.()}>
                {translateHost(locale, 'extensions.installZip')}
              </Button>
            </div>
          )}
        />
      )}
    </>
  )
}
