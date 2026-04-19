import React from './react-shared.mjs'
import { tAtmos, translateAtmosPreviewIssue } from './i18n.mjs'
import {
  buildAtmosMuxRunPreview,
  buildAtmosMuxToolRunRequest,
  inferParentDirectory,
} from './toolCore.mjs'
import {
  StatusBadge,
  WorkflowActionBar,
  WorkflowButton,
  WorkflowCard,
  WorkflowInput,
  WorkflowStepper,
} from './ui.mjs'

const h = React.createElement

function createWorkflowSteps(context) {
  return [
    { id: 'sources', label: tAtmos(context, 'step.sources') },
    { id: 'output-review-run', label: tAtmos(context, 'step.outputReviewRun') },
  ]
}

function createMp4FilePickerOptions(context) {
  return {
    filters: [{ name: tAtmos(context, 'picker.filterName'), extensions: ['mp4'] }],
  }
}

function selectFirstPath(openFn, options) {
  return Promise.resolve(openFn(options)).then((result) => {
    if (!result || result.canceled || !Array.isArray(result.paths) || result.paths.length === 0) {
      return ''
    }
    return typeof result.paths[0] === 'string' ? result.paths[0] : ''
  })
}

function clampStep(step) {
  return Math.min(Math.max(1, Number(step) || 1), 2)
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

function getPathName(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return ''
  }
  const normalizedPath = filePath.replace(/\\/g, '/')
  const segments = normalizedPath.split('/').filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : normalizedPath
}

function createEmptyLastRun() {
  return {
    jobId: '',
    outputPath: '',
    summary: '',
    state: '',
  }
}

export function AtmosVideoMuxToolPage({ host, context }) {
  const [step, setStep] = React.useState(1)
  const [videoPath, setVideoPath] = React.useState('')
  const [atmosPath, setAtmosPath] = React.useState('')
  const [outputDir, setOutputDir] = React.useState('')
  const [allowFpsConversion, setAllowFpsConversion] = React.useState(true)
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

  const workflowSteps = createWorkflowSteps(context)
  const sourceReadyCount = [videoPath, atmosPath].filter(Boolean).length
  const previewIssues = runPreview.issues.map((issue) => translateAtmosPreviewIssue(context, issue))
  const reviewTone = runPreview.canRun ? 'success' : 'warning'
  const resultTone =
    lastRun.state === 'succeeded'
      ? 'success'
      : lastRun.state === 'failed'
        ? 'danger'
        : isRunning
          ? 'warning'
          : reviewTone
  const resultLabel =
    lastRun.state === 'succeeded'
      ? tAtmos(context, 'status.completed')
      : lastRun.state === 'failed'
        ? tAtmos(context, 'status.failed')
        : isRunning
          ? tAtmos(context, 'status.running')
          : runPreview.canRun
            ? tAtmos(context, 'status.readyToRun')
            : tAtmos(context, 'status.missingRequiredInput')
  const resultMessage =
    typeof statusMessage === 'string' && statusMessage.trim()
      ? statusMessage.trim()
      : lastRun.outputPath
        ? tAtmos(context, 'status.outputFile', { fileName: getPathName(lastRun.outputPath) })
        : lastRun.summary

  const pickVideo = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openFile, createMp4FilePickerOptions(context))
    if (!selectedPath) {
      setStatusMessage(tAtmos(context, 'status.videoSelectionCanceled'))
      return
    }

    setVideoPath(selectedPath)
    if (!outputDir) {
      setOutputDir(inferParentDirectory(selectedPath))
    }
    setStatusMessage(tAtmos(context, 'status.videoStaged'))
  }, [context, host.dialog, outputDir])

  const pickAtmos = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openFile, createMp4FilePickerOptions(context))
    if (!selectedPath) {
      setStatusMessage(tAtmos(context, 'status.atmosSelectionCanceled'))
      return
    }

    setAtmosPath(selectedPath)
    setStatusMessage(tAtmos(context, 'status.atmosStaged'))
  }, [context, host.dialog])

  const pickOutputDir = React.useCallback(async () => {
    const selectedPath = await selectFirstPath(host.dialog.openDirectory)
    if (!selectedPath) {
      setStatusMessage(tAtmos(context, 'status.outputSelectionCanceled'))
      return
    }

    setOutputDir(selectedPath)
    setStatusMessage(tAtmos(context, 'status.outputStaged'))
  }, [context, host.dialog])

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
    setStatusMessage(tAtmos(context, 'status.runningTool'))

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
        nextRun.outputPath
          ? tAtmos(context, 'status.outputFile', { fileName: getPathName(nextRun.outputPath) })
          : nextRun.summary || tAtmos(context, 'status.finished'),
      )
    } catch (error) {
      setStatusMessage(toErrorMessage(error, tAtmos(context, 'status.failedTool')))
    } finally {
      setIsRunning(false)
    }
  }, [allowFpsConversion, atmosPath, context, host, isRunning, outputDir, runPreview.canRun, videoPath])

  function renderSourcesStep() {
    return h(
      'div',
      { className: 'tm-step-stack' },
      h(
        WorkflowCard,
        {
          title: tAtmos(context, 'page.sources.title'),
          subtitle: tAtmos(context, 'page.sources.subtitle'),
          className: 'tm-panel tm-panel--scroll',
        },
        h(
          'div',
          { className: 'tm-field-grid' },
          h(
            'div',
            { className: 'tm-field' },
            h('p', { className: 'tm-field-label' }, tAtmos(context, 'field.video')),
            h(
              'div',
              { className: 'tm-field-row tm-field-row--picker' },
              h(WorkflowInput, {
                readOnly: true,
                value: videoPath,
                placeholder: tAtmos(context, 'placeholder.video'),
                className: 'tm-field-control',
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
                  tAtmos(context, 'button.pickVideo'),
                ),
              ),
            ),
            h('p', { className: 'tm-field-copy' }, tAtmos(context, 'copy.video')),
            videoPath ? null : h('p', { className: 'tm-status-note' }, tAtmos(context, 'note.videoMissing')),
          ),
          h(
            'div',
            { className: 'tm-field' },
            h('p', { className: 'tm-field-label' }, tAtmos(context, 'field.atmos')),
            h(
              'div',
              { className: 'tm-field-row tm-field-row--picker' },
              h(WorkflowInput, {
                readOnly: true,
                value: atmosPath,
                placeholder: tAtmos(context, 'placeholder.atmos'),
                className: 'tm-field-control',
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
                  tAtmos(context, 'button.pickAtmos'),
                ),
              ),
            ),
            h('p', { className: 'tm-field-copy' }, tAtmos(context, 'copy.atmos')),
            atmosPath ? null : h('p', { className: 'tm-status-note' }, tAtmos(context, 'note.atmosMissing')),
          ),
          h(
            'label',
            { className: 'tm-toggle tm-toggle--inline' },
            h('input', {
              type: 'checkbox',
              checked: allowFpsConversion,
              onChange: (event) => setAllowFpsConversion(Boolean(event.target.checked)),
            }),
            h(
              'span',
              null,
              h('span', { className: 'tm-toggle__title' }, tAtmos(context, 'toggle.allowFpsConversion.title')),
              h(
                'span',
                { className: 'tm-toggle__hint' },
                tAtmos(context, 'toggle.allowFpsConversion.hint'),
              ),
            ),
          ),
        ),
      ),
    )
  }

  function renderOutputReviewRunStep() {
    return h(
      'div',
      { className: 'tm-step-stack' },
      h(
        WorkflowCard,
        {
          title: tAtmos(context, 'page.output.title'),
          subtitle: tAtmos(context, 'page.output.subtitle'),
          className: 'tm-panel tm-panel--scroll',
        },
        h(
          'div',
          { className: 'tm-field' },
          h('p', { className: 'tm-field-label' }, tAtmos(context, 'field.outputDir')),
          h(
            'div',
            { className: 'tm-field-row tm-field-row--picker' },
            h(WorkflowInput, {
              readOnly: true,
              value: outputDir,
              placeholder: tAtmos(context, 'placeholder.outputDir'),
              className: 'tm-field-control',
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
                tAtmos(context, 'button.pickOutputDir'),
              ),
            ),
          ),
          h('p', { className: 'tm-field-copy' }, tAtmos(context, 'copy.outputDir')),
        ),
        outputDir ? null : h('p', { className: 'tm-status-note' }, tAtmos(context, 'note.outputDirMissing')),
        h(
          'div',
          { className: 'tm-summary tm-summary--section' },
          h('div', { className: 'tm-summary__row' }, h(StatusBadge, { tone: resultTone }, resultLabel)),
          previewIssues.length > 0
            ? h(
                'ul',
                { className: 'tm-algorithm' },
                previewIssues.map((issue) => h('li', { key: issue }, issue)),
              )
            : null,
          resultMessage ? h('p', { className: 'tm-status-note' }, resultMessage) : null,
        ),
      ),
    )
  }

  const footer = h(
    WorkflowActionBar,
    {
      align: 'space-between',
      className: 'tm-action-bar',
      sticky: false,
    },
    step === 1
      ? h('span', { className: 'tm-status-note' }, tAtmos(context, 'note.selectSources'))
      : h(
          WorkflowButton,
          {
            variant: 'tertiary',
            onClick: goPrevious,
            disabled: isRunning,
          },
          tAtmos(context, 'button.previous'),
        ),
    step < workflowSteps.length
      ? h(
          WorkflowButton,
          {
            variant: 'primary',
            onClick: goNext,
            disabled: isRunning || sourceReadyCount < 2,
          },
          tAtmos(context, 'button.next'),
        )
      : h(
          WorkflowButton,
          {
            variant: 'primary',
            onClick: runTool,
            disabled: isRunning || !runPreview.canRun,
          },
          isRunning ? tAtmos(context, 'button.running') : tAtmos(context, 'button.run'),
        ),
  )

  return h(
    'section',
    { className: 'tm-shell' },
    h(WorkflowStepper, {
      steps: workflowSteps,
      currentStep: step,
      className: 'tm-stepper',
    }),
    h('div', { className: 'tm-shell__body' }, step === 1 ? renderSourcesStep() : renderOutputReviewRunStep()),
    footer,
  )
}
