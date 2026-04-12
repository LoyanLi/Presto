export const ATMOS_MUX_RESOURCE_ID = 'atmos-video-mux-script'
export const ATMOS_VIDEO_MUX_TOOL_ID = 'atmos-video-mux'
export const FPS_MISMATCH_THRESHOLD = 0.01

export const ATMOS_MUX_ALGORITHM_STEPS = [
  'Select video MP4 and Atmos MP4 sources.',
  'Detect source FPS values with ffprobe.',
  'If FPS mismatch exceeds 0.01 and conversion is enabled, convert video FPS to match Atmos FPS.',
  'Demux source files and locate the main video, stereo, and Atmos streams.',
  'Mux streams with Atmos before stereo and pass --input-video-frame-rate.',
  'If muxing fails with H.264 level incompatibility, run ffmpeg h264_metadata=level=5.1 and retry.',
  'Write output as Atmos_Output_YYYYMMDD_HHMMSS.mp4 in the selected output directory.',
]

function trimToString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function inferParentDirectory(filePath) {
  const normalized = trimToString(filePath).replace(/\\/g, '/')
  const separator = normalized.lastIndexOf('/')
  if (separator <= 0) {
    return ''
  }
  return normalized.slice(0, separator)
}

export function normalizeAtmosMuxInput(input = {}) {
  const videoPath = trimToString(input.videoPath)
  const atmosPath = trimToString(input.atmosPath)
  const outputDir = trimToString(input.outputDir) || inferParentDirectory(videoPath)

  return {
    videoPath,
    atmosPath,
    outputDir,
    allowFpsConversion: input.allowFpsConversion !== false,
    overwrite: input.overwrite !== false,
  }
}

export function validateAtmosMuxInput(input) {
  const issues = []
  if (!input.videoPath) {
    issues.push('videoPath is required.')
  }
  if (!input.atmosPath) {
    issues.push('atmosPath is required.')
  }
  if (!input.outputDir) {
    issues.push('outputDir is required.')
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

export function buildAtmosMuxScriptArgs(input) {
  const normalized = normalizeAtmosMuxInput(input)
  const validation = validateAtmosMuxInput(normalized)
  if (!validation.ok) {
    throw new Error(`Invalid Atmos mux input: ${validation.issues.join(' ')}`)
  }

  const args = [
    '--video',
    normalized.videoPath,
    '--atmos',
    normalized.atmosPath,
    '--output-dir',
    normalized.outputDir,
  ]

  if (normalized.allowFpsConversion) {
    args.push('--allow-fps-conversion')
  }

  if (!normalized.overwrite) {
    args.push('--no-overwrite')
  }

  return args
}

export function buildAtmosMuxRunPreview(input = {}) {
  const normalized = normalizeAtmosMuxInput(input)
  const validation = validateAtmosMuxInput(normalized)

  return {
    resourceId: ATMOS_MUX_RESOURCE_ID,
    args: validation.ok ? buildAtmosMuxScriptArgs(normalized) : [],
    input: normalized,
    canRun: validation.ok,
    issues: validation.issues,
  }
}

export function buildAtmosMuxToolRunRequest(input = {}) {
  return {
    toolId: ATMOS_VIDEO_MUX_TOOL_ID,
    input: normalizeAtmosMuxInput(input),
  }
}

export function parseAtmosMuxOutputPath(stdout) {
  if (typeof stdout !== 'string') {
    return ''
  }

  const match = stdout.match(/OUTPUT_PATH=(.+)/)
  if (!match) {
    return ''
  }

  return match[1].trim()
}
