import React from './react-shared.mjs'
import {
  ATMOS_MUX_ALGORITHM_STEPS,
  buildAtmosMuxRunPreview,
  buildAtmosMuxToolRunRequest,
  inferParentDirectory,
} from './toolCore.mjs'
import {
  StatItem,
  StatusBadge,
  WorkflowActionBar,
  WorkflowButton,
  WorkflowCard,
  WorkflowFrame,
  WorkflowInput,
} from './ui.mjs'

const h = React.createElement

const WORKFLOW_STEPS = [
  { id: 'sources', label: 'Sources' },
  { id: 'output', label: 'Output' },
  { id: 'review', label: 'Review / Run' },
]

const MP4_FILE_PICKER_OPTIONS = Object.freeze({
  filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
})

function selectFirstPath(openFn, options) {
  return Promise.resolve(openFn(options)).then((result) => {
    if (!result || result.canceled || !Array.isArray(result.paths) || result.paths.length === 0) {
      return ''
    }
    return typeof result.paths[0] === 'string' ? result.paths[0] : ''
  })
}

function clampStep(step) {
  return Math.min(Math.max(1, Number(step) || 1), WORKFLOW_STEPS.length)
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

function getJobResult(job) {
  return job && typeof job === 'object' && job.result && typeof job.result === 'object' ? job.result : null
}

function getJobSummary(job) {
  const result = getJobResult(job)
  if (result && typeof result.summary === 'string' && result.summary.trim()) {
    return result.summary.trim()
  }
  return ''
}

function getJobOutputPath(job) {
  const result = getJobResult(job)
  const nestedResult = result && result.result && typeof result.result === 'object' ? result.result : null
  if (nestedResult && typeof nestedResult.outputPath === 'string' && nestedResult.outputPath.trim()) {
    return nestedResult.outputPath.trim()
  }
  if (result && typeof result.outputPath === 'string' && result.outputPath.trim()) {
    return result.outputPath.trim()
  }
  return ''
}

function createEmptyLastRun() {
  return {
    jobId: '',
    outputPath: '',
    summary: '',
    state: '',
  }
}

export function AtmosVideoMuxToolPage({ host }) {
  const [step, setStep] = React.useState(1)
  const [videoPath, setVideoPath] = React.useState('')
  const [atmosPath, setAtmosPath] = React.useState('')
  const [outputDir, setOutputDir] = React.useState('')
  const [allowFpsConversion, setAllowFpsConversion] = React.useState(true)
  const [outputDirEntryCount, setOutputDirEntryCount] = React.useState(null)
  const [statusMessage, setStatusMessage] = React.useState('')
  const [isRunning, setIsRunning] = React.useState(false)
  const [lastRun, setLastRun] = React.useState(() => createEmptyLastRun())

  const runPreview = React.useMemo(
    () =>
      buildAtmosMuxRunPreview({
        videoPath,
        atmosPath,
        outputDir,
        allowFpsConversion,
      }),
    [videoPath, atmosPath, outputDir, allowFpsConversion],
  )

  const reviewTone = runPreview.canRun ? 'success' : 'warning'
  const sourceReadyCount = [videoPath, atmosPath].filter(Boolean).length

  const pickVideo = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openFile, MP4_FILE_PICKER_OPTIONS)
    if (!selectedPath) {
      setStatusMessage('Video selection canceled.')
      return
    }

    setVideoPath(selectedPath)
    if (!outputDir) {
      setOutputDir(inferParentDirectory(selectedPath))
    }
    setStatusMessage('Video source staged.')
  }, [host.dialog, outputDir])

  const pickAtmos = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openFile, MP4_FILE_PICKER_OPTIONS)
    if (!selectedPath) {
      setStatusMessage('Atmos selection canceled.')
      return
    }

    setAtmosPath(selectedPath)
    setStatusMessage('Atmos source staged.')
  }, [host.dialog])

  const pickOutputDir = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openDirectory)
    if (!selectedPath) {
      setStatusMessage('Output directory selection canceled.')
      return
    }

    setOutputDir(selectedPath)
    setStatusMessage('Output directory staged.')
  }, [host.dialog])

  const refreshOutputDirectoryListing = React.useCallback(async () => {
    if (!outputDir) {
      setStatusMessage('Select an output directory first.')
      return
    }

    try {
      const entries = await host.fs.readdir(outputDir)
      setOutputDirEntryCount(Array.isArray(entries) ? entries.length : 0)
      setStatusMessage('Output directory listing refreshed.')
    } catch (error) {
      setStatusMessage(toErrorMessage(error, 'Unable to list the output directory.'))
    }
  }, [host.fs, outputDir])

  const openOutputDirectory = React.useCallback(async () => {
    if (!outputDir) {
      setStatusMessage('Select an output directory first.')
      return
    }

    try {
      const response = await host.shell.openPath(outputDir)
      setStatusMessage(response ? `Open output directory: ${response}` : 'Opened output directory.')
    } catch (error) {
      setStatusMessage(toErrorMessage(error, 'Unable to open the output directory.'))
    }
  }, [host.shell, outputDir])

  const goPrevious = React.useCallback(() => {
    setStep((currentStep) => clampStep(currentStep - 1))
  }, [])

  const goNext = React.useCallback(() => {
    setStep((currentStep) => clampStep(currentStep + 1))
  }, [])

  const runTool = React.useCallback(async () => {
    if (!runPreview.canRun || isRunning) {
      return
    }

    setIsRunning(true)
    setStatusMessage('Running Atmos video mux…')

    try {
      const response = await host.runTool(
        buildAtmosMuxToolRunRequest({
          videoPath,
          atmosPath,
          outputDir,
          allowFpsConversion,
        }),
      )
      const nextJob = response?.job ?? null
      const nextRun = {
        jobId: response?.jobId ?? (typeof nextJob?.jobId === 'string' ? nextJob.jobId : ''),
        outputPath: getJobOutputPath(nextJob),
        summary: getJobSummary(nextJob),
        state: typeof nextJob?.state === 'string' ? nextJob.state : '',
      }
      setLastRun(nextRun)
      setStatusMessage(
        nextRun.summary ||
          (nextRun.outputPath ? `Atmos video mux completed: ${nextRun.outputPath}` : 'Atmos video mux finished.'),
      )
    } catch (error) {
      setStatusMessage(toErrorMessage(error, 'Atmos video mux failed.'))
    } finally {
      setIsRunning(false)
    }
  }, [allowFpsConversion, atmosPath, host, isRunning, outputDir, runPreview.canRun, videoPath])

  const statusPanel =
    statusMessage || lastRun.jobId
      ? h(
          WorkflowCard,
          {
            title: 'Run status',
            subtitle: 'Latest host-owned tool execution result.',
            className: 'tm-panel',
          },
          h(
            'div',
            { className: 'tm-summary' },
            h(
              'div',
              { className: 'tm-summary__row' },
              h(
                StatusBadge,
                {
                  tone: lastRun.state === 'succeeded' ? 'success' : lastRun.state === 'failed' ? 'danger' : reviewTone,
                },
                lastRun.state === 'succeeded' ? 'Ready' : lastRun.state === 'failed' ? 'Failed' : isRunning ? 'Running' : 'Staged',
              ),
              lastRun.jobId ? h(StatItem, { label: 'Job', value: lastRun.jobId }) : null,
              lastRun.outputPath ? h(StatItem, { label: 'Output', value: inferParentDirectory(lastRun.outputPath) || lastRun.outputPath }) : null,
            ),
            statusMessage ? h('p', { className: 'tm-status-note' }, statusMessage) : null,
            lastRun.outputPath ? h('code', { className: 'tm-path' }, lastRun.outputPath) : null,
          ),
        )
      : null

  function renderSourcesStep() {
    return h(
      'div',
      { className: 'tm-step-stack' },
      h(
        WorkflowCard,
        {
          title: 'Source files',
          subtitle: 'Stage the mastered picture MP4 and the Dolby Atmos MP4 input.',
          className: 'tm-panel tm-panel--scroll',
        },
        h(
          'div',
          { className: 'tm-status-grid' },
          h(StatItem, { label: 'Selected files', value: `${sourceReadyCount}/2` }),
          h(StatItem, { label: 'Video', value: videoPath ? 'Ready' : 'Pending' }),
          h(StatItem, { label: 'Atmos', value: atmosPath ? 'Ready' : 'Pending' }),
        ),
        h(
          'div',
          { className: 'tm-field-grid' },
          h(
            'div',
            { className: 'tm-field-row' },
            h(WorkflowInput, {
              label: 'Video MP4',
              readOnly: true,
              value: videoPath,
              placeholder: 'Select the mastered video MP4',
              hint: 'The output directory auto-follows this file until you override it.',
            }),
            h(
              'div',
              { className: 'tm-field-actions' },
              h(
                WorkflowButton,
                {
                  variant: 'secondary',
                  onClick: pickVideo,
                },
                'Pick video MP4',
              ),
            ),
          ),
          videoPath
            ? h('code', { className: 'tm-path' }, videoPath)
            : h('p', { className: 'tm-status-note' }, 'Video source not selected yet.'),
          h(
            'div',
            { className: 'tm-field-row' },
            h(WorkflowInput, {
              label: 'Atmos MP4',
              readOnly: true,
              value: atmosPath,
              placeholder: 'Select the Atmos MP4 source',
              hint: 'Use the official dual-MP4 mux algorithm input file.',
            }),
            h(
              'div',
              { className: 'tm-field-actions' },
              h(
                WorkflowButton,
                {
                  variant: 'secondary',
                  onClick: pickAtmos,
                },
                'Pick Atmos MP4',
              ),
            ),
          ),
          atmosPath
            ? h('code', { className: 'tm-path' }, atmosPath)
            : h('p', { className: 'tm-status-note' }, 'Atmos source not selected yet.'),
        ),
      ),
      h(
        WorkflowCard,
        {
          title: 'Run option',
          subtitle: 'Keep the algorithm behavior aligned with the official one-click tool.',
          className: 'tm-panel',
        },
        h(
          'label',
          { className: 'tm-toggle' },
          h('input', {
            type: 'checkbox',
            checked: allowFpsConversion,
            onChange: (event) => setAllowFpsConversion(Boolean(event.target.checked)),
          }),
          h(
            'span',
            null,
            h('span', { className: 'tm-toggle__title' }, 'Allow FPS conversion'),
            h(
              'span',
              { className: 'tm-toggle__hint' },
              'Convert the video FPS when the source mismatch exceeds 0.01 before muxing.',
            ),
          ),
        ),
      ),
    )
  }

  function renderOutputStep() {
    return h(
      'div',
      { className: 'tm-step-stack' },
      h(
        WorkflowCard,
        {
          title: 'Output directory',
          subtitle: 'Pick the destination folder for the generated Atmos output MP4.',
          className: 'tm-panel tm-panel--scroll',
        },
        h(
          'div',
          { className: 'tm-status-grid' },
          h(StatItem, { label: 'Output folder', value: outputDir ? 'Ready' : 'Pending' }),
          h(StatItem, { label: 'Listing', value: outputDirEntryCount === null ? 'Not loaded' : `${outputDirEntryCount} items` }),
          h(StatItem, { label: 'Filename', value: 'Atmos_Output_YYYYMMDD_HHMMSS.mp4' }),
        ),
        h(
          'div',
          { className: 'tm-field-row' },
          h(WorkflowInput, {
            label: 'Destination',
            readOnly: true,
            value: outputDir,
            placeholder: 'Select an output directory',
            hint: 'If you skip this, the page defaults to the video file parent folder.',
          }),
          h(
            'div',
            { className: 'tm-field-actions' },
            h(
              WorkflowButton,
              {
                variant: 'secondary',
                onClick: pickOutputDir,
              },
              'Pick output directory',
            ),
            h(
              WorkflowButton,
              {
                variant: 'tertiary',
                onClick: refreshOutputDirectoryListing,
                disabled: !outputDir,
              },
              'Refresh listing',
            ),
            h(
              WorkflowButton,
              {
                variant: 'tertiary',
                onClick: openOutputDirectory,
                disabled: !outputDir,
              },
              'Open output directory',
            ),
          ),
        ),
        outputDir ? h('code', { className: 'tm-path' }, outputDir) : h('p', { className: 'tm-status-note' }, 'Output directory not selected yet.'),
      ),
      h(
        WorkflowCard,
        {
          title: 'Output behavior',
          subtitle: 'The script writes a timestamped file and retries with H.264 level repair if required.',
          className: 'tm-panel',
        },
        h(
          'div',
          { className: 'tm-summary' },
          h('p', { className: 'tm-status-note' }, 'Output order remains video + Atmos + stereo, with `--input-video-frame-rate` passed into the mux step.'),
          h('p', { className: 'tm-status-note' }, 'If muxing fails because of H.264 level incompatibility, the flow retries with `h264_metadata=level=5.1`.'),
        ),
      ),
    )
  }

  function renderReviewStep() {
    return h(
      'div',
      { className: 'tm-step-stack' },
      h(
        WorkflowCard,
        {
          title: 'Run readiness',
          subtitle: 'Review the staged inputs and launch the host-owned tool job.',
          className: 'tm-panel',
        },
        h(
          'div',
          { className: 'tm-status-grid' },
          h(StatItem, { label: 'Video', value: videoPath ? 'Ready' : 'Missing' }),
          h(StatItem, { label: 'Atmos', value: atmosPath ? 'Ready' : 'Missing' }),
          h(StatItem, { label: 'Output', value: outputDir ? 'Ready' : 'Missing' }),
        ),
        h(
          'div',
          { className: 'tm-summary' },
          h(
            'div',
            { className: 'tm-summary__row' },
            h(StatusBadge, { tone: reviewTone }, runPreview.canRun ? 'Ready to run' : 'Missing required input'),
            lastRun.jobId ? h(StatusBadge, { tone: lastRun.state === 'succeeded' ? 'success' : 'warning' }, lastRun.jobId) : null,
          ),
          videoPath ? h('code', { className: 'tm-path' }, videoPath) : null,
          atmosPath ? h('code', { className: 'tm-path' }, atmosPath) : null,
          outputDir ? h('code', { className: 'tm-path' }, outputDir) : null,
          runPreview.issues.length > 0
            ? h(
                'ul',
                { className: 'tm-algorithm' },
                runPreview.issues.map((issue) => h('li', { key: issue }, issue)),
              )
            : h('p', { className: 'tm-status-note' }, 'The host will create the `tool.run` job and execute the bundled script on your behalf.'),
        ),
      ),
      h(
        WorkflowCard,
        {
          title: 'Command preview',
          subtitle: 'This is the normalized payload and script argument preview the page sends into `host.runTool(...)`.',
          className: 'tm-panel tm-panel--scroll',
        },
        h('pre', { className: 'tm-code' }, JSON.stringify(runPreview, null, 2)),
      ),
      h(
        WorkflowCard,
        {
          title: 'Algorithm outline',
          subtitle: 'The official sample preserves the same mux sequence as the source shell tool.',
          className: 'tm-panel tm-panel--scroll',
        },
        h(
          'ol',
          { className: 'tm-algorithm' },
          ATMOS_MUX_ALGORITHM_STEPS.map((algorithmStep) => h('li', { key: algorithmStep }, algorithmStep)),
        ),
      ),
    )
  }

  let stepContent = renderSourcesStep()
  if (step === 2) {
    stepContent = renderOutputStep()
  } else if (step === 3) {
    stepContent = renderReviewStep()
  }

  const footer = h(
    WorkflowActionBar,
    {
      align: 'space-between',
      className: 'tm-action-bar',
    },
    step === 1
      ? h('span', { className: 'tm-status-note' }, 'Select both source files to continue.')
      : h(
          WorkflowButton,
          {
            variant: 'tertiary',
            onClick: goPrevious,
            disabled: isRunning,
          },
          'Previous',
        ),
    step < WORKFLOW_STEPS.length
      ? h(
          WorkflowButton,
          {
            variant: 'primary',
            onClick: goNext,
            disabled:
              isRunning ||
              (step === 1 ? sourceReadyCount < 2 : step === 2 ? !outputDir : false),
          },
          step === 1 ? 'Next: Output' : 'Next: Review / Run',
        )
      : h(
          WorkflowButton,
          {
            variant: 'primary',
            onClick: runTool,
            disabled: isRunning || !runPreview.canRun,
          },
          isRunning ? 'Running…' : 'Run Atmos Mux',
        ),
  )

  return h(
    WorkflowFrame,
    {
      className: 'tm-shell',
      eyebrow: 'Official tool plugin',
      title: 'Atmos Video Mux',
      subtitle: 'Stage the source files, verify the output target, then run the host-owned mux job.',
      steps: WORKFLOW_STEPS,
      currentStep: step,
      footer,
    },
    statusPanel,
    stepContent,
  )
}
