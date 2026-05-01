export const MUSIC_MIX_PROJECT_TOOL_ID = 'music-mix-project-tool'
export const MUSIC_MIX_PROJECT_RESOURCE_ID = 'music-mix-project-script'
export const DEFAULT_SECTION_IDS = [
  '01_Received',
  '02_DAW_Projects',
  '03_Exports',
  '04_Documents',
  '05_Archive',
]
export const MUSIC_MIX_PROJECT_STORAGE_KEY = 'musicMixProjectTool.settings.v1'

function normalizePath(value) {
  const normalized = String(value ?? '').replace(/\\/g, '/').trim()
  if (!normalized) {
    return ''
  }
  if (normalized === '/') {
    return normalized
  }
  return normalized.replace(/\/+$/, '')
}

function joinPath(...parts) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .join('/')
}

function normalizeDateValue(value) {
  const compact = String(value ?? '').trim().replace(/\D+/g, '')
  if (compact.length === 8) {
    return compact.slice(2)
  }
  if (compact.length === 6) {
    return compact
  }
  return compact
}

function normalizeSongName(value) {
  return String(value ?? '').trim().replace(/[\\/]+/g, ' ')
}

function dedupe(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    result.push(value)
  }
  return result
}

export function normalizeMusicMixProjectInput(input = {}) {
  return {
    baseRoot: normalizePath(input.baseRoot),
    date: normalizeDateValue(input.date),
    songName: normalizeSongName(input.songName),
    sections: buildSelectedDirectories(input.sections),
  }
}

export function validateMusicMixProjectInput(input = {}) {
  const issues = []
  if (!String(input.baseRoot ?? '').trim()) {
    issues.push('baseRoot is required')
  }
  if (!String(input.date ?? '').trim()) {
    issues.push('date is required')
  }
  if (!String(input.songName ?? '').trim()) {
    issues.push('songName is required')
  }
  return {
    ok: issues.length === 0,
    issues,
  }
}

export function formatProjectFolderName(input = {}) {
  return `${String(input.date ?? '').trim()}_${String(input.songName ?? '').trim()}`
}

export function buildProjectTargetPath(input = {}) {
  return joinPath(input.baseRoot, formatProjectFolderName(input))
}

export function buildSelectedDirectories(sections) {
  return dedupe(Array.isArray(sections) ? sections : []).filter((section) => DEFAULT_SECTION_IDS.includes(String(section ?? '')))
}

export function buildMusicMixProjectScriptArgs(input = {}) {
  const normalized = normalizeMusicMixProjectInput(input)
  const args = [
    '--base-root',
    normalized.baseRoot,
    '--folder-name',
    formatProjectFolderName(normalized),
  ]

  for (const section of normalized.sections) {
    args.push('--section', section)
  }

  return args
}

export function buildMusicMixProjectToolRunRequest(input = {}) {
  const normalized = normalizeMusicMixProjectInput(input)
  return {
    toolId: MUSIC_MIX_PROJECT_TOOL_ID,
    input: {
      baseRoot: normalized.baseRoot,
      date: normalized.date,
      songName: normalized.songName,
      sections: normalized.sections,
    },
  }
}

export function parseMusicMixProjectOutput(stdout = '') {
  const result = {
    createdRoot: '',
    createdDirectories: [],
    createdFiles: [],
  }

  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    if (line.startsWith('CREATED_ROOT=')) {
      result.createdRoot = line.slice('CREATED_ROOT='.length).trim()
      continue
    }
    if (line.startsWith('CREATED_DIR=')) {
      const value = line.slice('CREATED_DIR='.length).trim()
      if (value) {
        result.createdDirectories.push(value)
      }
      continue
    }
    if (line.startsWith('CREATED_FILE=')) {
      const value = line.slice('CREATED_FILE='.length).trim()
      if (value) {
        result.createdFiles.push(value)
      }
    }
  }

  return result
}
