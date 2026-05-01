import React from './react-shared.mjs'
import { tMusicMixProject } from './i18n.mjs'
import {
  DEFAULT_SECTION_IDS,
  MUSIC_MIX_PROJECT_STORAGE_KEY,
  buildMusicMixProjectToolRunRequest,
  buildProjectTargetPath,
  formatProjectFolderName,
  normalizeMusicMixProjectInput,
} from './toolCore.mjs'
import { ToolButton, ToolInput, ToolPanel, ToolStat } from './ui.mjs'

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

function toggleSection(currentSections, sectionId) {
  const current = Array.isArray(currentSections) ? currentSections : []
  if (current.includes(sectionId)) {
    return current.filter((section) => section !== sectionId)
  }
  return [...current, sectionId]
}

export function MusicMixProjectToolPage({ host, context }) {
  const [baseRoot, setBaseRoot] = React.useState('')
  const [date, setDate] = React.useState(createTodayValue())
  const [songName, setSongName] = React.useState('')
  const [sections, setSections] = React.useState(DEFAULT_SECTION_IDS)
  const [statusMessage, setStatusMessage] = React.useState('')
  const [isRunning, setIsRunning] = React.useState(false)
  const [lastRun, setLastRun] = React.useState(null)

  React.useEffect(() => {
    let cancelled = false

    async function loadDefaultBaseRoot() {
      const stored = await context.storage?.get?.(MUSIC_MIX_PROJECT_STORAGE_KEY)
      const rememberedBaseRoot = typeof stored?.defaultBaseRoot === 'string' ? stored.defaultBaseRoot.trim() : ''
      if (!cancelled && rememberedBaseRoot && !String(baseRoot ?? '').trim()) {
        setBaseRoot(rememberedBaseRoot)
      }
    }

    void loadDefaultBaseRoot().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [baseRoot, context.storage])

  const previewInput = React.useMemo(
    () =>
      normalizeMusicMixProjectInput({
        baseRoot,
        date,
        songName,
        sections,
      }),
    [baseRoot, date, sections, songName],
  )
  const folderName = formatProjectFolderName(previewInput)
  const targetPath = buildProjectTargetPath(previewInput)
  const lastRunResult = readRunResult(lastRun)

  const browseBaseRoot = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openDirectory)
    if (!selectedPath) {
      setStatusMessage(tMusicMixProject(context, 'status.directorySelectionCanceled'))
      return
    }

    setBaseRoot(selectedPath)
    setStatusMessage('')
  }, [context, host.dialog])

  const createProject = React.useCallback(async () => {
    if (isRunning) {
      return
    }

    setIsRunning(true)
    setStatusMessage(tMusicMixProject(context, 'status.running'))

    try {
      const normalized = normalizeMusicMixProjectInput({
        baseRoot,
        date,
        songName,
        sections,
      })
      const response = await host.runTool(buildMusicMixProjectToolRunRequest(normalized))
      const nextJob = response?.job ?? null
      const nextResult = readRunResult(nextJob)
      setLastRun(nextJob)
      setStatusMessage(nextResult.summary || tMusicMixProject(context, 'summary.created', { createdRoot: nextResult.createdRoot }))
      await context.storage?.set?.(MUSIC_MIX_PROJECT_STORAGE_KEY, {
        defaultBaseRoot: normalized.baseRoot,
      })
    } catch (error) {
      setStatusMessage(toErrorMessage(error, tMusicMixProject(context, 'status.createFailed')))
    } finally {
      setIsRunning(false)
    }
  }, [baseRoot, context, date, host, isRunning, sections, songName])

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
      ToolPanel,
      {
        title: tMusicMixProject(context, 'page.root.title'),
        description: tMusicMixProject(context, 'page.root.description'),
        className: 'mmpt-panel',
      },
      h(
        'div',
        { className: 'mmpt-form-grid' },
        h(
          'div',
          { className: 'mmpt-base-root-row' },
          h(ToolInput, {
            label: tMusicMixProject(context, 'field.baseRoot'),
            hint: tMusicMixProject(context, 'field.baseRootHint'),
            value: baseRoot,
            onChange: (event) => setBaseRoot(event.target.value),
            className: 'mmpt-base-root-input',
          }),
          h(
            ToolButton,
            {
              onClick: browseBaseRoot,
              className: 'mmpt-inline-button',
            },
            tMusicMixProject(context, 'action.browse'),
          ),
        ),
        h(ToolInput, {
          label: tMusicMixProject(context, 'field.date'),
          value: date,
          onChange: (event) => setDate(event.target.value),
        }),
        h(ToolInput, {
          label: tMusicMixProject(context, 'field.songName'),
          value: songName,
          onChange: (event) => setSongName(event.target.value),
        }),
        h(
          'div',
          { className: 'mmpt-section-block' },
          h('p', { className: 'mmpt-section-label' }, tMusicMixProject(context, 'field.sections')),
          h(
            'div',
            { className: 'mmpt-section-grid' },
            DEFAULT_SECTION_IDS.map((sectionId) =>
              h(
                'label',
                { key: sectionId, className: 'mmpt-checkbox' },
                h('input', {
                  type: 'checkbox',
                  checked: sections.includes(sectionId),
                  onChange: () => setSections((currentSections) => toggleSection(currentSections, sectionId)),
                }),
                h('span', null, sectionId),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'mmpt-preview-grid' },
      h(ToolStat, {
        label: tMusicMixProject(context, 'field.previewFolderName'),
        value: folderName,
      }),
      h(
        ToolPanel,
        {
          title: tMusicMixProject(context, 'field.previewTargetPath'),
          className: 'mmpt-panel mmpt-panel--preview',
        },
        h('p', { className: 'mmpt-preview-path' }, targetPath),
      ),
    ),
    h(
      'div',
      { className: 'mmpt-actions' },
      h(
        ToolButton,
        {
          onClick: createProject,
          disabled: isRunning,
        },
        tMusicMixProject(context, 'action.create'),
      ),
      lastRunResult.createdRoot
        ? h(
            ToolButton,
            {
              onClick: openCreatedFolder,
              className: 'mmpt-inline-button',
            },
            tMusicMixProject(context, 'action.openCreatedFolder'),
          )
        : null,
    ),
    statusMessage || lastRunResult.createdRoot
      ? h(
          ToolPanel,
          {
            title: tMusicMixProject(context, 'field.lastRun'),
            className: 'mmpt-panel',
          },
          statusMessage ? h('p', { className: 'mmpt-status-message' }, statusMessage) : null,
          lastRunResult.createdRoot ? h('p', { className: 'mmpt-preview-path' }, lastRunResult.createdRoot) : null,
        )
      : null,
  )
}
