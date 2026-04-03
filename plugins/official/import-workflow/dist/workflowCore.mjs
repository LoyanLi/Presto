const AUDIO_EXT_REGEX = /\.(wav|aif|aiff|flac|mp3|m4a|ogg)$/i
const IMPORT_WORKFLOW_SETTINGS_KEY = 'settings.v1'
export const AI_SYSTEM_PROMPT =
  'You normalize audio track names. Return strict JSON only. You must choose one best category_id from the provided categories for each item. Classify from filename semantics only; do not blindly keep defaults. Do not invent instrument meaning. Always output normalized_name in English; translate non-English words to concise natural English while preserving meaning. Use underscore style like Word_Word_Word. Remove noisy serial fragments. Use Title Case for each English token.'

const SLOT_HUES = [
  242, 252, 262, 272, 284, 298, 314, 332, 0, 10, 22, 40, 58, 76, 94, 108, 120, 136, 152, 168, 186, 202, 218, 232,
]
const SLOT_LIGHTNESS = [0.54, 0.37, 0.23]
const SLOT_SATURATION = [0.72, 0.69, 0.66]
const BGV_KEYWORDS = ['backup', 'backing', 'bgv', 'harmony', 'harm', 'double', 'doubler', 'adlib', 'choir', '和声', '叠唱']
const LEAD_KEYWORDS = ['vocal', 'vox', 'lead', '主唱', '主vocal', '主_vox']

function clampInteger(value, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value))
}

export function slotToHex(slot) {
  const normalized = clampInteger(slot, 1, 72)
  const index = normalized - 1
  const row = Math.floor(index / 24)
  const col = index % 24
  const h = (SLOT_HUES[col] % 360) / 360
  const s = SLOT_SATURATION[row]
  const l = SLOT_LIGHTNESS[row]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  const hue2rgb = (p0, q0, t0) => {
    let t = t0
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p0 + (q0 - p0) * 6 * t
    if (t < 1 / 2) return q0
    if (t < 2 / 3) return p0 + (q0 - p0) * (2 / 3 - t) * 6
    return p0
  }

  const toHex = (channel) => Math.round(channel * 255).toString(16).padStart(2, '0')
  const r = hue2rgb(p, q, h + 1 / 3)
  const g = hue2rgb(p, q, h)
  const b = hue2rgb(p, q, h - 1 / 3)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function createDefaultImportWorkflowSettings() {
  return {
    categories: [
      { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: slotToHex(3) },
      { id: 'bass', name: 'Bass', colorSlot: 9, previewHex: slotToHex(9) },
      { id: 'guitar', name: 'Guitar', colorSlot: 13, previewHex: slotToHex(13) },
      { id: 'keys', name: 'Keys', colorSlot: 18, previewHex: slotToHex(18) },
      { id: 'lead_vox', name: 'LeadVox', colorSlot: 23, previewHex: slotToHex(23) },
      { id: 'bgv', name: 'BGV', colorSlot: 28, previewHex: slotToHex(28) },
      { id: 'fx', name: 'FX', colorSlot: 33, previewHex: slotToHex(33) },
      { id: 'other', name: 'Other', colorSlot: 38, previewHex: slotToHex(38) },
    ],
    silenceProfile: {
      thresholdDb: -48,
      minStripMs: 120,
      minSilenceMs: 120,
      startPadMs: 5,
      endPadMs: 20,
    },
    aiConfig: {
      enabled: true,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      timeoutSeconds: 30,
      apiKey: '',
      prompt: AI_SYSTEM_PROMPT,
    },
    ui: {
      analyzeCacheEnabled: true,
      stripAfterImport: true,
      autoSaveSession: true,
    },
  }
}

function normalizeCategory(category, index, usedIds) {
  const fallbackId = `category_${index + 1}`
  const rawId = String(category?.id ?? '').trim() || fallbackId
  let nextId = rawId
  let suffix = 2
  while (usedIds.has(nextId)) {
    nextId = `${rawId}_${suffix}`
    suffix += 1
  }
  usedIds.add(nextId)
  const colorSlot = clampInteger(category?.colorSlot, 1, 72)
  const previewHex = typeof category?.previewHex === 'string' && category.previewHex.startsWith('#')
    ? category.previewHex.toUpperCase()
    : slotToHex(colorSlot)
  return {
    id: nextId,
    name: String(category?.name ?? '').trim() || `Category ${index + 1}`,
    colorSlot,
    previewHex,
  }
}

export function mergeImportWorkflowSettings(raw) {
  const defaults = createDefaultImportWorkflowSettings()
  const categoriesInput = ensureArray(raw?.categories)
  const usedIds = new Set()
  const categories = (categoriesInput.length > 0 ? categoriesInput : defaults.categories).map((category, index) =>
    normalizeCategory(category, index, usedIds),
  )
  return {
    categories,
    silenceProfile: {
      thresholdDb: Number(raw?.silenceProfile?.thresholdDb ?? defaults.silenceProfile.thresholdDb),
      minStripMs: clampInteger(raw?.silenceProfile?.minStripMs ?? defaults.silenceProfile.minStripMs, 1, 5000),
      minSilenceMs: clampInteger(raw?.silenceProfile?.minSilenceMs ?? defaults.silenceProfile.minSilenceMs, 1, 5000),
      startPadMs: clampInteger(raw?.silenceProfile?.startPadMs ?? defaults.silenceProfile.startPadMs, 0, 5000),
      endPadMs: clampInteger(raw?.silenceProfile?.endPadMs ?? defaults.silenceProfile.endPadMs, 0, 5000),
    },
    aiConfig: {
      enabled: raw?.aiConfig?.enabled !== undefined ? Boolean(raw.aiConfig.enabled) : defaults.aiConfig.enabled,
      baseUrl: String(raw?.aiConfig?.baseUrl ?? defaults.aiConfig.baseUrl).trim() || defaults.aiConfig.baseUrl,
      model: String(raw?.aiConfig?.model ?? defaults.aiConfig.model).trim() || defaults.aiConfig.model,
      timeoutSeconds: clampInteger(raw?.aiConfig?.timeoutSeconds ?? defaults.aiConfig.timeoutSeconds, 1, 600),
      apiKey: typeof raw?.aiConfig?.apiKey === 'string' ? raw.aiConfig.apiKey : defaults.aiConfig.apiKey,
      prompt: String(raw?.aiConfig?.prompt ?? defaults.aiConfig.prompt).trim() || defaults.aiConfig.prompt,
    },
    ui: {
      analyzeCacheEnabled:
        raw?.ui?.analyzeCacheEnabled !== undefined
          ? Boolean(raw.ui.analyzeCacheEnabled)
          : defaults.ui.analyzeCacheEnabled,
      stripAfterImport:
        raw?.ui?.stripAfterImport !== undefined
          ? Boolean(raw.ui.stripAfterImport)
          : defaults.ui.stripAfterImport,
      autoSaveSession:
        raw?.ui?.autoSaveSession !== undefined
          ? Boolean(raw.ui.autoSaveSession)
          : defaults.ui.autoSaveSession,
    },
  }
}

export async function loadImportWorkflowSettings(storage) {
  const stored = storage && typeof storage.get === 'function'
    ? await storage.get(IMPORT_WORKFLOW_SETTINGS_KEY)
    : null
  return mergeImportWorkflowSettings(stored)
}

export async function saveImportWorkflowSettings(storage, settings) {
  const normalized = mergeImportWorkflowSettings(settings)
  if (storage && typeof storage.set === 'function') {
    await storage.set(IMPORT_WORKFLOW_SETTINGS_KEY, normalized)
  }
  return normalized
}

export function basenameOf(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

export function dirnameOf(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

export function stemOf(filePath) {
  return basenameOf(filePath).replace(AUDIO_EXT_REGEX, '')
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isAudioFile(filePath) {
  return AUDIO_EXT_REGEX.test(String(filePath ?? ''))
}

function dedupePaths(filePaths) {
  const seen = new Set()
  const ordered = []
  for (const pathValue of ensureArray(filePaths)) {
    const normalized = String(pathValue ?? '').trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

function sanitizeTrackComponent(value) {
  const cleaned = String(value ?? '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\r?\n/g, ' ')
    .trim()
  return cleaned || 'Untitled'
}

export function normalizeTrackName(value) {
  let cleaned = sanitizeTrackComponent(value)
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
  cleaned = cleaned.replace(/[\s-]+/g, '_')
  cleaned = cleaned.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!cleaned) {
    return 'Untitled'
  }

  const filteredParts = cleaned
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^\d{3,}$/.test(part))

  const titledParts = (filteredParts.length > 0 ? filteredParts : [cleaned]).map((part) =>
    part.replace(/[A-Za-z]+/g, (token) => token.toLowerCase().replace(/^./, (char) => char.toUpperCase())),
  )
  return titledParts.join('_') || 'Untitled'
}

export function toDisplayName(stem) {
  return normalizeTrackName(stem).replace(/_/g, ' ')
}

function normalizeCategoryToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

export function inferCategoryId(filePath, categories = [], sourceFolders = []) {
  const normalizedCategories = categories.map((category) => ({
    id: category.id,
    tokens: [normalizeCategoryToken(category.id), normalizeCategoryToken(category.name)],
  }))
  const fileSegments = normalizePath(filePath)
    .split('/')
    .slice(-4, -1)
    .map((segment) => normalizeCategoryToken(segment))
    .filter(Boolean)
  const sourceSegments = sourceFolders
    .map((folder) => normalizeCategoryToken(basenameOf(folder)))
    .filter(Boolean)
  const candidates = [...fileSegments.reverse(), ...sourceSegments]
  for (const candidate of candidates) {
    const match = normalizedCategories.find((category) => category.tokens.includes(candidate))
    if (match) {
      return match.id
    }
  }
  return categories[0]?.id || 'other'
}

export function analyzeFilePaths(filePaths, categories = [], sourceFolders = []) {
  const orderedPaths = dedupePaths(filePaths).filter(isAudioFile)
  return orderedPaths.map((filePath) => {
    const displayName = toDisplayName(stemOf(filePath))
    return {
      filePath,
      categoryId: inferCategoryId(filePath, categories, sourceFolders),
      aiName: displayName,
      finalName: displayName,
      status: 'ready',
      errorMessage: null,
    }
  })
}

export function allocateUniqueTrackName(baseName, existingNames) {
  const safeBase = String(baseName ?? '').trim() || 'Untitled'
  if (!existingNames.has(safeBase)) {
    return safeBase
  }
  let index = 2
  while (true) {
    const candidate = `${safeBase}_${index}`
    if (!existingNames.has(candidate)) {
      return candidate
    }
    index += 1
  }
}

export function buildRunValidation(proposals) {
  const issues = []
  const finalNameCounts = new Map()
  for (const proposal of ensureArray(proposals)) {
    if (proposal?.status !== 'ready') {
      continue
    }
    const finalName = String(proposal.finalName ?? '').trim()
    if (!finalName) {
      issues.push(`empty_final_name:${proposal.filePath}`)
      continue
    }
    const key = finalName.toLowerCase()
    finalNameCounts.set(key, (finalNameCounts.get(key) ?? 0) + 1)
  }

  for (const [key, count] of finalNameCounts.entries()) {
    if (count > 1) {
      issues.push(`duplicate_final_name:${key}`)
    }
  }
  return issues
}

export function createCategoryColorSlotMap(categories) {
  const map = {}
  for (const category of ensureArray(categories)) {
    if (category && typeof category.id === 'string' && Number.isInteger(category.colorSlot)) {
      map[category.id] = category.colorSlot
    }
  }
  return map
}

export function finalizeRowsForImport({ rows, categories = [], existingTrackNames = [] }) {
  const orderedReadyRows = ensureArray(rows).filter((row) => row?.status === 'ready')
  const usedNames = new Set(ensureArray(existingTrackNames).map((name) => String(name ?? '').trim()).filter(Boolean))
  const replacements = new Map()
  const executionRows = orderedReadyRows.map((row) => {
    const normalizedName = normalizeTrackName(row.finalName || row.aiName || stemOf(row.filePath))
    const uniqueName = allocateUniqueTrackName(normalizedName, usedNames)
    usedNames.add(uniqueName)
    const updated = {
      ...row,
      aiName: row.aiName || toDisplayName(stemOf(row.filePath)),
      finalName: uniqueName,
      errorMessage: null,
      status: 'ready',
    }
    replacements.set(row.filePath, updated)
    return updated
  })

  return {
    rows: ensureArray(rows).map((row) => replacements.get(row.filePath) ?? row),
    executionRows,
  }
}

export function planPostImportActions({
  proposals,
  importedTrackNames,
  categoryColorSlotById,
  stripAfterImport,
}) {
  const readyProposals = ensureArray(proposals).filter((proposal) => proposal?.status === 'ready')
  const renameActions = []
  const colorActions = []
  const stripActions = []

  readyProposals.forEach((proposal, index) => {
    const targetName = String(proposal.finalName ?? '').trim()
    if (!targetName) {
      return
    }
    const importedName = String(importedTrackNames?.[index] ?? '').trim()
    if (importedName && importedName !== targetName) {
      renameActions.push({
        currentName: importedName,
        newName: targetName,
      })
    }
    const colorSlot = categoryColorSlotById?.[proposal.categoryId]
    if (Number.isInteger(colorSlot)) {
      colorActions.push({
        trackName: targetName,
        colorSlot,
      })
    }
    if (stripAfterImport) {
      stripActions.push({ trackName: targetName })
    }
  })

  return {
    renameActions,
    colorActions,
    stripActions,
  }
}

function applyFinalNamePatch(row, patch) {
  const mode = String(patch?.finalNameMode ?? '').trim()
  const value = String(patch?.finalNameValue ?? '')
  if (!mode) {
    return row
  }
  if (mode === 'resetAi') {
    return { ...row, finalName: row.aiName || row.finalName }
  }
  if (mode === 'prefix') {
    return { ...row, finalName: `${value}${row.finalName}` }
  }
  if (mode === 'suffix') {
    return { ...row, finalName: `${row.finalName}${value}` }
  }
  if (mode === 'replace' || mode === 'set') {
    return { ...row, finalName: value }
  }
  return row
}

export function applyPatchToSelectedRows({ rows, selectedPaths, patch }) {
  const selected = selectedPaths instanceof Set ? selectedPaths : new Set(selectedPaths)
  return ensureArray(rows).map((row) => {
    if (!selected.has(row.filePath)) {
      return row
    }
    let next = { ...row }
    if (patch?.categoryId) {
      next.categoryId = patch.categoryId
    }
    next = applyFinalNamePatch(next, patch)
    if (patch?.status) {
      next.status = patch.status
    }
    return next
  })
}

export function categoryEditorReducer(rows, action) {
  const currentRows = ensureArray(rows).map((row) => ({ ...row }))
  if (!action || typeof action.type !== 'string') {
    return currentRows
  }

  if (action.type === 'add') {
    let suffix = Date.now()
    const existingIds = new Set(currentRows.map((row) => row.id))
    while (existingIds.has(`category_${suffix}`)) {
      suffix += 1
    }
    const colorSlot = clampInteger(currentRows.length + 1, 1, 72)
    return [
      ...currentRows,
      {
        id: `category_${suffix}`,
        name: `Category ${currentRows.length + 1}`,
        colorSlot,
        previewHex: slotToHex(colorSlot),
      },
    ]
  }

  if (action.type === 'update') {
    return currentRows.map((row) => {
      if (row.id !== action.id) {
        return row
      }
      const nextColorSlot =
        action.patch && action.patch.colorSlot !== undefined
          ? clampInteger(action.patch.colorSlot, 1, 72)
          : row.colorSlot
      return {
        ...row,
        ...(action.patch ?? {}),
        colorSlot: nextColorSlot,
        previewHex: slotToHex(nextColorSlot),
      }
    })
  }

  if (action.type === 'remove') {
    return currentRows.filter((row) => row.id !== action.id)
  }

  if (action.type === 'move') {
    const currentIndex = currentRows.findIndex((row) => row.id === action.id)
    if (currentIndex < 0) {
      return currentRows
    }
    const offset = action.direction === 'up' ? -1 : 1
    const targetIndex = currentIndex + offset
    if (targetIndex < 0 || targetIndex >= currentRows.length) {
      return currentRows
    }
    const nextRows = [...currentRows]
    const [moved] = nextRows.splice(currentIndex, 1)
    nextRows.splice(targetIndex, 0, moved)
    return nextRows
  }

  return currentRows
}

function extractMessageContent(payload) {
  const choices = ensureArray(payload?.choices)
  const first = choices[0]
  const message = first && typeof first === 'object' ? first.message : null
  const content = message && typeof message === 'object' ? message.content : null
  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }
  if (Array.isArray(content)) {
    const text = content
      .map((block) => (block && typeof block === 'object' && block.type === 'text' ? String(block.text ?? '').trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (text) {
      return text
    }
  }
  throw new Error('AI response message content missing.')
}

function extractStructuredJsonText(content) {
  const trimmed = String(content ?? '').trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    return fenced[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  throw new Error('AI content is not valid JSON.')
}

export function parseAiResponseContent(raw, { expectedIds, allowedCategoryIds }) {
  let envelope
  try {
    envelope = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (error) {
    throw new Error(`AI API did not return JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const content = extractMessageContent(envelope)
  let structured
  try {
    structured = JSON.parse(extractStructuredJsonText(content))
  } catch (error) {
    throw new Error(`AI content is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const items = ensureArray(structured?.items)
  if (items.length === 0) {
    throw new Error("AI response missing 'items' array.")
  }

  const results = []
  const seenIds = new Set()
  for (const item of items) {
    const id = String(item?.id ?? '').trim()
    const normalizedName = String(item?.normalized_name ?? '').trim()
    const categoryId = String(item?.category_id ?? '').trim()
    if (!id || !normalizedName || !categoryId) {
      throw new Error('AI response item has empty id, normalized_name, or category_id.')
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate id in AI response: ${id}`)
    }
    if (allowedCategoryIds && !allowedCategoryIds.has(categoryId)) {
      throw new Error(`AI response category_id is not in available categories: ${categoryId}`)
    }
    seenIds.add(id)
    results.push({
      id,
      normalizedName,
      categoryId,
    })
  }

  if (expectedIds) {
    const expected = Array.from(expectedIds).sort()
    const actual = Array.from(seenIds).sort()
    if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
      throw new Error('AI response ids mismatch input ids.')
    }
  }

  return results
}

function buildChatCompletionsEndpoint(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

function detectVocalCategoryIds(categories) {
  let leadId = null
  let bgvId = null
  for (const category of ensureArray(categories)) {
    const probe = `${category.id} ${category.name}`.toLowerCase().replace(/\s+/g, '')
    if (
      bgvId === null &&
      ['bgv', 'backup', 'backing', 'harmony', 'double', 'choir', '和声', '叠唱'].some((keyword) => probe.includes(keyword))
    ) {
      bgvId = category.id
      continue
    }
    if (
      leadId === null &&
      ['leadvox', 'leadvocal', 'lead', 'vocal', 'vox', '主唱'].some((keyword) => probe.includes(keyword))
    ) {
      leadId = category.id
    }
  }
  return [leadId, bgvId]
}

function applyVocalCategoryOverride({
  proposedCategoryId,
  filePath,
  normalizedName,
  leadVoxCategoryId,
  bgvCategoryId,
}) {
  const text = `${stemOf(filePath)} ${normalizedName}`.toLowerCase()
  if (bgvCategoryId && BGV_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return bgvCategoryId
  }
  if (leadVoxCategoryId && LEAD_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return leadVoxCategoryId
  }
  return proposedCategoryId
}

function failedAiRows(rows, message) {
  return ensureArray(rows).map((row) => ({
    ...row,
    status: 'failed',
    errorMessage: message,
  }))
}

export async function runAiAnalyzeInPlugin({
  rows,
  categories,
  aiConfig,
  fetchImpl = globalThis.fetch,
}) {
  const normalizedConfig = mergeImportWorkflowSettings({ aiConfig, categories }).aiConfig
  const normalizedRows = ensureArray(rows).map((row) => ({
    ...row,
    aiName: row.aiName || toDisplayName(stemOf(row.filePath)),
    finalName: row.finalName || row.aiName || toDisplayName(stemOf(row.filePath)),
    status: row.status || 'ready',
    errorMessage: row.errorMessage ?? null,
  }))

  if (!normalizedConfig.enabled) {
    const offlineRows = normalizedRows.map((row) => ({
      ...row,
      aiName: toDisplayName(stemOf(row.filePath)),
      finalName: toDisplayName(stemOf(row.filePath)),
      status: 'ready',
      errorMessage: null,
    }))
    return {
      rows: offlineRows,
      errorMessage: null,
    }
  }

  if (typeof fetchImpl !== 'function') {
    const message = 'fetch is unavailable in plugin runtime.'
    return { rows: failedAiRows(normalizedRows, message), errorMessage: message }
  }

  if (!normalizedConfig.baseUrl || !normalizedConfig.model) {
    const message = 'AI base URL and model are required.'
    return { rows: failedAiRows(normalizedRows, message), errorMessage: message }
  }
  if (!normalizedConfig.apiKey) {
    const message = 'AI API key is missing.'
    return { rows: failedAiRows(normalizedRows, message), errorMessage: message }
  }
  if (ensureArray(categories).length === 0) {
    const message = 'No categories available for AI classification.'
    return { rows: failedAiRows(normalizedRows, message), errorMessage: message }
  }

  const inputs = normalizedRows.map((row, index) => ({
    id: String(index),
    original_stem: stemOf(row.filePath),
  }))
  const expectedIds = new Set(inputs.map((item) => item.id))
  const allowedCategoryIds = new Set(ensureArray(categories).map((category) => category.id))
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutMs = normalizedConfig.timeoutSeconds * 1000
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort()
      }, timeoutMs)
    : null

  try {
    const response = await fetchImpl(buildChatCompletionsEndpoint(normalizedConfig.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${normalizedConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: normalizedConfig.model,
        temperature: 0,
        messages: [
          { role: 'system', content: normalizedConfig.prompt || AI_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify(
              {
                categories: ensureArray(categories).map((category) => ({ id: category.id, name: category.name })),
                items: inputs,
                output_schema: {
                  items: [{ id: 'string', normalized_name: 'string', category_id: 'string' }],
                },
              },
              null,
              0,
            ),
          },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller ? controller.signal : undefined,
    })

    const rawText = await response.text()
    if (!response.ok) {
      throw new Error(`AI API HTTP ${response.status} error: ${rawText || response.statusText}`)
    }

    const parsed = parseAiResponseContent(rawText, { expectedIds, allowedCategoryIds })
    const byId = new Map(parsed.map((item) => [item.id, item]))
    const [leadVoxCategoryId, bgvCategoryId] = detectVocalCategoryIds(categories)
    const aiRows = normalizedRows.map((row, index) => {
      const item = byId.get(String(index))
      const normalizedName = normalizeTrackName(item?.normalizedName || stemOf(row.filePath))
      const nextCategoryId = applyVocalCategoryOverride({
        proposedCategoryId: item?.categoryId || row.categoryId,
        filePath: row.filePath,
        normalizedName,
        leadVoxCategoryId,
        bgvCategoryId,
      })
      return {
        ...row,
        categoryId: nextCategoryId,
        aiName: normalizedName,
        finalName: normalizedName,
        status: 'ready',
        errorMessage: null,
      }
    })

    const deduped = finalizeRowsForImport({
      rows: aiRows,
      categories,
      existingTrackNames: [],
    }).rows

    return {
      rows: deduped,
      errorMessage: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      rows: failedAiRows(normalizedRows, message),
      errorMessage: message,
    }
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

export function isTerminalJobState(state) {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled'
}

export function cloneImportWorkflowSettings(settings) {
  return cloneJsonValue(mergeImportWorkflowSettings(settings))
}
