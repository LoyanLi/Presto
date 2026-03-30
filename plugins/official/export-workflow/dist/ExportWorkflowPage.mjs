import React from './react-shared.mjs'
import { formatExport, tExport } from './i18n.mjs'
import {
  WorkflowActionBar,
  WorkflowButton,
  WorkflowCard,
  WorkflowIconButton,
  WorkflowInput,
  WorkflowSelect,
  WorkflowStepper,
  InlineError,
  StatItem,
} from './ui.mjs'
import {
  buildExportRunPayload,
  createDefaultExportSettings,
  createDefaultExportWorkflowSettings,
  createSnapshotFromTracks,
  deriveExportJobView,
  getSnapshotStorageInfo,
  loadExportWorkflowSettings,
  loadSnapshotsFromSession,
  normalizeSnapshot,
  saveSnapshotsToSession,
  summarizeSnapshot,
  validateSnapshotName,
} from './workflowCore.mjs'

const h = React.createElement
const { useCallback, useEffect, useMemo, useRef, useState } = React

const FILE_FORMAT_OPTIONS = [
  { value: 'wav', label: 'WAV' },
  { value: 'aiff', label: 'AIFF' },
  { value: 'mp3', label: 'MP3' },
]
const MIX_SOURCE_GROUP_ORDER = ['physicalOut', 'bus', 'output', 'renderer']
const TRACK_LIST_SYNC_MS = 1000
function buildSnapshotManageColumns(t) {
  return [
    { id: 'snapshot', label: t('page.column.snapshot'), width: '44%' },
    { id: 'summary', label: t('page.column.trackState'), width: '30%' },
    { id: 'actions', label: t('page.column.actions'), width: '26%' },
  ]
}
function buildSnapshotSelectionColumns(t) {
  return [
    { id: 'snapshot', label: t('page.column.snapshot'), width: '30%' },
    { id: 'summary', label: t('page.column.trackState'), width: 'calc(100% - 86px)' },
    { id: 'indicator', label: '', width: '56px' },
  ]
}
function buildTrackListColumns(t) {
  return [
    { id: 'track', label: t('page.column.trackInfo'), width: '56%' },
    { id: 'type', label: t('page.column.type'), width: '18%' },
    { id: 'status', label: t('page.column.status'), width: '26%' },
  ]
}

function formatMessage(template, values = {}) {
  if (typeof template !== 'string') {
    return ''
  }
  return template.replace(/\{([^}]+)\}/g, (_, key) => String(values[key] ?? ''))
}

function getErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }
  return fallbackMessage
}

const EMPTY_MOBILE_PROGRESS_VIEW = Object.freeze({
  loading: false,
  sessionId: '',
  url: '',
  qrSvg: '',
  error: '',
})

function normalizeMixSourceType(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, '')

  if (normalized === 'bus') {
    return 'bus'
  }
  if (normalized === 'output') {
    return 'output'
  }
  if (normalized === 'renderer') {
    return 'renderer'
  }
  return 'physicalOut'
}

function createEmptyMixSourceGroups() {
  return {
    physicalOut: [],
    bus: [],
    output: [],
    renderer: [],
  }
}

function buildMixSourceGroupedOptions({ t, groups, loading, currentType, currentValue }) {
  const resolvedGroups = groups && typeof groups === 'object' ? groups : createEmptyMixSourceGroups()
  const normalizedCurrentType = normalizeMixSourceType(currentType)
  const fallbackValue = String(currentValue ?? '').trim()
  const fallbackInjectedGroups = { ...resolvedGroups }

  if (fallbackValue) {
    const currentItems = Array.isArray(fallbackInjectedGroups[normalizedCurrentType]) ? fallbackInjectedGroups[normalizedCurrentType] : []
    if (!currentItems.includes(fallbackValue)) {
      fallbackInjectedGroups[normalizedCurrentType] = [...currentItems, fallbackValue]
    }
  }

  const groupsList = MIX_SOURCE_GROUP_ORDER
    .map((group) => {
      const items = Array.isArray(fallbackInjectedGroups[group]) ? fallbackInjectedGroups[group].filter((item) => String(item ?? '').trim()) : []
      return {
        group,
        label: t(`page.option.mixSourceGroup.${group}`),
        options: buildIndentedMixSourceOptions(group, items),
      }
    })
    .filter((entry) => entry.options.length > 0)

  if (groupsList.length > 0) {
    return groupsList
  }

  return [
    {
      group: 'empty',
      label: '',
      options: [
        {
          value: '',
          label: loading ? t('page.value.loading') : t('page.value.noSources'),
          displayLabel: loading ? t('page.value.loading') : t('page.value.noSources'),
          mode: '',
          isChild: false,
        },
      ],
    },
  ]
}

function parseMixSourceLabel(rawLabel) {
  const label = String(rawLabel ?? '').trim()
  const match = /^(.*?)(?:\s+\((Stereo|Mono)\))?$/.exec(label)
  return {
    raw: label,
    name: String(match?.[1] ?? label).trim(),
    mode: String(match?.[2] ?? '').trim(),
  }
}

function buildIndentedMixSourceOptions(group, items) {
  return items.map((item) => {
    const parsed = parseMixSourceLabel(item)
    return {
      value: `${group}::${parsed.raw}`,
      label: parsed.raw,
      displayLabel: parsed.name,
      mode: parsed.mode,
      isChild: false,
    }
  })
}

function parseMixSourceSelection(value) {
  const text = String(value ?? '')
  const delimiterIndex = text.indexOf('::')
  if (delimiterIndex < 0) {
    return {
      mixSourceType: 'physicalOut',
      mixSourceName: '',
    }
  }
  return {
    mixSourceType: normalizeMixSourceType(text.slice(0, delimiterIndex)),
    mixSourceName: text.slice(delimiterIndex + 2),
  }
}

function createMixSourceEntry(type = 'physicalOut', name = '') {
  return {
    type: normalizeMixSourceType(type),
    name: String(name ?? '').trim(),
  }
}

function getFirstAvailableMixSource(groups) {
  const resolvedGroups = groups && typeof groups === 'object' ? groups : createEmptyMixSourceGroups()
  for (const group of MIX_SOURCE_GROUP_ORDER) {
    const items = Array.isArray(resolvedGroups[group]) ? resolvedGroups[group] : []
    const nextName = items.find((item) => String(item ?? '').trim())
    if (nextName) {
      return createMixSourceEntry(group, nextName)
    }
  }
  return createMixSourceEntry('physicalOut', '')
}

function renderGroupedMixSourceSelect({
  t,
  groups,
  loading,
  value,
  currentType,
  showLabel = false,
  error,
  onChange,
}) {
  const groupedOptions = buildMixSourceGroupedOptions({
    t,
    groups,
    loading,
    currentType,
    currentValue: value,
  })
  const selectedValue = value ? `${normalizeMixSourceType(currentType)}::${value}` : ''

  return h(
    'label',
    { className: ['ew-field ew-mix-source-field', showLabel ? 'ew-field-span-2' : null].filter(Boolean).join(' ') },
    showLabel ? h('span', { className: 'ew-mix-source-label' }, t('page.label.mixSource')) : null,
    h(
      'select',
      {
        className: 'ew-select ew-mix-source-select',
        'aria-label': t('page.label.mixSource'),
        value: selectedValue,
        disabled: loading && !value,
        onChange,
      },
      groupedOptions.flatMap((groupEntry) =>
        groupEntry.label
          ? h(
              'optgroup',
              { key: groupEntry.group, label: groupEntry.label },
              groupEntry.options.map((option) =>
                h(
                  'option',
                  { key: option.value, value: option.value },
                  option.mode ? `${option.label.replace(/\s+\((Stereo|Mono)\)$/, '')} (${option.mode})` : option.label,
                ),
              ),
            )
          : groupEntry.options.map((option) =>
              h('option', { key: option.value, value: option.value }, option.label),
            ),
      ),
    ),
    error ? h('div', { className: 'ew-field-error' }, error) : null,
  )
}

function iconGlyph(value) {
  return h('span', { className: 'ew-icon-glyph', 'aria-hidden': true }, value)
}

const LUCIDE_ICON_PROPS = {
  size: 16,
  color: 'currentColor',
  strokeWidth: 2,
  absoluteStrokeWidth: false,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function renderLucideIcon(iconNode, props = {}) {
  const size = Number(props.size ?? LUCIDE_ICON_PROPS.size)
  const strokeWidth = Number(props.strokeWidth ?? LUCIDE_ICON_PROPS.strokeWidth)
  const absoluteStrokeWidth = props.absoluteStrokeWidth ?? LUCIDE_ICON_PROPS.absoluteStrokeWidth
  const resolvedStrokeWidth = absoluteStrokeWidth ? (strokeWidth * 24) / size : strokeWidth
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: props.fill ?? LUCIDE_ICON_PROPS.fill,
      stroke: props.color ?? LUCIDE_ICON_PROPS.color,
      strokeWidth: resolvedStrokeWidth,
      strokeLinecap: props.strokeLinecap ?? LUCIDE_ICON_PROPS.strokeLinecap,
      strokeLinejoin: props.strokeLinejoin ?? LUCIDE_ICON_PROPS.strokeLinejoin,
      'aria-hidden': true,
    },
    iconNode.map(([tag, attrs]) => h(tag, { key: attrs.key, ...attrs })),
  )
}

const EDIT2_ICON_NODE = [
  [
    'path',
    {
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      key: '1a8usu',
    },
  ],
]
const X_ICON_NODE = [
  ['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
  ['path', { d: 'm6 6 12 12', key: 'd8bk6v' }],
]
const CHECK_ICON_NODE = [
  ['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }],
]
const PLUS_ICON_NODE = [
  ['path', { d: 'M5 12h14', key: '1ays0h' }],
  ['path', { d: 'M12 5v14', key: 's699le' }],
]
const TRASH2_ICON_NODE = [
  ['path', { d: 'M3 6h18', key: 'd0wm0j' }],
  ['path', { d: 'M8 6V4h8v2', key: '1o0v6q' }],
  ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', key: '4alrt4' }],
  ['path', { d: 'M10 11v6', key: '1uufr5' }],
  ['path', { d: 'M14 11v6', key: 'xtxkd' }],
]
const QR_CODE_ICON_NODE = [
  ['path', { d: 'M7 4H4v3', key: 'qr-a' }],
  ['path', { d: 'M17 4h3v3', key: 'qr-b' }],
  ['path', { d: 'M20 17v3h-3', key: 'qr-c' }],
  ['path', { d: 'M7 20H4v-3', key: 'qr-d' }],
  ['circle', { cx: '9', cy: '9', r: '1', key: 'qr-e' }],
  ['circle', { cx: '15', cy: '9', r: '1', key: 'qr-f' }],
  ['circle', { cx: '9', cy: '15', r: '1', key: 'qr-g' }],
  ['circle', { cx: '15', cy: '15', r: '1', key: 'qr-h' }],
]
const CHEVRON_DOWN_ICON_NODE = [
  ['path', { d: 'm6 9 6 6 6-6', key: 'chevron-down' }],
]
const CHEVRON_UP_ICON_NODE = [
  ['path', { d: 'm18 15-6-6-6 6', key: 'chevron-up' }],
]
const VOLUME2_ICON_NODE = [
  ['path', { d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z', key: 'uqj9uw' }],
  ['path', { d: 'M16 9a5 5 0 0 1 0 6', key: '1q6k2b' }],
  ['path', { d: 'M19.364 18.364a9 9 0 0 0 0-12.728', key: 'ijwkga' }],
]
const MUSIC_ICON_NODE = [
  ['path', { d: 'M9 18V5l12-2v13', key: '1jmyc2' }],
  ['circle', { cx: '6', cy: '18', r: '3', key: 'fqmcym' }],
  ['circle', { cx: '18', cy: '16', r: '3', key: '1hluhg' }],
]
const HEADPHONES_ICON_NODE = [
  ['path', { d: 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3', key: '1xhozi' }],
]
const MIC_ICON_NODE = [
  ['path', { d: 'M12 19v3', key: 'npa21l' }],
  ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2', key: '1vc78b' }],
  ['rect', { x: '9', y: '2', width: '6', height: '13', rx: '3', key: 's6n7sd' }],
]
const MUSIC2_ICON_NODE = [
  ['circle', { cx: '8', cy: '18', r: '4', key: '1fc0mg' }],
  ['path', { d: 'M12 18V2l7 4', key: 'g04rme' }],
]

function trackSoloState(track) {
  return Boolean(track?.is_soloed ?? track?.isSoloed)
}

function trackMuteState(track) {
  return Boolean(track?.is_muted ?? track?.isMuted)
}

function trackTypeLabel(track) {
  return String(track?.type || 'audio').toLowerCase()
}

function AudioTrackIcon() {
  return renderLucideIcon(VOLUME2_ICON_NODE, LUCIDE_ICON_PROPS)
}

function MidiTrackIcon() {
  return renderLucideIcon(MUSIC_ICON_NODE, LUCIDE_ICON_PROPS)
}

function AuxTrackIcon() {
  return renderLucideIcon(HEADPHONES_ICON_NODE, LUCIDE_ICON_PROPS)
}

function MasterTrackIcon() {
  return renderLucideIcon(MIC_ICON_NODE, LUCIDE_ICON_PROPS)
}

function InstrumentTrackIcon() {
  return renderLucideIcon(MUSIC2_ICON_NODE, LUCIDE_ICON_PROPS)
}

function trackTypeGlyph(track) {
  const iconByType = {
    audio: AudioTrackIcon,
    midi: MidiTrackIcon,
    aux: AuxTrackIcon,
    master: MasterTrackIcon,
    instrument: InstrumentTrackIcon,
  }
  const IconComponent = iconByType[trackTypeLabel(track)] || AudioTrackIcon
  return h(IconComponent)
}

function columnStyle(column) {
  if (!column?.width) {
    return undefined
  }
  return {
    width: typeof column.width === 'number' ? `${column.width}px` : column.width,
  }
}

function toneForState(view) {
  if (!view) {
    return 'neutral'
  }
  if (view.state === 'failed' || view.state === 'cancelled' || view.terminalStatus === 'completed_with_errors') {
    return 'danger'
  }
  if (view.state === 'succeeded') {
    return 'success'
  }
  if (view.state === 'running') {
    return 'public'
  }
  return 'neutral'
}

function labelForState(view) {
  if (!view) {
    return 'idle'
  }
  return view.terminalStatus || view.state
}

function formatEta(etaSeconds) {
  if (!Number.isFinite(etaSeconds) || etaSeconds <= 0) {
    return '0s'
  }
  const rounded = Math.round(etaSeconds)
  if (rounded < 60) {
    return `${rounded}s`
  }
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function normalizeProgressPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)))
}

function formatMixSourceProgress(view, t) {
  const sourceName = String(view?.currentMixSourceName ?? '').trim()
  if (!sourceName) {
    return ''
  }

  const sourceIndex = Number(view?.currentMixSourceIndex || 0)
  const totalSources = Number(view?.totalMixSources || 0)
  if (sourceIndex > 0 && totalSources > 0) {
    return `${t('page.label.mixSource')}: ${sourceName} (${sourceIndex}/${totalSources})`
  }
  return `${t('page.label.mixSource')}: ${sourceName}`
}

function renderTrackRows(tracks, columns, context) {
  const resolvedTracks = Array.isArray(tracks) ? tracks : []
  return h(
    'div',
    { className: 'ew-table-wrap ew-table-wrap--tracks' },
    h(
      'table',
      { className: 'ew-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          columns.map((column) =>
            h(
              'th',
              {
                key: column.id,
                style: columnStyle(column),
              },
              column.label,
            ),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        resolvedTracks.length === 0
          ? h('tr', null, h('td', { className: 'ew-empty-row', colSpan: 3 }, tExport(context, 'page.empty.noTracks')))
          : resolvedTracks.map((track) =>
              h(
                'tr',
                {
                  key: track.id || track.name,
                  className: 'ew-row',
                  style: { backgroundColor: trackTint(track) },
                },
                h(
                  'td',
                  { className: 'ew-table-cell ew-table-cell--file ew-table-cell--track' },
                  h(
                    'div',
                    { className: 'ew-track-info' },
                    h('span', { className: `ew-track-type-icon ew-track-type-icon--${trackTypeLabel(track)}`, 'aria-hidden': true }, trackTypeGlyph(track)),
                    h(
                      'div',
                      {
                        className: 'ew-file-name ew-table-static',
                        title: track.name || tExport(context, 'page.empty.untitledTrack'),
                      },
                      track.name || tExport(context, 'page.empty.untitledTrack'),
                    ),
                  ),
                ),
                h(
                  'td',
                  { className: 'ew-table-cell' },
                  h('span', { className: `ew-mini-pill ew-mini-pill--${trackTypeLabel(track)}` }, trackTypeLabel(track).toUpperCase()),
                ),
                h(
                  'td',
                  { className: 'ew-table-cell' },
                  h(
                    'div',
                    { className: 'ew-track-status-actions' },
                    h(
                      'span',
                      {
                        className: ['ew-track-status-toggle', trackSoloState(track) ? 'is-soloed' : null]
                          .filter(Boolean)
                          .join(' '),
                      },
                      'S',
                    ),
                    h(
                      'span',
                      {
                        className: ['ew-track-status-toggle', trackMuteState(track) ? 'is-muted' : null]
                          .filter(Boolean)
                          .join(' '),
                      },
                      'M',
                    ),
                  ),
                ),
              ),
            ),
      ),
    ),
  )
}

function renderSnapshotStats(context, snapshot) {
  const summary = summarizeSnapshot(snapshot)
  return [
    formatExport(context, 'page.summary.tracks', { count: summary.totalTracks }),
    formatExport(context, 'page.summary.muted', { count: summary.mutedTracks }),
    formatExport(context, 'page.summary.soloed', { count: summary.soloedTracks }),
  ].join(' • ')
}

function renderSnapshotTable({
  context,
  snapshots,
  columns,
  wrapClassName,
  emptyMessage,
  isRowSelected,
  renderPrimaryAccessory,
  renderTrailingCell,
  onRowActivate,
}) {
  const resolvedSnapshots = Array.isArray(snapshots) ? snapshots : []
  return h(
    'div',
    { className: wrapClassName },
    h(
      'table',
      { className: 'ew-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          columns.map((column) =>
            h(
              'th',
              {
                key: column.id,
                style: columnStyle(column),
              },
              column.label,
            ),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        resolvedSnapshots.length === 0
          ? h('tr', null, h('td', { className: 'ew-empty-row', colSpan: columns.length }, emptyMessage))
          : resolvedSnapshots.map((snapshot) => {
              const selected = typeof isRowSelected === 'function' ? Boolean(isRowSelected(snapshot)) : false
              const rowClassName = selected ? 'ew-row is-selected' : 'ew-row'
              const interactiveProps = typeof onRowActivate === 'function'
                ? {
                    onClick: () => onRowActivate(snapshot),
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowActivate(snapshot)
                      }
                    },
                    tabIndex: 0,
                  }
                : null
              return h(
                'tr',
                {
                  key: snapshot.id,
                  className: rowClassName,
                  ...interactiveProps,
                },
                h(
                  'td',
                  { className: 'ew-table-cell ew-table-cell--file ew-table-cell--snapshot' },
                  h('div', { className: 'ew-file-name ew-table-static', title: snapshot.name }, snapshot.name),
                ),
                h(
                  'td',
                  { className: 'ew-table-cell ew-table-static ew-table-cell--ellipsis', title: renderSnapshotStats(context, snapshot) },
                  renderSnapshotStats(context, snapshot),
                ),
                typeof renderPrimaryAccessory === 'function'
                  ? h(
                      'td',
                      { className: 'ew-table-cell ew-table-cell--indicator' },
                      renderPrimaryAccessory(snapshot, selected),
                    )
                  : null,
                typeof renderTrailingCell === 'function' ? renderTrailingCell(snapshot, selected) : null,
              )
            }),
      ),
    ),
  )
}

function renderMobileProgressPanel({
  t,
  mobileProgressView,
  onToggle,
}) {
  return h(
    'details',
    {
      className: 'ew-mobile-progress-flyout',
      onToggle: (event) => {
        if (event.currentTarget.open && typeof onToggle === 'function') {
          void onToggle()
        }
      },
    },
    h(
      'summary',
      {
        className: 'ew-mobile-progress-trigger ew-icon-button-fallback',
        title: t('page.mobileProgress.title'),
        'aria-label': t('page.mobileProgress.title'),
      },
      h('span', { className: 'ew-mobile-progress-trigger-inner' }, renderLucideIcon(QR_CODE_ICON_NODE, { ...LUCIDE_ICON_PROPS, size: 16 })),
    ),
    h(
      'div',
      { className: 'ew-mobile-progress-popover' },
      mobileProgressView.qrSvg
        ? h('div', {
            className: 'ew-mobile-progress-qr',
            dangerouslySetInnerHTML: { __html: mobileProgressView.qrSvg },
          })
        : null,
    ),
  )
}

function cloneTrackStates(trackStates) {
  return normalizeSnapshot({ trackStates }).trackStates.map((trackState) => ({ ...trackState }))
}

function trackTint(trackState) {
  const color = typeof trackState?.color === 'string' ? trackState.color.trim() : ''
  if (color.startsWith('#') && color.length === 9) {
    const red = Number.parseInt(color.slice(3, 5), 16)
    const green = Number.parseInt(color.slice(5, 7), 16)
    const blue = Number.parseInt(color.slice(7, 9), 16)
    if ([red, green, blue].every((channel) => Number.isFinite(channel))) {
      return `rgba(${red}, ${green}, ${blue}, 0.12)`
    }
  }

  const tintByType = {
    audio: 'rgba(52, 126, 199, 0.12)',
    midi: 'rgba(58, 166, 85, 0.12)',
    aux: 'rgba(139, 92, 246, 0.12)',
    master: 'rgba(220, 38, 38, 0.12)',
    instrument: 'rgba(234, 88, 12, 0.12)',
  }

  return tintByType[String(trackState?.type ?? 'audio')] || 'rgba(120, 120, 120, 0.12)'
}

function ModalSurface({ title, subtitle, wide = false, onClose, children, footer, headerActions = null, bodyClassName = 'ew-modal-body ew-modal-stack' }) {
  return h(
    'div',
    {
      className: 'ew-modal-backdrop',
      onClick: () => {
        if (typeof onClose === 'function') {
          onClose()
        }
      },
    },
    h(
      'div',
      {
        className: ['ew-modal-surface', 'ew-modal-sheet', wide ? 'is-wide' : null].filter(Boolean).join(' '),
        onClick: (event) => event.stopPropagation(),
      },
      [
        h(
          'div',
          { key: 'header', className: 'ew-modal-header' },
          h(
            'div',
            { className: 'ew-modal-header-main' },
            h('h2', { className: 'ew-h2' }, title),
            subtitle ? h('p', { className: 'ew-card-subtitle' }, subtitle) : null,
          ),
          h(
            'div',
            { className: 'ew-modal-header-actions' },
            headerActions,
            h(WorkflowIconButton, {
              label: 'Close dialog',
              icon: renderLucideIcon(X_ICON_NODE, LUCIDE_ICON_PROPS),
              onClick: onClose,
            }),
          ),
        ),
        h('div', { key: 'body', className: bodyClassName }, children),
        footer ? h('div', { key: 'footer', className: 'ew-modal-footer' }, footer) : null,
      ],
    ),
  )
}

function SnapshotDetailModal({
  snapshot,
  isOpen,
  detailSnapshotName,
  detailTrackStates,
  isEditingSnapshotDetailName,
  isEditingSnapshotTracks,
  onDetailSnapshotNameChange,
  onStartSnapshotNameEdit,
  onSaveSnapshotNameEdit,
  onCancelSnapshotNameEdit,
  onStartSnapshotTracksEdit,
  onSaveSnapshotTracksEdit,
  onCancelSnapshotTracksEdit,
  onToggleSolo,
  onToggleMute,
  onClose,
}) {
  if (!isOpen || !snapshot) {
    return null
  }

  const totalTracks = detailTrackStates.length
  const normalTracks = detailTrackStates.filter((trackState) => !trackSoloState(trackState) && !trackMuteState(trackState)).length
  const soloedTracks = detailTrackStates.filter((trackState) => trackSoloState(trackState)).length
  const mutedTracks = detailTrackStates.filter((trackState) => trackMuteState(trackState)).length
  const detailHeaderActions = isEditingSnapshotDetailName
    ? h(
        'div',
        { className: 'ew-row-actions' },
        h(WorkflowButton, { variant: 'primary', small: true, onClick: onSaveSnapshotNameEdit }, 'Save'),
        h(WorkflowButton, { small: true, onClick: onCancelSnapshotNameEdit }, 'Cancel'),
      )
    : h(WorkflowIconButton, {
        label: 'Edit Name',
        icon: renderLucideIcon(EDIT2_ICON_NODE, LUCIDE_ICON_PROPS),
        onClick: onStartSnapshotNameEdit,
      })

  return h(
    ModalSurface,
    {
      title: snapshot.name,
      wide: true,
      onClose,
      headerActions: detailHeaderActions,
      bodyClassName: 'ew-modal-body ew-modal-body--detail ew-modal-stack',
      footer: h(
        WorkflowButton,
        {
          onClick: onClose,
        },
        'Close',
      ),
    },
    [
      isEditingSnapshotDetailName
        ? h(
            'div',
            { key: 'name-row', className: 'ew-detail-header-row ew-modal-section ew-modal-section--detail-name' },
            h(WorkflowInput, {
              label: 'Snapshot Name',
              value: detailSnapshotName,
              onChange: (event) => onDetailSnapshotNameChange(event.target.value),
            }),
          )
        : null,
      h(
        'div',
        { key: 'stats', className: 'ew-detail-stats ew-modal-section ew-modal-section--detail-stats' },
        h(
          'div',
          { className: 'ew-stats-inline' },
          [
            ['Total Tracks', totalTracks],
            ['Normal Tracks', normalTracks],
            ['Solo Tracks', soloedTracks],
            ['Muted Tracks', mutedTracks],
          ].map(([label, value]) =>
            h(
              'div',
              { key: label, className: 'ew-stats-inline__item' },
              h('span', { className: 'ew-stats-inline__label' }, label),
              h('strong', { className: 'ew-stats-inline__value' }, String(value)),
            ),
          ),
        ),
      ),
      h(
        'div',
        { key: 'track-list', className: 'ew-detail-table-shell ew-modal-section ew-modal-section--detail-table' },
        h(
          'div',
          { className: 'ew-detail-table-header' },
          h('h3', { className: 'ew-h3' }, 'Snapshot Track Information'),
          isEditingSnapshotTracks
            ? h(
                'div',
                { className: 'ew-row-actions' },
                h(
                  WorkflowButton,
                  {
                    variant: 'primary',
                    small: true,
                    onClick: onSaveSnapshotTracksEdit,
                  },
                  'Save',
                ),
                h(
                  WorkflowButton,
                  {
                    small: true,
                    onClick: onCancelSnapshotTracksEdit,
                  },
                  'Cancel',
                ),
              )
            : h(WorkflowIconButton, {
                label: 'Edit tracks',
                icon: renderLucideIcon(EDIT2_ICON_NODE, LUCIDE_ICON_PROPS),
                onClick: onStartSnapshotTracksEdit,
              }),
        ),
        h(
          'div',
          { className: 'ew-table-wrap ew-table-wrap--detail' },
          h(
            'table',
            { className: 'ew-detail-table ew-table' },
            [
            h(
              'thead',
              { key: 'head' },
              h(
                'tr',
                null,
                h('th', null, 'Track Info'),
                h('th', null, 'Type'),
                h('th', null, 'Status'),
              ),
            ),
            h(
              'tbody',
              { key: 'body' },
              detailTrackStates.map((trackState) =>
                h(
                  'tr',
                  {
                    key: trackState.trackId || trackState.trackName,
                    className: 'ew-row',
                    style: { backgroundColor: trackTint(trackState) },
                  },
                  h(
                    'td',
                    { className: 'ew-table-cell ew-table-cell--track' },
                    h(
                      'div',
                      { className: 'ew-track-info' },
                      h(
                        'span',
                        {
                          className: `ew-track-type-icon ew-track-type-icon--${trackTypeLabel(trackState)}`,
                          'aria-hidden': true,
                        },
                        trackTypeGlyph(trackState),
                      ),
                      h('div', { className: 'ew-detail-track-name ew-table-primary' }, trackState.trackName || 'Untitled Track'),
                    ),
                  ),
                  h(
                    'td',
                    { className: 'ew-table-cell' },
                    h('span', { className: `ew-mini-pill ew-mini-pill--${trackTypeLabel(trackState)}` }, trackTypeLabel(trackState).toUpperCase()),
                  ),
                  h(
                    'td',
                    { className: 'ew-table-cell' },
                    h(
                      'div',
                      { className: 'ew-track-status-actions' },
                      isEditingSnapshotTracks
                        ? [
                            h(
                              'button',
                              {
                                key: 'solo',
                                type: 'button',
                                className: ['ew-track-status-toggle', trackSoloState(trackState) ? 'is-soloed' : null]
                                  .filter(Boolean)
                                  .join(' '),
                                onClick: () => onToggleSolo(trackState.trackId),
                              },
                              'S',
                            ),
                            h(
                              'button',
                              {
                                key: 'mute',
                                type: 'button',
                                className: ['ew-track-status-toggle', trackMuteState(trackState) ? 'is-muted' : null]
                                  .filter(Boolean)
                                  .join(' '),
                                onClick: () => onToggleMute(trackState.trackId),
                              },
                              'M',
                            ),
                          ]
                        : [
                            h(
                              'span',
                              {
                                key: 'solo',
                                className: ['ew-track-status-toggle', trackSoloState(trackState) ? 'is-soloed' : null]
                                  .filter(Boolean)
                                  .join(' '),
                              },
                              'S',
                            ),
                            h(
                              'span',
                              {
                                key: 'mute',
                                className: ['ew-track-status-toggle', trackMuteState(trackState) ? 'is-muted' : null]
                                  .filter(Boolean)
                                  .join(' '),
                              },
                              'M',
                            ),
                          ],
                    ),
                  ),
                ),
              ),
            ),
            ],
          ),
        ),
      ),
    ],
  )
}

export function ExportWorkflowPage({ context }) {
  const t = useCallback((key) => tExport(context, key), [context])
  const trackListColumns = useMemo(() => buildTrackListColumns(t), [t])
  const snapshotManageColumns = useMemo(() => buildSnapshotManageColumns(t), [t])
  const snapshotSelectionColumns = useMemo(() => buildSnapshotSelectionColumns(t), [t])
  const [currentStep, setCurrentStep] = useState(1)
  const [sessionModel, setSessionModel] = useState({
    loading: true,
    connected: false,
    session: null,
    tracks: [],
    error: '',
  })
  const [storageInfo, setStorageInfo] = useState({
    snapshots: { snapshotPath: '', storageDir: '', sessionPath: '', projectPath: '' },
    presets: { presetPath: '', storageDir: '' },
  })
  const [snapshots, setSnapshots] = useState([])
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState([])
  const [workflowSettings, setWorkflowSettings] = useState(() => createDefaultExportWorkflowSettings())
  const [newSnapshotName, setNewSnapshotName] = useState('')
  const [editingSnapshotId, setEditingSnapshotId] = useState('')
  const [editingSnapshotName, setEditingSnapshotName] = useState('')
  const [settings, setSettings] = useState(createDefaultExportSettings(null))
  const [presets, setPresets] = useState([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [newPresetName, setNewPresetName] = useState('')
  const [jobView, setJobView] = useState(null)
  const [jobId, setJobId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false)
  const [detailSnapshotId, setDetailSnapshotId] = useState('')
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [detailSnapshotName, setDetailSnapshotName] = useState('')
  const [detailTrackStates, setDetailTrackStates] = useState([])
  const [isEditingSnapshotDetailName, setIsEditingSnapshotDetailName] = useState(false)
  const [isEditingSnapshotTracks, setIsEditingSnapshotTracks] = useState(false)
  const [showPresetPanel, setShowPresetPanel] = useState(false)
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false)
  const [showImportPresetDialog, setShowImportPresetDialog] = useState(false)
  const [presetPage, setPresetPage] = useState(1)
  const [editingPresetId, setEditingPresetId] = useState('')
  const [editingPresetName, setEditingPresetName] = useState('')
  const [importDialogKey, setImportDialogKey] = useState(0)
  const [mixSourceGroups, setMixSourceGroups] = useState(() => createEmptyMixSourceGroups())
  const [mixSourceLoading, setMixSourceLoading] = useState(false)
  const [mixSourceError, setMixSourceError] = useState('')
  const [mobileProgressView, setMobileProgressView] = useState(() => ({ ...EMPTY_MOBILE_PROGRESS_VIEW }))
  const pollTimeoutRef = useRef(null)
  const liveTrackSyncTimeoutRef = useRef(null)
  const initializedSettingsRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  const stopLiveTrackSync = useCallback(() => {
    if (liveTrackSyncTimeoutRef.current) {
      clearTimeout(liveTrackSyncTimeoutRef.current)
      liveTrackSyncTimeoutRef.current = null
    }
  }, [])

  useEffect(() => () => {
    stopPolling()
    stopLiveTrackSync()
  }, [stopPolling, stopLiveTrackSync])

  const selectedSnapshots = useMemo(() => {
    const selected = new Set(selectedSnapshotIds)
    return snapshots.filter((snapshot) => selected.has(snapshot.id))
  }, [selectedSnapshotIds, snapshots])
  const selectedMixSources = useMemo(
    () =>
      (Array.isArray(settings.mix_sources) ? settings.mix_sources : [])
        .map((mixSource) => createMixSourceEntry(mixSource?.type, mixSource?.name))
        .filter((mixSource) => mixSource.name),
    [settings.mix_sources],
  )

  const activeDetailSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === detailSnapshotId) || null,
    [detailSnapshotId, snapshots],
  )

  const hasRunningJob = Boolean(jobView && !jobView.isTerminal)
  const hasExportJob = Boolean(jobView)
  const isCompletedSuccessfully = Boolean(jobView?.isTerminal && jobView.terminalStatus === 'completed')
  const canOpenOutputFolder = Boolean(
    context.runtime?.shell && typeof context.runtime.shell.openPath === 'function' && String(settings.output_path ?? '').trim(),
  )
  const exportActionDisabled =
    hasRunningJob ||
    selectedSnapshots.length === 0 ||
    !String(settings.output_path ?? '').trim() ||
    selectedMixSources.length === 0 ||
    (settings.file_format === 'mp3' && selectedMixSources.length > 1)
  const mobileProgressRuntime = context.runtime?.mobileProgress
  const hasMobileProgressRuntime = Boolean(
    mobileProgressRuntime &&
    typeof mobileProgressRuntime.createSession === 'function' &&
    typeof mobileProgressRuntime.getViewUrl === 'function' &&
    typeof mobileProgressRuntime.closeSession === 'function' &&
    typeof mobileProgressRuntime.updateSession === 'function',
  )

  useEffect(() => {
    let cancelled = false

    async function bootstrapWorkflowSettings() {
      try {
        const loadedSettings = await loadExportWorkflowSettings(context.storage)
        if (!cancelled) {
          setWorkflowSettings(loadedSettings)
        }
      } catch (_error) {
        if (!cancelled) {
          setWorkflowSettings(createDefaultExportWorkflowSettings())
        }
      }
    }

    void bootstrapWorkflowSettings()
    return () => {
      cancelled = true
    }
  }, [context.storage])

  useEffect(() => {
    if (currentStep !== 3) {
      return undefined
    }

    let cancelled = false

    async function refreshWorkflowSettings() {
      try {
        const loadedSettings = await loadExportWorkflowSettings(context.storage)
        if (!cancelled) {
          setWorkflowSettings(loadedSettings)
        }
      } catch (_error) {
        if (!cancelled) {
          setWorkflowSettings(createDefaultExportWorkflowSettings())
        }
      }
    }

    void refreshWorkflowSettings()
    return () => {
      cancelled = true
    }
  }, [context.storage, currentStep])

  useEffect(() => {
    setSelectedSnapshotIds(
      workflowSettings.defaultSnapshotSelection === 'none'
        ? []
        : snapshots.map((snapshot) => snapshot.id),
    )
  }, [snapshots, workflowSettings.defaultSnapshotSelection])

  useEffect(() => {
    if (activeDetailSnapshot === null && isDetailModalOpen) {
      setIsDetailModalOpen(false)
      setDetailSnapshotId('')
      setDetailSnapshotName('')
      setDetailTrackStates([])
      setIsEditingSnapshotDetailName(false)
      setIsEditingSnapshotTracks(false)
    }
  }, [activeDetailSnapshot, isDetailModalOpen])

  const loadWorkflowState = useCallback(
    async ({ refreshOnly = false, tracksOnly = false } = {}) => {
      if (!tracksOnly) {
        setSessionModel((current) => ({ ...current, loading: true, error: '' }))
        setErrorMessage('')
      }
      try {
        const connection = await context.presto.daw.connection.getStatus()
        let sessionInfo = null
        let tracks = []
        if (connection.connected) {
          sessionInfo = (await context.presto.session.getInfo()).session
          tracks = (await context.presto.track.list()).tracks || []
        }

        if (tracksOnly) {
          setSessionModel((current) => ({
            ...current,
            loading: false,
            connected: Boolean(connection.connected),
            session: sessionInfo,
            tracks,
            error: '',
          }))
          return
        }

        const loadedSnapshots = await loadSnapshotsFromSession(context.runtime.fs, sessionInfo)

        setSessionModel({
          loading: false,
          connected: Boolean(connection.connected),
          session: sessionInfo,
          tracks,
          error: '',
        })
        setSnapshots(loadedSnapshots.map(normalizeSnapshot))
        setStorageInfo({
          snapshots: getSnapshotStorageInfo(sessionInfo),
          presets: { presetPath: '', storageDir: '' },
        })

        if (!initializedSettingsRef.current || refreshOnly) {
          setSettings((current) => ({
            ...createDefaultExportSettings(sessionInfo),
            output_path: current.output_path,
            mix_sources: Array.isArray(current.mix_sources) ? current.mix_sources : [],
            online_export: current.online_export,
            file_format: current.file_format || 'wav',
          }))
          initializedSettingsRef.current = true
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load export workflow state.'
        if (tracksOnly) {
          setSessionModel((current) => ({
            ...current,
            loading: false,
            connected: false,
            session: null,
            tracks: [],
            error: message,
          }))
          return
        }
        setSessionModel({
          loading: false,
          connected: false,
          session: null,
          tracks: [],
          error: message,
        })
      }
    },
    [context.presto.daw.connection, context.presto.session, context.presto.track, context.runtime.fs],
  )

  useEffect(() => {
    void loadWorkflowState()
  }, [loadWorkflowState])

  useEffect(() => {
    stopLiveTrackSync()
    if (currentStep !== 1) {
      return undefined
    }
    liveTrackSyncTimeoutRef.current = setTimeout(() => {
      void loadWorkflowState({ tracksOnly: true })
    }, TRACK_LIST_SYNC_MS)
    return () => stopLiveTrackSync()
  }, [currentStep, loadWorkflowState, sessionModel.tracks, stopLiveTrackSync])

  useEffect(() => {
    if (currentStep !== 3) {
      return undefined
    }

    if (!context.presto?.export?.mixSource || typeof context.presto.export.mixSource.list !== 'function') {
      return undefined
    }

    let cancelled = false
    async function loadMixSourceOptions() {
      setMixSourceLoading(true)
      setMixSourceError('')
      try {
        const responses = await Promise.allSettled(
          MIX_SOURCE_GROUP_ORDER.map(async (sourceType) => {
            const response = await context.presto.export.mixSource.list({ sourceType })
            return [sourceType, Array.isArray(response?.sourceList) ? response.sourceList : []]
          }),
        )
        if (cancelled) {
          return
        }

        const nextGroups = createEmptyMixSourceGroups()
        const failedGroups = []
        for (const result of responses) {
          if (result.status === 'fulfilled') {
            const [sourceType, items] = result.value
            nextGroups[sourceType] = items.map((item) => String(item ?? '').trim()).filter(Boolean)
            continue
          }
          failedGroups.push(getErrorMessage(result.reason, 'Failed to load mix sources.'))
        }

        const hasAnyGroup = MIX_SOURCE_GROUP_ORDER.some((group) => nextGroups[group].length > 0)
        if (!hasAnyGroup && failedGroups.length > 0) {
          throw new Error(failedGroups[0])
        }

        setMixSourceGroups(nextGroups)
        setMixSourceError('')
        setSettings((current) => {
          const currentMixSources = Array.isArray(current.mix_sources) ? current.mix_sources : []
          const filteredMixSources = currentMixSources
            .map((mixSource) => createMixSourceEntry(mixSource?.type, mixSource?.name))
            .filter((mixSource) => nextGroups[mixSource.type]?.includes(mixSource.name))
          const fallbackMixSource = getFirstAvailableMixSource(nextGroups)
          const nextMixSources = filteredMixSources.length > 0
            ? filteredMixSources
            : (fallbackMixSource.name ? [fallbackMixSource] : [])
          const resolvedMixSources = current.file_format === 'mp3' ? nextMixSources.slice(0, 1) : nextMixSources
          const unchanged = JSON.stringify(currentMixSources) === JSON.stringify(resolvedMixSources)
          if (unchanged) {
            return current
          }
          return {
            ...current,
            mix_sources: resolvedMixSources,
          }
        })
      } catch (error) {
        if (cancelled) {
          return
        }
        setMixSourceGroups(createEmptyMixSourceGroups())
        setMixSourceError(getErrorMessage(error, 'Failed to load mix sources.'))
      } finally {
        if (!cancelled) {
          setMixSourceLoading(false)
        }
      }
    }

    void loadMixSourceOptions()
    return () => {
      cancelled = true
    }
  }, [context.presto?.export?.mixSource, currentStep])

  const pollJob = useCallback(
    async (nextJobId) => {
      stopPolling()
      try {
        const job = await context.presto.jobs.get(nextJobId)
        const nextView = deriveExportJobView(job)
        setJobId(nextJobId)
        setJobView(nextView)
        if (!nextView.isTerminal) {
          pollTimeoutRef.current = setTimeout(() => {
            void pollJob(nextJobId)
          }, 1000)
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to poll export job.')
      }
    },
    [context.presto.jobs, stopPolling],
  )

  const persistSnapshots = useCallback(
    async (nextSnapshots) => {
      if (!sessionModel.session) {
        setErrorMessage('Connect to Pro Tools before saving snapshots.')
        return false
      }
      const saved = await saveSnapshotsToSession(context.runtime.fs, sessionModel.session, nextSnapshots)
      if (!saved) {
        setErrorMessage('Failed to save snapshots to the current session.')
      }
      return saved
    },
    [context.runtime.fs, sessionModel.session],
  )

  const handleCreateSnapshot = useCallback(async () => {
    const validationMessage = validateSnapshotName(newSnapshotName, snapshots)
    if (validationMessage) {
      setErrorMessage(validationMessage)
      return
    }
    if (sessionModel.tracks.length === 0) {
      setErrorMessage('Refresh the track list before creating snapshots.')
      return
    }
    const nextSnapshot = createSnapshotFromTracks(newSnapshotName, sessionModel.tracks)
    const nextSnapshots = [...snapshots, nextSnapshot]
    setSnapshots(nextSnapshots)
    setNewSnapshotName('')
    setIsCreatingSnapshot(false)
    setErrorMessage('')
    await persistSnapshots(nextSnapshots)
  }, [newSnapshotName, persistSnapshots, sessionModel.tracks, snapshots])

  const handleDeleteSnapshot = useCallback(
    async (snapshotId) => {
      const nextSnapshots = snapshots.filter((snapshot) => snapshot.id !== snapshotId)
      setSnapshots(nextSnapshots)
      if (snapshotId === detailSnapshotId) {
        setIsDetailModalOpen(false)
        setDetailSnapshotId('')
        setDetailSnapshotName('')
        setDetailTrackStates([])
      }
      await persistSnapshots(nextSnapshots)
    },
    [detailSnapshotId, persistSnapshots, snapshots],
  )

  const handleUpdateSnapshot = useCallback(
    async (snapshotId, updates) => {
      const nextSnapshots = snapshots.map((snapshot) =>
        snapshot.id === snapshotId
          ? {
              ...snapshot,
              ...updates,
              trackStates: updates.trackStates ? cloneTrackStates(updates.trackStates) : snapshot.trackStates,
              updatedAt: new Date().toISOString(),
            }
          : snapshot,
      )
      setSnapshots(nextSnapshots)
      await persistSnapshots(nextSnapshots)
    },
    [persistSnapshots, snapshots],
  )

  const openSnapshotDetails = useCallback((snapshot) => {
    setDetailSnapshotId(snapshot.id)
    setIsDetailModalOpen(true)
    setDetailSnapshotName(snapshot.name)
    setDetailTrackStates(cloneTrackStates(snapshot.trackStates))
    setIsEditingSnapshotDetailName(false)
    setIsEditingSnapshotTracks(false)
  }, [])

  const handleSaveSnapshotName = useCallback(async () => {
    const validationMessage = validateSnapshotName(detailSnapshotName, snapshots, detailSnapshotId)
    if (validationMessage) {
      setErrorMessage(validationMessage)
      return
    }
    await handleUpdateSnapshot(detailSnapshotId, { name: detailSnapshotName.trim() })
    setIsEditingSnapshotDetailName(false)
    setErrorMessage('')
  }, [detailSnapshotId, detailSnapshotName, handleUpdateSnapshot, snapshots])

  const handleSaveSnapshotTracks = useCallback(async () => {
    await handleUpdateSnapshot(detailSnapshotId, { trackStates: detailTrackStates })
    setIsEditingSnapshotTracks(false)
  }, [detailSnapshotId, detailTrackStates, handleUpdateSnapshot])

  const handleBrowseFolder = useCallback(async () => {
    if (!context.runtime.dialog || typeof context.runtime.dialog.openFolder !== 'function') {
      setErrorMessage('Folder picker is unavailable in this runtime.')
      return
    }
    const result = await context.runtime.dialog.openFolder()
    if (!result.canceled && Array.isArray(result.paths) && result.paths[0]) {
      setSettings((current) => ({
        ...current,
        output_path: result.paths[0],
      }))
    }
  }, [context.runtime.dialog])

  const handleToggleSnapshotSelection = useCallback((snapshotId) => {
    setSelectedSnapshotIds((current) =>
      current.includes(snapshotId)
        ? current.filter((value) => value !== snapshotId)
        : [...current, snapshotId],
    )
  }, [])

  const handleAddMixSource = useCallback(() => {
    setSettings((current) => {
      const fallbackMixSource = getFirstAvailableMixSource(mixSourceGroups)
      if (!fallbackMixSource.name) {
        return current
      }
      const currentMixSources = Array.isArray(current.mix_sources) ? current.mix_sources : []
      if (current.file_format === 'mp3') {
        return currentMixSources.length > 0
          ? current
          : { ...current, mix_sources: [fallbackMixSource] }
      }
      return {
        ...current,
        mix_sources: [...currentMixSources, fallbackMixSource],
      }
    })
  }, [mixSourceGroups])

  const handleRemoveMixSource = useCallback((index) => {
    setSettings((current) => ({
      ...current,
      mix_sources: (Array.isArray(current.mix_sources) ? current.mix_sources : []).filter((_, currentIndex) => currentIndex !== index),
    }))
  }, [])

  const handleChangeMixSource = useCallback((index, selectionValue) => {
    const nextSelection = parseMixSourceSelection(selectionValue)
    setSettings((current) => ({
      ...current,
      mix_sources: (Array.isArray(current.mix_sources) ? current.mix_sources : []).map((mixSource, currentIndex) =>
        currentIndex === index
          ? createMixSourceEntry(nextSelection.mixSourceType, nextSelection.mixSourceName)
          : mixSource,
        ),
    }))
  }, [])

  const ensureMobileProgressSession = useCallback(
    async (targetJobId) => {
      if (!workflowSettings.mobileProgressEnabled || !hasMobileProgressRuntime || !String(targetJobId ?? '').trim()) {
        return
      }

      setMobileProgressView((current) => ({
        ...current,
        loading: true,
        error: '',
      }))

      try {
        const result = mobileProgressView.sessionId
          ? await mobileProgressRuntime.getViewUrl(mobileProgressView.sessionId)
          : await mobileProgressRuntime.createSession(String(targetJobId))

        if (!result?.ok || !result.url) {
          throw new Error(result?.error || 'Failed to prepare mobile progress QR.')
        }

        setMobileProgressView({
          loading: false,
          sessionId: String(result.sessionId ?? mobileProgressView.sessionId ?? ''),
          url: String(result.url),
          qrSvg: String(result.qrSvg ?? mobileProgressView.qrSvg ?? ''),
          error: '',
        })
      } catch (error) {
        setMobileProgressView((current) => ({
          ...current,
          loading: false,
          error: getErrorMessage(error, 'Failed to prepare mobile progress QR.'),
        }))
      }
    },
    [hasMobileProgressRuntime, mobileProgressRuntime, mobileProgressView.qrSvg, mobileProgressView.sessionId, workflowSettings.mobileProgressEnabled],
  )

  const handleToggleMobileProgress = useCallback(async () => {
    const latestWorkflowSettings = await loadExportWorkflowSettings(context.storage)
    setWorkflowSettings(latestWorkflowSettings)

    if (!latestWorkflowSettings.mobileProgressEnabled || !hasMobileProgressRuntime) {
      return
    }

    const targetJobId = String(jobId || jobView?.jobId || '').trim()
    if (!targetJobId) {
      return
    }

    await ensureMobileProgressSession(targetJobId)
  }, [context.storage, ensureMobileProgressSession, hasMobileProgressRuntime, jobId, jobView?.jobId])

  useEffect(() => {
    if (!workflowSettings.mobileProgressEnabled || !hasMobileProgressRuntime || !hasRunningJob) {
      return
    }

    const targetJobId = String(jobId || jobView?.jobId || '').trim()
    if (!targetJobId) {
      return
    }

    if (mobileProgressView.loading || (mobileProgressView.sessionId && mobileProgressView.url && mobileProgressView.qrSvg)) {
      return
    }

    void ensureMobileProgressSession(targetJobId)
  }, [
    ensureMobileProgressSession,
    hasMobileProgressRuntime,
    hasRunningJob,
    jobId,
    jobView?.jobId,
    mobileProgressView.loading,
    mobileProgressView.qrSvg,
    mobileProgressView.sessionId,
    mobileProgressView.url,
    workflowSettings.mobileProgressEnabled,
  ])

  useEffect(() => {
    if (!hasMobileProgressRuntime || !mobileProgressView.sessionId || !jobView) {
      return
    }

    void mobileProgressRuntime.updateSession(mobileProgressView.sessionId, jobView)
  }, [hasMobileProgressRuntime, jobView, mobileProgressRuntime, mobileProgressView.sessionId])

  const handleStartExport = useCallback(async () => {
    if (selectedSnapshots.length === 0) {
      setErrorMessage('Select at least one snapshot before starting export.')
      return
    }
    if (!settings.output_path.trim()) {
      setErrorMessage('Choose an output folder before starting export.')
      return
    }
    if (selectedMixSources.length === 0) {
      setErrorMessage('Select at least one mix source before starting export.')
      return
    }
    if (settings.file_format === 'mp3' && selectedMixSources.length > 1) {
      setErrorMessage('MP3 export supports only one mix source.')
      return
    }

    setErrorMessage('')
    setNoticeMessage('')
    setMobileProgressView({ ...EMPTY_MOBILE_PROGRESS_VIEW })

    try {
      const response = await context.presto.export.run.start(
        buildExportRunPayload({
          snapshots: selectedSnapshots,
          settings,
        }),
      )
      setCurrentStep(3)
      setJobId(response.jobId)
      setJobView({
        jobId: response.jobId,
        state: response.state,
        terminalStatus: response.state,
        progressPercent: 0,
        currentFileProgressPercent: 0,
        overallProgressPercent: 0,
        message: t('page.notice.exportQueued'),
        currentSnapshot: 0,
        totalSnapshots: selectedSnapshots.length,
        currentSnapshotName: '',
        currentMixSourceName: '',
        currentMixSourceIndex: 0,
        totalMixSources: 0,
        etaSeconds: null,
        exportedCount: 0,
        lastExportedFile: '',
        exportedFiles: [],
        failedSnapshots: [],
        success: false,
        errorMessage: '',
        isTerminal: false,
      })
      void pollJob(response.jobId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start export workflow.')
    }
  }, [context.presto.export.run, pollJob, selectedMixSources.length, selectedSnapshots, settings, t])

  const resetActiveExportState = useCallback(() => {
    stopPolling()
    setJobView(null)
    setJobId('')
    setNoticeMessage('')
    setErrorMessage('')
    setMobileProgressView({ ...EMPTY_MOBILE_PROGRESS_VIEW })
  }, [stopPolling])

  const handleCancelExport = useCallback(async () => {
    const runningJobId = jobId || jobView?.jobId
    if (!runningJobId) {
      return
    }
    await context.presto.jobs.cancel(runningJobId)
    resetActiveExportState()
  }, [context.presto.jobs, jobId, jobView?.jobId, resetActiveExportState])

  const handleContinueExport = useCallback(() => {
    resetActiveExportState()
  }, [resetActiveExportState])

  const handleOpenOutputFolder = useCallback(async () => {
    if (!settings.output_path.trim()) {
      return
    }
    if (!context.runtime.shell || typeof context.runtime.shell.openPath !== 'function') {
      setErrorMessage('Open Folder is unavailable in this runtime.')
      return
    }
    await context.runtime.shell.openPath(settings.output_path)
  }, [context.runtime.shell, settings.output_path])

  useEffect(() => {
    if (!jobView?.isTerminal || !mobileProgressView.sessionId || !hasMobileProgressRuntime) {
      return undefined
    }

    const activeSessionId = mobileProgressView.sessionId
    void mobileProgressRuntime.closeSession(activeSessionId).finally(() => {
      setMobileProgressView((current) =>
        current.sessionId === activeSessionId
          ? {
              ...current,
              sessionId: '',
              loading: false,
            }
          : current,
      )
    })

    return undefined
  }, [hasMobileProgressRuntime, jobView?.isTerminal, mobileProgressRuntime, mobileProgressView.sessionId])

  const canAdvanceToSnapshots = sessionModel.connected
  const canAdvanceToExportSettings = snapshots.length > 0
  const previousStepAction = currentStep > 1
    ? h(
        WorkflowButton,
        {
          onClick: () => setCurrentStep((step) => Math.max(1, step - 1)),
        },
        t('page.button.previous'),
      )
    : h('span', { className: 'ew-action-slot', 'aria-hidden': true })
  const nextStepAction = currentStep < 3
    ? h(
        WorkflowButton,
        {
          variant: 'primary',
          disabled: currentStep === 1 ? !canAdvanceToSnapshots : !canAdvanceToExportSettings,
          onClick: () => setCurrentStep((step) => Math.min(3, step + 1)),
        },
        currentStep === 1 ? t('page.button.nextSnapshots') : t('page.button.nextExport'),
      )
    : currentStep === 3 && !hasExportJob
      ? h(
          WorkflowButton,
          {
            variant: 'primary',
            disabled: exportActionDisabled,
            onClick: () => {
              void handleStartExport()
            },
          },
          t('page.button.startExport'),
        )
    : h('span', { className: 'ew-action-slot', 'aria-hidden': true })

  return h(
    'div',
    { className: 'ew-shell' },
    [
      h(WorkflowStepper, {
        key: 'stepper',
        steps: [t('page.step.session'), t('page.step.snapshots'), t('page.step.export')],
        currentStep,
      }),
      h(
        'div',
        { key: 'main', className: 'ew-main ew-main--workflow' },
        [
          currentStep === 1
            ? h(
                'div',
                { key: 'step-1', className: 'ew-step-shell ew-step-shell--session' },
                h(WorkflowCard, {
                  className: 'ew-block-card ew-block-card--session',
                  title: t('page.card.session'),
                  subtitle: 'Read the current session before capturing snapshots.',
                  rightSlot: h(
                    WorkflowButton,
                    {
                      variant: 'secondary',
                      onClick: () => {
                        void loadWorkflowState({ refreshOnly: true })
                      },
                    },
                    sessionModel.loading ? 'Refreshing...' : 'Refresh session',
                  ),
                }, [
                  h(InlineError, { key: 'error', message: sessionModel.error || errorMessage }),
                  h(
                    'div',
                    { key: 'stats', className: 'ew-stats ew-overview-stats ew-summary-strip' },
                    h(StatItem, { label: t('page.card.session'), value: sessionModel.session?.sessionName || t('page.value.noSession') }),
                    h(StatItem, { label: 'Tracks', value: sessionModel.tracks.length }),
                  ),
                  sessionModel.session
                    ? h(
                        'p',
                        { key: 'session-meta', className: 'ew-muted ew-session-path', title: sessionModel.session.sessionPath || '' },
                        sessionModel.session.sessionPath || '',
                      )
                    : h('p', { key: 'empty', className: 'ew-muted' }, 'No session information available.'),
                ]),
                h(WorkflowCard, {
                  className: 'ew-block-card ew-block-card--tracks',
                  title: t('page.card.trackList'),
                  subtitle: 'These live track states become snapshot truth when you capture a snapshot.',
                }, [
                  h(React.Fragment, { key: 'tracks-table' }, renderTrackRows(sessionModel.tracks, trackListColumns, context)),
                  h('div', { key: 'tracks-count', className: 'ew-muted ew-section-footnote' }, `${sessionModel.tracks.length} loaded`),
                ]),
              )
            : null,
          currentStep === 2
            ? h(
                'div',
                {
                  key: 'step-2',
                  className: 'ew-step-shell ew-step-shell--snapshots',
                },
                h(
                  WorkflowCard,
                  {
                    className: 'ew-block-card ew-block-card--snapshots',
                  title: t('page.card.trackSnapshots'),
                  subtitle: 'Capture and inspect the saved mute/solo state for the current tracks.',
                  rightSlot: h(
                    WorkflowButton,
                    {
                      variant: 'primary',
                      onClick: () => setIsCreatingSnapshot(true),
                      disabled: sessionModel.tracks.length === 0,
                    },
                    t('page.button.createSnapshot'),
                  ),
                },
                [
                  h(InlineError, { key: 'error', message: errorMessage }),
                  snapshots.length > 0
                    ? h(
                        'div',
                        { key: 'snapshot-banner', className: 'ew-banner ew-banner-inline' },
                        formatExport(context, 'page.summary.snapshotsTotal', { count: snapshots.length }),
                      )
                    : null,
                  isCreatingSnapshot
                    ? h(
                        'div',
                        { key: 'create', className: 'ew-creation-panel ew-section-panel' },
                        h(WorkflowInput, {
                          label: t('page.label.snapshotName'),
                          placeholder: 'Enter snapshot name',
                          value: newSnapshotName,
                          onChange: (event) => setNewSnapshotName(event.target.value),
                        }),
                        h(
                          'div',
                          { className: 'ew-row-actions' },
                          h(
                            WorkflowButton,
                            {
                              variant: 'primary',
                              onClick: () => {
                                void handleCreateSnapshot()
                              },
                              disabled: !newSnapshotName.trim(),
                            },
                            t('page.button.create'),
                          ),
                          h(
                            WorkflowButton,
                            {
                              onClick: () => {
                                setIsCreatingSnapshot(false)
                                setNewSnapshotName('')
                              },
                            },
                            t('page.button.cancel'),
                          ),
                        ),
                        h('p', { className: 'ew-muted' }, formatExport(context, 'page.summary.trackSave', { count: sessionModel.tracks.length })),
                      )
                    : null,
                  snapshots.length > 0
                    ? h(
                        React.Fragment,
                        { key: 'snapshot-table' },
                        h('div', { className: 'ew-section-heading' }, h('h3', { className: 'ew-h3' }, t('page.section.savedSnapshots'))),
                        renderSnapshotTable({
                          context,
                          snapshots,
                          columns: snapshotManageColumns,
                          wrapClassName: 'ew-table-wrap ew-table-wrap--snapshots',
                          emptyMessage: t('page.empty.noSnapshots'),
                          renderTrailingCell: (snapshot) =>
                            h(
                              'td',
                              { className: 'ew-table-cell ew-table-cell--actions' },
                              h(
                                'div',
                                { className: 'ew-table-actions' },
                                h(
                                  WorkflowButton,
                                  {
                                    small: true,
                                    onClick: (event) => {
                                      event.stopPropagation()
                                      openSnapshotDetails(snapshot)
                                    },
                                  },
                                  t('page.button.details'),
                                ),
                                h(
                                  WorkflowButton,
                                  {
                                    variant: 'danger',
                                    small: true,
                                    onClick: (event) => {
                                      event.stopPropagation()
                                      void handleDeleteSnapshot(snapshot.id)
                                    },
                                  },
                                  t('page.button.delete'),
                                ),
                              ),
                            ),
                        }),
                      )
                    : h(
                        'div',
                        { key: 'empty', className: 'ew-empty-state ew-section-panel' },
                        t('page.empty.noSnapshots'),
                      ),
                  snapshots.length > 0
                    ? h('div', { key: 'footer', className: 'ew-muted ew-section-footnote' }, formatExport(context, 'page.summary.snapshotsTotal', { count: snapshots.length }))
                    : null,
                ],
              )
              )
            : null,
          currentStep === 3
            ? h(
                'div',
                {
                  key: 'step-3',
                  className: 'ew-step-shell ew-step-shell--export',
                },
                [
                  h(InlineError, { key: 'error', message: errorMessage }),
                  noticeMessage ? h('div', { key: 'notice', className: 'ew-inline-notice' }, noticeMessage) : null,
                  h(
                    'div',
                    { key: 'layout', className: 'ew-export-layout' },
                    hasExportJob
                      ? h(
                          'div',
                          { className: 'ew-export-main ew-export-main--full' },
                          [
                              !isCompletedSuccessfully
                                ? h(
                                    'div',
                                    { key: 'buttons', className: 'ew-export-actions' },
                                    hasRunningJob
                                      ? h(
                                          WorkflowButton,
                                          {
                                            variant: 'danger',
                                            onClick: () => {
                                              void handleCancelExport()
                                            },
                                          },
                                          t('page.button.stopExport'),
                                        )
                                      : null,
                                  )
                                : null,
                              jobView
                                ? h(
                                'div',
                                { key: 'progress', className: 'ew-progress-panel ew-section-panel ew-progress-panel--runtime' },
                            h(
                              'div',
                              { className: 'ew-progress-header' },
                              h('span', { className: 'ew-progress-title' }, hasRunningJob ? t('page.card.exporting') : t('page.card.exportResult')),
                              h(
                                'div',
                                { className: 'ew-progress-header-actions' },
                                h('span', { className: 'ew-progress-count' }, formatExport(context, 'page.summary.exportCount', { current: jobView.currentSnapshot || 0, total: jobView.totalSnapshots || 0 })),
                                renderMobileProgressPanel({
                                  t,
                                  isEnabled: workflowSettings.mobileProgressEnabled,
                                  isRuntimeAvailable: hasMobileProgressRuntime,
                                  hasRunningJob,
                                  jobView,
                                  mobileProgressView,
                                  onToggle: () => {
                                    void handleToggleMobileProgress()
                                  },
                                }),
                              ),
                            ),
                            h(
                              'div',
                              { className: 'ew-progress-breakdown' },
                              h(
                                'div',
                                { className: 'ew-progress-current-file' },
                                h(
                                  'div',
                                  { className: 'ew-progress-line' },
                                  h('span', { className: 'ew-progress-line-label' }, t('page.label.currentFile')),
                                  h('span', { className: 'ew-progress-line-value' }, `${Math.round(normalizeProgressPercent(jobView.currentFileProgressPercent))}%`),
                                ),
                                h(
                                  'div',
                                  { className: 'ew-progress-shell ew-progress-shell--file' },
                                  h('div', {
                                    className: 'ew-progress-bar ew-progress-bar--file',
                                    style: {
                                      width: `${normalizeProgressPercent(jobView.currentFileProgressPercent)}%`,
                                    },
                                  }),
                                ),
                                jobView.currentSnapshotName
                                  ? h('div', { className: 'ew-progress-line-sub' }, formatExport(context, 'page.summary.currentSnapshot', { name: jobView.currentSnapshotName }))
                                  : null,
                                formatMixSourceProgress(jobView, t)
                                  ? h('div', { className: 'ew-progress-line-sub' }, formatMixSourceProgress(jobView, t))
                                  : null,
                              ),
                              h(
                                'div',
                                { className: 'ew-progress-overall' },
                                h(
                                  'div',
                                  { className: 'ew-progress-line' },
                                  h('span', { className: 'ew-progress-line-label' }, t('page.label.overallProgress')),
                                  h('span', { className: 'ew-progress-line-value' }, `${Math.round(normalizeProgressPercent(jobView.overallProgressPercent))}%`),
                                ),
                                h(
                                  'div',
                                  { className: 'ew-progress-shell ew-progress-shell--overall' },
                                  h('div', {
                                    className: 'ew-progress-bar ew-progress-bar--overall',
                                    style: {
                                      width: `${normalizeProgressPercent(jobView.overallProgressPercent)}%`,
                                    },
                                  }),
                                ),
                              ),
                            ),
                            h(
                              'div',
                              { className: 'ew-progress-meta' },
                              h(StatItem, { label: t('page.label.status'), value: labelForState(jobView) }),
                              h(StatItem, { label: t('page.label.eta'), value: jobView.etaSeconds == null ? t('page.value.na') : formatEta(jobView.etaSeconds) }),
                              h(StatItem, { label: t('page.label.exported'), value: jobView.exportedCount || 0 }),
                            ),
                            h('div', { className: 'ew-progress-message' }, jobView.message || t('page.notice.waiting')),
                            h(
                              'div',
                              { className: 'ew-kv-grid' },
                              h('div', { className: 'ew-kv-item' }, h('label', null, t('page.label.taskId')), h('div', null, jobView.jobId || '')),
                              h('div', { className: 'ew-kv-item' }, h('label', null, t('page.label.progress')), h('div', null, `${Math.round(normalizeProgressPercent(jobView.overallProgressPercent))}%`)),
                            ),
                            Array.isArray(jobView.exportedFiles) && jobView.exportedFiles.length > 0
                              ? h(
                                  'div',
                                  { className: 'ew-terminal-list' },
                                  h('h3', { className: 'ew-h3' }, t('page.summary.exportedFiles')),
                                  h(
                                    'ul',
                                    null,
                                    jobView.exportedFiles.map((filePath) => h('li', { key: filePath }, filePath)),
                                  ),
                                )
                              : null,
                            Array.isArray(jobView.failedSnapshots) && jobView.failedSnapshots.length > 0
                              ? h(
                                  'div',
                                  { className: 'ew-terminal-list is-danger' },
                                  h('h3', { className: 'ew-h3' }, t('page.summary.failedSnapshots')),
                                  h(
                                    'ul',
                                    null,
                                    (Array.isArray(jobView.failedSnapshotDetails) && jobView.failedSnapshotDetails.length > 0
                                      ? jobView.failedSnapshotDetails
                                      : jobView.failedSnapshots.map((snapshotName) => ({ snapshotName, error: '' })))
                                      .map((item) =>
                                        h(
                                          'li',
                                          { key: `${item.snapshotName}:${item.error}` },
                                          item.error ? `${item.snapshotName}: ${item.error}` : item.snapshotName,
                                        ),
                                      ),
                                  ),
                                )
                              : null,
                                )
                              : null,
                              isCompletedSuccessfully
                                ? h(
                                    'div',
                                    { key: 'success', className: 'ew-success-panel ew-section-panel' },
                                    h('div', { className: 'ew-success-title' }, t('page.summary.exportCompleted')),
                                    h(
                                      'div',
                                      { className: 'ew-success-copy' },
                                      formatExport(context, 'page.summary.exportCompletedCopy', { count: jobView?.exportedFiles?.length || 0 }),
                                    ),
                                    h(
                                      'div',
                                      { className: 'ew-row-actions' },
                                      h(
                                        WorkflowButton,
                                        {
                                          variant: 'primary',
                                          disabled: !canOpenOutputFolder,
                                          onClick: () => {
                                            void handleOpenOutputFolder()
                                          },
                                        },
                                        t('page.button.openFolder'),
                                      ),
                                      h(
                                        WorkflowButton,
                                        {
                                          onClick: handleContinueExport,
                                        },
                                        t('page.button.continueExport'),
                                      ),
                                    ),
                                  )
                                : null,
                            ],
                          
                        )
                      : [
                          h(
                            'div',
                            { className: 'ew-export-main', key: 'selection-shell' },
                            h(
                              WorkflowCard,
                              {
                                key: 'selection-card',
                                className: 'ew-block-card ew-block-card--selection',
                                title: t('page.card.selectSnapshots'),
                                subtitle: t('page.notice.selectionSubtitle'),
                              },
                              [
                                snapshots.length > 0
                                  ? h(
                                      React.Fragment,
                                      { key: 'selection-table' },
                                      h('div', { className: 'ew-section-heading' }, h('h3', { className: 'ew-h3' }, t('page.section.availableSnapshots'))),
                                      renderSnapshotTable({
                                        context,
                                        snapshots,
                                        columns: snapshotSelectionColumns,
                                        wrapClassName: 'ew-table-wrap ew-table-wrap--selection',
                                        emptyMessage: t('page.empty.noSnapshotsAvailable'),
                                        isRowSelected: (snapshot) => selectedSnapshotIds.includes(snapshot.id),
                                        onRowActivate: (snapshot) => handleToggleSnapshotSelection(snapshot.id),
                                        renderPrimaryAccessory: (_snapshot, selected) =>
                                          h(
                                            'span',
                                            {
                                              className: selected ? 'ew-selection-check is-selected' : 'ew-selection-check',
                                              'aria-hidden': true,
                                            },
                                            renderLucideIcon(CHECK_ICON_NODE, {
                                              ...LUCIDE_ICON_PROPS,
                                              size: 12,
                                              strokeWidth: 2.25,
                                            }),
                                          ),
                                      }),
                                    )
                                  : h(
                                      'div',
                                      { key: 'selection-empty', className: 'ew-warning-box ew-section-panel' },
                                      h('div', { className: 'ew-warning-title' }, t('page.empty.noSnapshotsAvailable')),
                                      h('p', { className: 'ew-muted' }, t('page.empty.createSnapshotsFirst')),
                                    ),
                                h('div', { key: 'selection-count', className: 'ew-muted ew-section-footnote' }, formatExport(context, 'page.summary.snapshotsSelected', { count: selectedSnapshots.length })),
                              ],
                            ),
                          ),
                          h(
                            'div',
                            { className: 'ew-export-side', key: 'settings-shell' },
                            h(
                              WorkflowCard,
                              {
                                key: 'settings-card',
                                className: 'ew-block-card ew-block-card--settings',
                                title: t('page.card.exportSettings'),
                              },
                              [
                                h(
                                  'div',
                                  { key: 'settings-stack', className: 'ew-settings-stack' },
                                  h(
                                    'div',
                                    { className: 'ew-section-panel ew-settings-panel' },
                                    h('div', { className: 'ew-section-heading' }, h('h3', { className: 'ew-h3' }, t('page.section.sourceAndNaming'))),
                                    h(
                                      'div',
                                      { className: 'ew-form-grid ew-settings-grid ew-source-naming-grid' },
                                      h(
                                        'div',
                                        { className: 'ew-field ew-field-span-2 ew-mix-source-field' },
                                        h('span', { className: 'ew-mix-source-label' }, t('page.label.mixSource')),
                                        h(
                                          'div',
                                          { className: 'ew-mix-source-stack' },
                                          (Array.isArray(settings.mix_sources) ? settings.mix_sources : []).map((mixSource, index) =>
                                            h(
                                              'div',
                                              { key: `mix-source-${index}`, className: 'ew-mix-source-row' },
                                              renderGroupedMixSourceSelect({
                                                t,
                                                groups: mixSourceGroups,
                                                loading: mixSourceLoading,
                                                value: mixSource?.name,
                                                currentType: mixSource?.type,
                                                onChange: (event) => handleChangeMixSource(index, event.target.value),
                                              }),
                                              h(
                                                WorkflowIconButton,
                                                {
                                                  className: 'ew-mix-source-action',
                                                  label: t('page.button.addMixSource'),
                                                  icon: renderLucideIcon(PLUS_ICON_NODE, LUCIDE_ICON_PROPS),
                                                  disabled: Boolean(mixSourceLoading) || (settings.file_format === 'mp3' && (settings.mix_sources?.length ?? 0) > 0),
                                                  onClick: handleAddMixSource,
                                                },
                                              ),
                                              h(
                                                WorkflowIconButton,
                                                {
                                                  className: 'ew-mix-source-action',
                                                  label: t('page.button.removeMixSource'),
                                                  icon: renderLucideIcon(TRASH2_ICON_NODE, LUCIDE_ICON_PROPS),
                                                  disabled: (settings.mix_sources?.length ?? 0) <= 1,
                                                  onClick: () => handleRemoveMixSource(index),
                                                },
                                              ),
                                            ),
                                          ),
                                        ),
                                        mixSourceError ? h('div', { className: 'ew-field-error' }, mixSourceError) : null,
                                      ),
                                      h(
                                        'label',
                                        { className: 'ew-field ew-source-format-field' },
                                        h('span', null, t('page.label.fileFormat')),
                                        h(
                                          'select',
                                          {
                                            className: 'ew-select',
                                            value: settings.file_format,
                                            onChange: (event) =>
                                              setSettings((current) => {
                                                const nextFormat = event.target.value
                                                const currentMixSources = Array.isArray(current.mix_sources) ? current.mix_sources : []
                                                return {
                                                  ...current,
                                                  file_format: nextFormat,
                                                  mix_sources: nextFormat === 'mp3' ? currentMixSources.slice(0, 1) : currentMixSources,
                                                }
                                              }),
                                          },
                                          FILE_FORMAT_OPTIONS.map((option) =>
                                            h('option', { key: option.value, value: option.value }, option.label),
                                          ),
                                        ),
                                      ),
                                      h(
                                        'label',
                                        { className: 'ew-field ew-field-span-2 ew-source-prefix-field' },
                                        h('span', null, t('page.label.filePrefix')),
                                        h('input', {
                                          className: 'ew-input',
                                          value: settings.file_prefix,
                                          placeholder: t('page.placeholder.filePrefix'),
                                          onChange: (event) => setSettings((current) => ({ ...current, file_prefix: event.target.value })),
                                        }),
                                      ),
                                    ),
                                  ),
                                  h(
                                    'div',
                                    { className: 'ew-section-panel ew-settings-panel' },
                                    h('div', { className: 'ew-section-heading' }, h('h3', { className: 'ew-h3' }, t('page.section.destination'))),
                                    h(
                                      'div',
                                      { className: 'ew-form-grid ew-form-grid--single' },
                                      h(
                                        'div',
                                        { className: 'ew-field ew-field-span-2' },
                                        h('span', null, t('page.label.outputPath')),
                                        h(
                                          'div',
                                          { className: 'ew-form-row' },
                                          h(WorkflowInput, {
                                            className: 'ew-flex-1',
                                            value: settings.output_path,
                                            placeholder: t('page.placeholder.selectExportFolder'),
                                            onChange: (event) => setSettings((current) => ({ ...current, output_path: event.target.value })),
                                          }),
                                          h(
                                            WorkflowButton,
                                            {
                                              small: true,
                                              onClick: () => {
                                                void handleBrowseFolder()
                                              },
                                            },
                                            t('page.button.browse'),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  h(
                                    'div',
                                    { className: 'ew-section-panel ew-settings-panel' },
                                    h('div', { className: 'ew-section-heading' }, h('h3', { className: 'ew-h3' }, t('page.section.execution'))),
                                    h(
                                      'label',
                                      { className: 'ew-checkbox-field' },
                                      h('input', {
                                        type: 'checkbox',
                                        checked: settings.online_export,
                                        onChange: (event) =>
                                          setSettings((current) => ({
                                            ...current,
                                            online_export: Boolean(event.target.checked),
                                          })),
                                      }),
                                      h('span', null, t('page.label.onlineExport')),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                  ),
                ],
              )
            : null,
        ],
      ),
      h(
        WorkflowActionBar,
        { key: 'actions', className: 'ew-action-bar', sticky: false, align: 'space-between' },
        previousStepAction,
        nextStepAction,
      ),
      h(SnapshotDetailModal, {
        key: 'snapshot-detail-modal',
        snapshot: activeDetailSnapshot,
        isOpen: isDetailModalOpen,
        detailSnapshotName,
        detailTrackStates,
        isEditingSnapshotDetailName,
        isEditingSnapshotTracks,
        onDetailSnapshotNameChange: setDetailSnapshotName,
        onStartSnapshotNameEdit: () => {
          setIsEditingSnapshotDetailName(true)
          setEditingSnapshotId(detailSnapshotId)
          setEditingSnapshotName(detailSnapshotName)
        },
        onSaveSnapshotNameEdit: () => {
          void handleSaveSnapshotName()
        },
        onCancelSnapshotNameEdit: () => {
          setIsEditingSnapshotDetailName(false)
          setDetailSnapshotName(activeDetailSnapshot?.name || '')
        },
        onStartSnapshotTracksEdit: () => setIsEditingSnapshotTracks(true),
        onSaveSnapshotTracksEdit: () => {
          void handleSaveSnapshotTracks()
        },
        onCancelSnapshotTracksEdit: () => {
          setIsEditingSnapshotTracks(false)
          setDetailTrackStates(cloneTrackStates(activeDetailSnapshot?.trackStates || []))
        },
        onToggleSolo: (trackId) => {
          setDetailTrackStates((current) =>
            current.map((trackState) =>
              trackState.trackId === trackId
                ? {
                    ...trackState,
                    is_soloed: !trackSoloState(trackState),
                    isSoloed: !trackSoloState(trackState),
                  }
                : trackState,
            ),
          )
        },
        onToggleMute: (trackId) => {
          setDetailTrackStates((current) =>
            current.map((trackState) =>
              trackState.trackId === trackId
                ? {
                    ...trackState,
                    is_muted: !trackMuteState(trackState),
                    isMuted: !trackMuteState(trackState),
                  }
                : trackState,
            ),
          )
        },
        onClose: () => {
          setIsDetailModalOpen(false)
          setDetailSnapshotId('')
          setDetailSnapshotName('')
          setDetailTrackStates([])
          setIsEditingSnapshotDetailName(false)
          setIsEditingSnapshotTracks(false)
          setEditingSnapshotId('')
          setEditingSnapshotName('')
        },
      }),
    ],
  )
}
