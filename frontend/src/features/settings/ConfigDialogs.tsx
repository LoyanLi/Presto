import { ChangeEvent, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { useI18n } from '../../i18n'
import { AiNamingConfig, CategoryTemplate } from '../../types/import'

export function slotToHex(slot: number): string {
  const hueDegrees = [
    242, 252, 262, 272, 284, 298, 314, 332, 0, 10, 22, 40, 58, 76, 94, 108, 120, 136, 152, 168, 186, 202,
    218, 232,
  ]
  const rowLightness = [0.54, 0.37, 0.23]
  const rowSaturation = [0.72, 0.69, 0.66]
  const normalized = Math.max(1, Math.min(72, slot))
  const index = normalized - 1
  const row = Math.floor(index / 24)
  const col = index % 24

  const h = (hueDegrees[col] % 360) / 360
  const s = rowSaturation[row]
  const l = rowLightness[row]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  const hue2rgb = (p0: number, q0: number, t0: number): number => {
    let t = t0
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p0 + (q0 - p0) * 6 * t
    if (t < 1 / 2) return q0
    if (t < 2 / 3) return p0 + (q0 - p0) * (2 / 3 - t) * 6
    return p0
  }

  const r = hue2rgb(p, q, h + 1 / 3)
  const g = hue2rgb(p, q, h)
  const b = hue2rgb(p, q, h - 1 / 3)

  const toHex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function clampSlot(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 1
  }
  return Math.max(1, Math.min(72, Math.round(parsed)))
}

function buildUniqueId(baseId: string, existing: Set<string>): string {
  const sanitized = baseId.trim() || 'category'
  if (!existing.has(sanitized)) {
    existing.add(sanitized)
    return sanitized
  }
  let index = 2
  while (true) {
    const candidate = `${sanitized}_${index}`
    if (!existing.has(candidate)) {
      existing.add(candidate)
      return candidate
    }
    index += 1
  }
}

function normalizeImportedCategories(raw: unknown): CategoryTemplate[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { categories?: unknown[] }).categories)
      ? (raw as { categories: unknown[] }).categories
      : null

  if (!rows) {
    throw new Error('Import file must be an array or an object with `categories` array.')
  }

  const usedIds = new Set<string>()
  const normalized: CategoryTemplate[] = []

  rows.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return
    }
    const row = item as Partial<CategoryTemplate>
    const rawId = String(row.id ?? '').trim()
    const rawName = String(row.name ?? '').trim()
    if (!rawName) {
      return
    }
    const id = buildUniqueId(rawId || `category_${index + 1}`, usedIds)
    const slot = clampSlot(row.pt_color_slot)
    normalized.push({
      id,
      name: rawName,
      pt_color_slot: slot,
      preview_hex: slotToHex(slot),
    })
  })

  if (normalized.length === 0) {
    throw new Error('No valid categories found in import file.')
  }
  return normalized
}

export function AiSettingsDialog(props: {
  current: AiNamingConfig
  hasKey: boolean
  apiKeyInput: string
  onApiKeyInput: (value: string) => void
  onCancel: () => void
  onSave: (config: AiNamingConfig) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<AiNamingConfig>(props.current)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg w-[560px] p-6 space-y-4">
        <h3 className="text-lg font-semibold">{t('dialog.ai.title')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">{t('dialog.ai.enabled')}</span>
            <select
              value={draft.enabled ? 'true' : 'false'}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.value === 'true' })}
              className="w-full px-2 py-1 border border-gray-300 rounded-md"
            >
              <option value="true">{t('dialog.ai.on')}</option>
              <option value="false">{t('dialog.ai.off')}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">{t('dialog.ai.timeout')}</span>
            <input
              type="number"
              min={1}
              value={draft.timeout_seconds}
              onChange={(event) => setDraft({ ...draft, timeout_seconds: Math.max(1, Number(event.target.value || 1)) })}
              className="w-full px-2 py-1 border border-gray-300 rounded-md"
            />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-gray-600 mb-1">{t('dialog.ai.baseUrl')}</span>
            <input
              value={draft.base_url}
              onChange={(event) => setDraft({ ...draft, base_url: event.target.value })}
              className="w-full px-2 py-1 border border-gray-300 rounded-md"
            />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-gray-600 mb-1">{t('dialog.ai.model')}</span>
            <input
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              className="w-full px-2 py-1 border border-gray-300 rounded-md"
            />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-gray-600 mb-1">
              {props.hasKey ? t('dialog.ai.apiKeyStored') : t('dialog.ai.apiKeyMissing')}
            </span>
            <input
              value={props.apiKeyInput}
              type="password"
              onChange={(event) => props.onApiKeyInput(event.target.value)}
              placeholder={t('dialog.ai.apiKeyPlaceholder')}
              className="w-full px-2 py-1 border border-gray-300 rounded-md"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={props.onCancel} className="px-3 py-2 bg-gray-200 rounded-md">
            {t('dialog.common.cancel')}
          </button>
          <button onClick={() => props.onSave(draft)} className="px-3 py-2 bg-blue-600 text-white rounded-md">
            {t('dialog.common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CategoryEditorDialog(props: {
  categories: CategoryTemplate[]
  onCancel: () => void
  onSave: (categories: CategoryTemplate[]) => void
}) {
  const { t } = useI18n()
  const [rows, setRows] = useState<CategoryTemplate[]>(props.categories)
  const [ioMessage, setIoMessage] = useState<string | null>(null)
  const [ioError, setIoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const updateRowAt = (index: number, patch: Partial<CategoryTemplate>): void => {
    setRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const nextSlot = patch.pt_color_slot ?? row.pt_color_slot
        return {
          ...row,
          ...patch,
          pt_color_slot: nextSlot,
          preview_hex: slotToHex(nextSlot),
        }
      }),
    )
  }

  const addRow = (): void => {
    const index = rows.length + 1
    const slot = Math.min(72, index)
    setRows((prev) => [
      ...prev,
      {
        id: `cat_${index}`,
        name: `Category ${index}`,
        pt_color_slot: slot,
        preview_hex: slotToHex(slot),
      },
    ])
  }

  const moveRow = (index: number, direction: -1 | 1): void => {
    setRows((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) {
        return prev
      }
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const exportCategories = (): void => {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        pt_color_slot: clampSlot(row.pt_color_slot),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 10)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `presto-categories-${stamp}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    setIoError(null)
    setIoMessage(t('dialog.category.exported', { count: rows.length }))
  }

  const triggerImport = (): void => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const imported = normalizeImportedCategories(parsed)
      setRows(imported)
      setIoError(null)
      setIoMessage(t('dialog.category.imported', { count: imported.length, file: file.name }))
    } catch (error) {
      setIoMessage(null)
      setIoError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg w-[760px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('dialog.category.title')}</h3>
          <div className="flex items-center gap-2">
            <button onClick={triggerImport} className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-100">
              {t('dialog.category.importJson')}
            </button>
            <button onClick={exportCategories} className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-100">
              {t('dialog.category.exportJson')}
            </button>
            <button onClick={addRow} className="px-3 py-2 bg-blue-600 text-white rounded-md">
              {t('dialog.category.add')}
            </button>
          </div>
        </div>
        {ioMessage ? <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-2">{ioMessage}</div> : null}
        {ioError ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">{ioError}</div> : null}
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void handleImportFile(event)} />
        <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left">{t('dialog.category.order')}</th>
                <th className="px-3 py-2 text-left">{t('dialog.category.id')}</th>
                <th className="px-3 py-2 text-left">{t('dialog.category.name')}</th>
                <th className="px-3 py-2 text-left">{t('dialog.category.colorSlot')}</th>
                <th className="px-3 py-2 text-left">{t('dialog.category.preview')}</th>
                <th className="px-3 py-2 text-left">{t('dialog.category.move')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.id}_${index}`} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.id}
                      onChange={(event) => updateRowAt(index, { id: event.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.name}
                      onChange={(event) => updateRowAt(index, { name: event.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={72}
                      value={row.pt_color_slot}
                      onChange={(event) => updateRowAt(index, { pt_color_slot: Number(event.target.value || 1) })}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-block w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: row.preview_hex }} />
                      <span>{row.preview_hex}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => moveRow(index, -1)}
                        disabled={index === 0}
                        title={t('dialog.category.moveUp')}
                        aria-label={t('dialog.category.moveUp')}
                        className="p-1.5 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveRow(index, 1)}
                        disabled={index === rows.length - 1}
                        title={t('dialog.category.moveDown')}
                        aria-label={t('dialog.category.moveDown')}
                        className="p-1.5 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={props.onCancel} className="px-3 py-2 bg-gray-200 rounded-md">
            {t('dialog.common.cancel')}
          </button>
          <button onClick={() => props.onSave(rows)} className="px-3 py-2 bg-blue-600 text-white rounded-md">
            {t('dialog.common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
