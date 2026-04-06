import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_LOG_LIMIT = 500

function normalizeLevel(level) {
  return level === 'info' || level === 'warn' || level === 'error' ? level : 'info'
}

function normalizeDetails(details) {
  if (!details || typeof details !== 'object') {
    return null
  }

  try {
    return JSON.parse(JSON.stringify(details))
  } catch {
    return {
      value: String(details),
    }
  }
}

function removeRedundantDetailFields(message, details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return details ?? null
  }

  const filtered = Object.fromEntries(
    Object.entries(details).filter(([key, value]) => {
      if (value === null || value === undefined) {
        return false
      }
      if (typeof value !== 'string') {
        return true
      }
      if (key === 'message' && message.includes(value)) {
        return false
      }
      if (key === 'operation' && message.includes(value)) {
        return false
      }
      return true
    }),
  )

  return Object.keys(filtered).length > 0 ? filtered : null
}

function formatEntry(entry) {
  const header = `[${entry.timestamp}] [${entry.level}] [${entry.source}] ${entry.message}`
  const normalizedDetails = removeRedundantDetailFields(entry.message, entry.details)
  if (!normalizedDetails) {
    return header
  }

  return `${header}\n${JSON.stringify(normalizedDetails)}`
}

export function createAppLogStore({ exportDir, logDir, limit = DEFAULT_LOG_LIMIT } = {}) {
  let nextId = 1
  const entries = []
  const resolvedLogDir = path.resolve(logDir ?? exportDir ?? process.cwd())
  const sessionTimestamp = new Date().toISOString().replaceAll(':', '-')
  const currentLogPath = path.join(resolvedLogDir, `presto-${sessionTimestamp}.log`)

  const ensureCurrentLogFile = () => {
    mkdirSync(resolvedLogDir, { recursive: true })
    writeFileSync(currentLogPath, '', { flag: 'a' })
    return currentLogPath
  }

  const append = (entry) => {
    const normalized = {
      id: nextId,
      timestamp: new Date().toISOString(),
      source: String(entry?.source ?? 'electron.main'),
      level: normalizeLevel(entry?.level),
      message: String(entry?.message ?? ''),
      details: normalizeDetails(entry?.details),
    }
    nextId += 1
    entries.push(normalized)
    if (entries.length > limit) {
      entries.splice(0, entries.length - limit)
    }
    appendFileSync(ensureCurrentLogFile(), `${formatEntry(normalized)}\n\n`, 'utf8')
    return normalized
  }

  const list = (requestedLimit) => {
    const resolvedLimit =
      typeof requestedLimit === 'number' && Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.floor(requestedLimit)
        : entries.length
    return entries.slice(-resolvedLimit).reverse()
  }

  const exportLogs = async (overrideExportDir) => {
    const resolvedExportDir = overrideExportDir ?? exportDir ?? process.cwd()
    await mkdir(resolvedExportDir, { recursive: true })
    const timestamp = new Date().toISOString().replaceAll(':', '-')
    const filePath = path.join(resolvedExportDir, `presto-logs-${timestamp}.log`)
    const content = entries.map(formatEntry).join('\n\n')
    await writeFile(filePath, content, 'utf8')
    return {
      ok: true,
      filePath,
      count: entries.length,
    }
  }

  return {
    append,
    ensureCurrentLogFile,
    getCurrentLogPath: () => ensureCurrentLogFile(),
    list,
    exportLogs,
  }
}
