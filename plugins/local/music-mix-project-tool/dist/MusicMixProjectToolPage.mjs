import React from './react-shared.mjs'
import { tMusicMixProject } from './i18n.mjs'
import {
  buildMusicMixProjectToolRunRequest,
  createDefaultDirectoryItems,
  formatProjectFolderName,
  normalizeMusicMixProjectInput,
} from './toolCore.mjs'
import {
  ToolActionBar,
  ToolButton,
  ToolFieldGrid,
  ToolInput,
  ToolPanel,
  ToolSectionHeader,
} from './ui.mjs'

const h = React.createElement

function createTodayValue() {
  return new Date().toISOString().slice(0, 10)
}

function toErrorMessage(error, fallbackMessage) {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallbackMessage
}

function selectFirstPath(openFn) {
  return Promise.resolve(openFn()).then((result) => {
    if (!result || result.canceled || !Array.isArray(result.paths) || result.paths.length === 0) {
      return ''
    }
    return typeof result.paths[0] === 'string' ? result.paths[0] : ''
  })
}

function readRunResult(job) {
  const result = job && typeof job === 'object' ? job.result : null
  const nested = result && typeof result === 'object' ? result.result : null
  return {
    createdRoot: typeof nested?.createdRoot === 'string' ? nested.createdRoot : '',
    createdDirectories: Array.isArray(nested?.createdDirectories) ? nested.createdDirectories : [],
    createdFiles: Array.isArray(nested?.createdFiles) ? nested.createdFiles : [],
    summary: typeof result?.summary === 'string' ? result.summary : '',
  }
}

function normalizeDirectoryLabel(value) {
  return String(value ?? '').trim().replace(/[\\/]+/g, ' ')
}

function buildSelectedSectionLabels(directoryItems) {
  return (Array.isArray(directoryItems) ? directoryItems : [])
    .filter((item) => item?.selected)
    .map((item) => normalizeDirectoryLabel(item?.label))
    .filter(Boolean)
}

function toggleDirectorySelection(directoryItems, directoryId) {
  return (Array.isArray(directoryItems) ? directoryItems : []).map((item) =>
    item.id === directoryId
      ? {
          ...item,
          selected: !item.selected,
        }
      : item,
  )
}

function updateDirectoryLabel(directoryItems, directoryId, label) {
  return (Array.isArray(directoryItems) ? directoryItems : []).map((item) =>
    item.id === directoryId
      ? {
          ...item,
          label,
        }
      : item,
  )
}

function addCustomDirectoryItem(directoryItems) {
  const currentItems = Array.isArray(directoryItems) ? directoryItems : []
  return [
    ...currentItems,
    {
      id: `custom-${currentItems.length + 1}`,
      label: '',
      selected: false,
    },
  ]
}

function getSelectedDirectoryOrder(directoryItems, directoryId) {
  let selectedCount = 0
  for (const item of Array.isArray(directoryItems) ? directoryItems : []) {
    if (item?.selected) {
      selectedCount += 1
    }
    if (item?.id === directoryId) {
      return item?.selected ? String(selectedCount).padStart(2, '0') : '--'
    }
  }
  return '--'
}

export function MusicMixProjectToolPage({ host, context }) {
  const [date, setDate] = React.useState(createTodayValue())
  const [songName, setSongName] = React.useState('')
  const [directoryItems, setDirectoryItems] = React.useState(() => createDefaultDirectoryItems())
  const [statusMessage, setStatusMessage] = React.useState('')
  const [isRunning, setIsRunning] = React.useState(false)
  const [lastRun, setLastRun] = React.useState(null)

  const selectedSections = React.useMemo(
    () => buildSelectedSectionLabels(directoryItems),
    [directoryItems],
  )
  const previewInput = React.useMemo(
    () =>
      normalizeMusicMixProjectInput({
        date,
        songName,
        sections: selectedSections,
      }),
    [date, selectedSections, songName],
  )
  const folderName = formatProjectFolderName(previewInput)
  const lastRunResult = readRunResult(lastRun)

  const createProject = React.useCallback(async () => {
    if (isRunning) {
      return
    }

    const selectedPath = await selectFirstPath(host.dialog.openDirectory)
    if (!selectedPath) {
      setStatusMessage(tMusicMixProject(context, 'status.directorySelectionCanceled'))
      return
    }

    setIsRunning(true)
    setStatusMessage(tMusicMixProject(context, 'status.running'))

    try {
      const normalized = normalizeMusicMixProjectInput({
        baseRoot: selectedPath,
        date,
        songName,
        sections: buildSelectedSectionLabels(directoryItems),
      })
      const response = await host.runTool(buildMusicMixProjectToolRunRequest(normalized))
      const nextJob = response?.job ?? null
      const nextResult = readRunResult(nextJob)
      setLastRun(nextJob)
      setStatusMessage(nextResult.summary || tMusicMixProject(context, 'summary.created', { createdRoot: nextResult.createdRoot }))
    } catch (error) {
      setStatusMessage(toErrorMessage(error, tMusicMixProject(context, 'status.createFailed')))
    } finally {
      setIsRunning(false)
    }
  }, [context, date, directoryItems, host, isRunning, songName])

  const openCreatedFolder = React.useCallback(async () => {
    if (!lastRunResult.createdRoot) {
      return
    }
    await host.shell.openPath(lastRunResult.createdRoot)
    setStatusMessage(tMusicMixProject(context, 'status.openedFolder'))
  }, [context, host.shell, lastRunResult.createdRoot])

  return h(
    'section',
    { className: 'mmpt-shell' },
    h(
      'div',
      { className: 'mmpt-grid' },
      h(
        ToolPanel,
        {
          title: tMusicMixProject(context, 'section.setup'),
          className: 'mmpt-panel mmpt-panel--setup',
        },
        h(
          ToolFieldGrid,
          { className: 'mmpt-setup-grid' },
          h(ToolInput, {
            label: tMusicMixProject(context, 'field.date'),
            type: 'date',
            value: date,
            onChange: (event) => setDate(event.target.value),
          }),
          h(ToolInput, {
            label: tMusicMixProject(context, 'field.songName'),
            value: songName,
            onChange: (event) => setSongName(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'mmpt-preview-list' },
          h(
            'div',
            { className: 'mmpt-preview-row mmpt-preview-row--path' },
            h('span', { className: 'mmpt-preview-label' }, tMusicMixProject(context, 'field.previewTargetPath')),
            h('p', { className: 'mmpt-preview-path' }, tMusicMixProject(context, 'field.previewTargetPathPending')),
          ),
        ),
      ),
      h(
        ToolPanel,
        {
          title: tMusicMixProject(context, 'field.sections'),
          actions: h(
            ToolButton,
            {
              onClick: () => setDirectoryItems((currentItems) => addCustomDirectoryItem(currentItems)),
              className: 'mmpt-inline-button',
              variant: 'secondary',
            },
            tMusicMixProject(context, 'action.addFolder'),
          ),
          className: 'mmpt-panel mmpt-panel--folders',
        },
        h(
          ToolSectionHeader,
          {
            title: tMusicMixProject(context, 'field.sections'),
            className: 'mmpt-screen-reader-only',
          },
        ),
        h(
          'div',
          { className: 'mmpt-directory-list' },
          directoryItems.map((item) =>
            h(
              'div',
              { key: item.id, className: 'mmpt-directory-row' },
              h(
                'div',
                { className: 'mmpt-directory-row__meta' },
                h('span', { className: 'mmpt-directory-order' }, getSelectedDirectoryOrder(directoryItems, item.id)),
                h(
                  'label',
                  { className: 'mmpt-directory-toggle' },
                  h('input', {
                    type: 'checkbox',
                    checked: item.selected,
                    onChange: () => setDirectoryItems((currentItems) => toggleDirectorySelection(currentItems, item.id)),
                  }),
                  h('span', { className: 'mmpt-directory-toggle-label' }, tMusicMixProject(context, 'field.directoryEnabled')),
                ),
              ),
              h(
                'div',
                { className: 'mmpt-directory-field' },
                h(ToolInput, {
                  value: item.label,
                  placeholder: tMusicMixProject(context, 'field.folderNamePlaceholder'),
                  className: 'mmpt-directory-name',
                  onChange: (event) => setDirectoryItems((currentItems) => updateDirectoryLabel(currentItems, item.id, event.target.value)),
                }),
              ),
            ),
          ),
        ),
      ),
      h(
        ToolPanel,
        {
          title: tMusicMixProject(context, 'section.preview'),
          className: 'mmpt-panel mmpt-panel--preview',
        },
        h(
          'div',
          { className: 'mmpt-preview-list' },
          h(
            'div',
            { className: 'mmpt-preview-row' },
            h('span', { className: 'mmpt-preview-label' }, tMusicMixProject(context, 'field.previewFolderName')),
            h('strong', { className: 'mmpt-preview-value' }, folderName),
          ),
        ),
      ),
      statusMessage || lastRunResult.createdRoot
        ? h(
            ToolPanel,
            {
              title: tMusicMixProject(context, 'field.lastRun'),
              className: 'mmpt-panel mmpt-panel--result',
            },
            h(
              'div',
              { className: 'mmpt-preview-list' },
              statusMessage
                ? h(
                    'div',
                    { className: 'mmpt-preview-row' },
                    h('span', { className: 'mmpt-preview-label' }, tMusicMixProject(context, 'field.lastRun')),
                    h('strong', { className: 'mmpt-preview-value' }, statusMessage),
                  )
                : null,
              lastRunResult.createdRoot
                ? h(
                    'div',
                    { className: 'mmpt-preview-row mmpt-preview-row--path' },
                    h('span', { className: 'mmpt-preview-label' }, tMusicMixProject(context, 'field.previewTargetPath')),
                    h('p', { className: 'mmpt-preview-path' }, lastRunResult.createdRoot),
                  )
                : null,
            ),
          )
        : null,
    ),
    h(
      ToolActionBar,
      { className: 'mmpt-actions' },
      [
        h(
          ToolButton,
          {
            key: 'create',
            onClick: createProject,
            disabled: isRunning,
          },
          tMusicMixProject(context, 'action.create'),
        ),
        lastRunResult.createdRoot
          ? h(
              ToolButton,
              {
                key: 'open',
                onClick: openCreatedFolder,
                className: 'mmpt-inline-button',
                variant: 'secondary',
              },
              tMusicMixProject(context, 'action.openCreatedFolder'),
            )
          : null,
        h('span', { key: 'spacer', className: 'mmpt-action-spacer', 'aria-hidden': 'true' }, '\u200b'),
      ],
    ),
  )
}
