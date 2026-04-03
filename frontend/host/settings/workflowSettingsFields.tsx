import type { CSSProperties, ChangeEvent, MutableRefObject } from 'react'

import type { WorkflowSettingsFieldDefinition } from '@presto/contracts'
import { Select } from '../../ui'
import { hostShellColors } from '../hostShellColors'
import type { HostLocale } from '../i18n'
import { translateHost } from '../i18n'

interface CategoryListItem {
  id: string
  name: string
  colorSlot: number
  previewHex?: string
}

const fieldStackStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const labelStyle: CSSProperties = {
  color: hostShellColors.text,
  fontSize: 14,
  fontWeight: 600,
}

const descriptionStyle: CSSProperties = {
  margin: 0,
  color: hostShellColors.textMuted,
  fontSize: 13,
  lineHeight: 1.55,
}

const inputStyle: CSSProperties = {
  minHeight: 44,
  width: '100%',
  padding: '0 14px',
  borderRadius: 14,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surface,
  color: hostShellColors.text,
  fontSize: 14,
  fontWeight: 500,
  boxSizing: 'border-box',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 120,
  padding: '12px 14px',
  resize: 'vertical',
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 999,
  border: `1px solid ${hostShellColors.border}`,
  background: hostShellColors.surface,
  color: hostShellColors.text,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const iconButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  minWidth: 36,
  padding: 0,
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function computePreviewHex(slot: number): string {
  const normalized = Math.max(1, Math.min(72, Math.round(slot)))
  const hue = ((normalized - 1) % 12) * 30
  const band = Math.floor((normalized - 1) / 12)
  const saturation = Math.max(38, 72 - band * 5)
  const lightness = Math.max(34, 62 - band * 4)
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`
}

function normalizeCategoryList(value: unknown): CategoryListItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item, index) => {
    const row = isRecord(item) ? item : {}
    const colorSlot = Number.isFinite(Number(row.colorSlot)) ? Math.max(1, Math.min(72, Math.round(Number(row.colorSlot)))) : index + 1
    return {
      id: typeof row.id === 'string' ? row.id : `category_${index + 1}`,
      name: typeof row.name === 'string' ? row.name : `Category ${index + 1}`,
      colorSlot,
      previewHex: typeof row.previewHex === 'string' ? row.previewHex : computePreviewHex(colorSlot),
    }
  })
}

export function getValueAtPath(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined
    }
    return current[segment]
  }, root)
}

export function setValueAtPath(root: Record<string, unknown>, path: string, nextValue: unknown): Record<string, unknown> {
  const cloned = cloneValue(root)
  const segments = path.split('.')
  let cursor: Record<string, unknown> = cloned

  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = nextValue
      return
    }

    const nextCursor = cursor[segment]
    if (!isRecord(nextCursor)) {
      cursor[segment] = {}
    } else {
      cursor[segment] = cloneValue(nextCursor)
    }
    cursor = cursor[segment] as Record<string, unknown>
  })

  return cloned
}

function updateCategoryField(
  value: unknown,
  onChange: (path: string, nextValue: unknown) => void,
  fieldPath: string,
  index: number,
  patch: Partial<CategoryListItem>,
) {
  const list = normalizeCategoryList(value)
  const current = list[index]
  if (!current) {
    return
  }

  const nextColorSlot =
    patch.colorSlot !== undefined ? Math.max(1, Math.min(72, Math.round(patch.colorSlot))) : current.colorSlot
  list[index] = {
    ...current,
    ...patch,
    colorSlot: nextColorSlot,
    previewHex: patch.previewHex ?? computePreviewHex(nextColorSlot),
  }
  onChange(fieldPath, list)
}

function moveCategoryItem(
  value: unknown,
  onChange: (path: string, nextValue: unknown) => void,
  fieldPath: string,
  index: number,
  direction: -1 | 1,
) {
  const list = normalizeCategoryList(value)
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= list.length) {
    return
  }
  const [moved] = list.splice(index, 1)
  list.splice(nextIndex, 0, moved)
  onChange(fieldPath, list)
}

function downloadCategoryList(value: unknown) {
  if (typeof document === 'undefined') {
    return
  }

  const payload = JSON.stringify(normalizeCategoryList(value), null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `workflow-categories-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function importCategoryList(
  event: ChangeEvent<HTMLInputElement>,
  onChange: (path: string, nextValue: unknown) => void,
  fieldPath: string,
) {
  const file = event.target.files?.[0]
  if (!file) {
    return
  }

  void file.text().then((raw) => {
    const parsed = JSON.parse(raw)
    onChange(fieldPath, normalizeCategoryList(Array.isArray(parsed) ? parsed : parsed?.categories))
    event.target.value = ''
  })
}

function CategoryListField({
  field,
  locale,
  value,
  onChange,
  importInputRef,
}: {
  field: Extract<WorkflowSettingsFieldDefinition, { kind: 'categoryList' }>
  locale: HostLocale
  value: unknown
  onChange(path: string, nextValue: unknown): void
  importInputRef: MutableRefObject<HTMLInputElement | null>
}) {
  const list = normalizeCategoryList(value)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={labelStyle}>{field.label}</span>
          {field.description ? <p style={descriptionStyle}>{field.description}</p> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={secondaryButtonStyle} onClick={() => importInputRef.current?.click()}>
            {translateHost(locale, 'settings.workflow.categoryList.import')}
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => downloadCategoryList(value)}>
            {translateHost(locale, 'settings.workflow.categoryList.export')}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() =>
              onChange(field.path, [
                ...list,
                {
                  id: `category_${list.length + 1}`,
                  name: `Category ${list.length + 1}`,
                  colorSlot: Math.max(1, Math.min(72, list.length + 1)),
                  previewHex: computePreviewHex(list.length + 1),
                },
              ])
            }
          >
            {translateHost(locale, 'settings.workflow.categoryList.add')}
          </button>
        </div>
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(event) => importCategoryList(event, onChange, field.path)}
      />
      <div style={{ display: 'grid', gap: 10 }}>
        {list.map((item, index) => (
          <div
            key={`${item.id}:${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 112px 44px auto',
              gap: 10,
              alignItems: 'center',
              padding: 14,
              borderRadius: 18,
              border: `1px solid ${hostShellColors.border}`,
              background: hostShellColors.surface,
              minWidth: 0,
            }}
          >
            <input
              aria-label={`${field.label} id ${index + 1}`}
              value={item.id}
              onChange={(event) => updateCategoryField(value, onChange, field.path, index, { id: event.target.value })}
              style={inputStyle}
            />
            <input
              aria-label={`${field.label} name ${index + 1}`}
              value={item.name}
              onChange={(event) => updateCategoryField(value, onChange, field.path, index, { name: event.target.value })}
              style={inputStyle}
            />
            <input
              aria-label={`${field.label} color slot ${index + 1}`}
              type="number"
              min={1}
              max={72}
              step={1}
              value={item.colorSlot}
              onChange={(event) =>
                updateCategoryField(value, onChange, field.path, index, {
                  colorSlot: Number(event.target.value || 1),
                })
              }
              style={inputStyle}
            />
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: `1px solid ${hostShellColors.border}`,
                background: item.previewHex ?? computePreviewHex(item.colorSlot),
                justifySelf: 'center',
              }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={iconButtonStyle}
                onClick={() => moveCategoryItem(value, onChange, field.path, index, -1)}
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                type="button"
                style={iconButtonStyle}
                onClick={() => moveCategoryItem(value, onChange, field.path, index, 1)}
                disabled={index >= list.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                style={iconButtonStyle}
                onClick={() => onChange(field.path, list.filter((_, itemIndex) => itemIndex !== index))}
                disabled={list.length <= 1}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkflowSettingsFieldList({
  locale,
  fields,
  value,
  onChange,
  importInputRef,
}: {
  locale: HostLocale
  fields: readonly WorkflowSettingsFieldDefinition[]
  value: Record<string, unknown>
  onChange(path: string, nextValue: unknown): void
  importInputRef: MutableRefObject<HTMLInputElement | null>
}) {
  return (
    <>
      {fields.map((field) => {
        const fieldValue = getValueAtPath(value, field.path)

        if (field.kind === 'categoryList') {
          return (
            <CategoryListField
              key={field.fieldId}
              field={field}
              locale={locale}
              value={fieldValue}
              onChange={onChange}
              importInputRef={importInputRef}
            />
          )
        }

        if (field.kind === 'toggle') {
          const checked = field.checkedValue !== undefined ? fieldValue === field.checkedValue : Boolean(fieldValue)
          return (
            <label key={field.fieldId} style={{ ...fieldStackStyle, gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    field.path,
                    event.target.checked
                      ? field.checkedValue ?? true
                      : field.uncheckedValue ?? false,
                  )
                }
                style={{ width: 18, height: 18, margin: 0 }}
              />
              <span style={{ display: 'grid', gap: 4 }}>
                <span style={labelStyle}>{field.label}</span>
                {field.description ? <span style={descriptionStyle}>{field.description}</span> : null}
              </span>
            </label>
          )
        }

        if (field.kind === 'select') {
          return (
            <label key={field.fieldId} style={fieldStackStyle}>
              <span style={labelStyle}>{field.label}</span>
              {field.description ? <span style={descriptionStyle}>{field.description}</span> : null}
              <Select
                aria-label={field.label}
                value={typeof fieldValue === 'string' ? fieldValue : field.options[0]?.value ?? ''}
                onChange={(event) => onChange(field.path, event.target.value)}
                options={field.options}
              />
            </label>
          )
        }

        if (field.kind === 'textarea') {
          return (
            <label key={field.fieldId} style={fieldStackStyle}>
              <span style={labelStyle}>{field.label}</span>
              {field.description ? <span style={descriptionStyle}>{field.description}</span> : null}
              <textarea
                aria-label={field.label}
                value={typeof fieldValue === 'string' ? fieldValue : ''}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.path, event.target.value)}
                style={textareaStyle}
              />
            </label>
          )
        }

        if (field.kind === 'number') {
          return (
            <label key={field.fieldId} style={fieldStackStyle}>
              <span style={labelStyle}>{field.label}</span>
              {field.description ? <span style={descriptionStyle}>{field.description}</span> : null}
              <input
                aria-label={field.label}
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={typeof fieldValue === 'number' ? fieldValue : Number(fieldValue ?? field.min ?? 0)}
                onChange={(event) => onChange(field.path, Number(event.target.value || 0))}
                style={inputStyle}
              />
            </label>
          )
        }

        return (
          <label key={field.fieldId} style={fieldStackStyle}>
            <span style={labelStyle}>{field.label}</span>
            {field.description ? <span style={descriptionStyle}>{field.description}</span> : null}
            <input
              aria-label={field.label}
              type={field.kind === 'password' ? 'password' : 'text'}
              value={typeof fieldValue === 'string' ? fieldValue : ''}
              placeholder={field.placeholder}
              onChange={(event) => onChange(field.path, event.target.value)}
              style={inputStyle}
            />
          </label>
        )
      })}
    </>
  )
}
