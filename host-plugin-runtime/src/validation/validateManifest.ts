import { access } from 'node:fs/promises'
import { join } from 'node:path'

import type { WorkflowPluginManifest } from '../../../packages/contracts/src'

export interface ManifestValidationIssue {
  field: string
  reason: string
}

export interface ManifestValidationResult {
  ok: boolean
  issues: ManifestValidationIssue[]
  manifest?: WorkflowPluginManifest
}

export interface ValidateManifestInput {
  manifest: unknown
  pluginRoot: string
  isHostApiVersionCompatible(hostApiVersion: string): boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'
const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const validatePage = (page: Record<string, unknown>, index: number): ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = []

  if (!isString(page.pageId)) {
    issues.push({ field: `pages[${index}].pageId`, reason: 'must_be_string' })
  }

  if (!isString(page.path)) {
    issues.push({ field: `pages[${index}].path`, reason: 'must_be_string' })
  }

  if (!isString(page.title)) {
    issues.push({ field: `pages[${index}].title`, reason: 'must_be_string' })
  }

  if (page.mount !== 'workspace') {
    issues.push({ field: `pages[${index}].mount`, reason: 'must_be_workspace' })
  }

  if (!isString(page.componentExport)) {
    issues.push({ field: `pages[${index}].componentExport`, reason: 'must_be_string' })
  }

  return issues
}

const validateAutomationItem = (item: Record<string, unknown>, index: number): ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = []

  if (!isString(item.itemId)) {
    issues.push({ field: `automationItems[${index}].itemId`, reason: 'must_be_string' })
  }

  if (!isString(item.title)) {
    issues.push({ field: `automationItems[${index}].title`, reason: 'must_be_string' })
  }

  if (!isString(item.automationType)) {
    issues.push({ field: `automationItems[${index}].automationType`, reason: 'must_be_string' })
  }

  if (item.description !== undefined && !isString(item.description)) {
    issues.push({ field: `automationItems[${index}].description`, reason: 'must_be_string_when_present' })
  }

  if (item.order !== undefined && typeof item.order !== 'number') {
    issues.push({ field: `automationItems[${index}].order`, reason: 'must_be_number_when_present' })
  }

  return issues
}

const validateAdapterModuleRequirement = (
  item: Record<string, unknown>,
  index: number,
): ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = []

  if (!isString(item.moduleId)) {
    issues.push({ field: `adapterModuleRequirements[${index}].moduleId`, reason: 'must_be_string' })
  }

  if (!isString(item.minVersion)) {
    issues.push({ field: `adapterModuleRequirements[${index}].minVersion`, reason: 'must_be_string' })
  }

  return issues
}

const validateCapabilityRequirement = (
  item: Record<string, unknown>,
  index: number,
): ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = []

  if (!isString(item.capabilityId)) {
    issues.push({ field: `capabilityRequirements[${index}].capabilityId`, reason: 'must_be_string' })
  }

  if (!isString(item.minVersion)) {
    issues.push({ field: `capabilityRequirements[${index}].minVersion`, reason: 'must_be_string' })
  }

  return issues
}

const validateSettingsField = (
  field: Record<string, unknown>,
  sectionIndex: number,
  fieldIndex: number,
  pageField: string,
): ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = []
  const fieldPath = `${pageField}.sections[${sectionIndex}].fields[${fieldIndex}]`

  if (!isString(field.fieldId)) {
    issues.push({ field: `${fieldPath}.fieldId`, reason: 'must_be_string' })
  }

  if (!isString(field.kind)) {
    issues.push({ field: `${fieldPath}.kind`, reason: 'must_be_string' })
  } else if (!['toggle', 'select', 'text', 'password', 'textarea', 'number', 'categoryList'].includes(field.kind)) {
    issues.push({ field: `${fieldPath}.kind`, reason: 'unsupported_field_kind' })
  }

  if (!isString(field.label)) {
    issues.push({ field: `${fieldPath}.label`, reason: 'must_be_string' })
  }

  if (!isString(field.path)) {
    issues.push({ field: `${fieldPath}.path`, reason: 'must_be_string' })
  }

  if (field.description !== undefined && !isString(field.description)) {
    issues.push({ field: `${fieldPath}.description`, reason: 'must_be_string_when_present' })
  }

  if (field.kind === 'select') {
    if (!Array.isArray(field.options)) {
      issues.push({ field: `${fieldPath}.options`, reason: 'must_be_array' })
    } else {
      field.options.forEach((option, optionIndex) => {
        if (!isRecord(option)) {
          issues.push({ field: `${fieldPath}.options[${optionIndex}]`, reason: 'must_be_object' })
          return
        }

        if (!isString(option.value)) {
          issues.push({ field: `${fieldPath}.options[${optionIndex}].value`, reason: 'must_be_string' })
        }

        if (!isString(option.label)) {
          issues.push({ field: `${fieldPath}.options[${optionIndex}].label`, reason: 'must_be_string' })
        }
      })
    }
  }

  if (field.kind === 'toggle') {
    if (field.checkedValue !== undefined && !isPrimitive(field.checkedValue)) {
      issues.push({ field: `${fieldPath}.checkedValue`, reason: 'must_be_primitive_when_present' })
    }
    if (field.uncheckedValue !== undefined && !isPrimitive(field.uncheckedValue)) {
      issues.push({ field: `${fieldPath}.uncheckedValue`, reason: 'must_be_primitive_when_present' })
    }
  }

  if (field.kind === 'number') {
    if (field.min !== undefined && typeof field.min !== 'number') {
      issues.push({ field: `${fieldPath}.min`, reason: 'must_be_number_when_present' })
    }
    if (field.max !== undefined && typeof field.max !== 'number') {
      issues.push({ field: `${fieldPath}.max`, reason: 'must_be_number_when_present' })
    }
    if (field.step !== undefined && typeof field.step !== 'number') {
      issues.push({ field: `${fieldPath}.step`, reason: 'must_be_number_when_present' })
    }
  }

  if ((field.kind === 'text' || field.kind === 'password' || field.kind === 'textarea') && field.placeholder !== undefined && !isString(field.placeholder)) {
    issues.push({ field: `${fieldPath}.placeholder`, reason: 'must_be_string_when_present' })
  }

  return issues
}

const validateSettingsPage = (page: Record<string, unknown>, index: number): ManifestValidationIssue[] => {
  const issues: ManifestValidationIssue[] = []
  const field = `settingsPages[${index}]`

  if (!isString(page.pageId)) {
    issues.push({ field: `${field}.pageId`, reason: 'must_be_string' })
  }

  if (!isString(page.title)) {
    issues.push({ field: `${field}.title`, reason: 'must_be_string' })
  }

  if (page.order !== undefined && typeof page.order !== 'number') {
    issues.push({ field: `${field}.order`, reason: 'must_be_number_when_present' })
  }

  if (!isString(page.storageKey)) {
    issues.push({ field: `${field}.storageKey`, reason: 'must_be_string' })
  }

  if (!isRecord(page.defaults)) {
    issues.push({ field: `${field}.defaults`, reason: 'must_be_object' })
  }

  if (!isString(page.loadExport)) {
    issues.push({ field: `${field}.loadExport`, reason: 'must_be_string' })
  }

  if (!isString(page.saveExport)) {
    issues.push({ field: `${field}.saveExport`, reason: 'must_be_string' })
  }

  if (!Array.isArray(page.sections)) {
    issues.push({ field: `${field}.sections`, reason: 'must_be_array' })
  } else {
    page.sections.forEach((section, sectionIndex) => {
      if (!isRecord(section)) {
        issues.push({ field: `${field}.sections[${sectionIndex}]`, reason: 'must_be_object' })
        return
      }

      if (!isString(section.sectionId)) {
        issues.push({ field: `${field}.sections[${sectionIndex}].sectionId`, reason: 'must_be_string' })
      }

      if (!isString(section.title)) {
        issues.push({ field: `${field}.sections[${sectionIndex}].title`, reason: 'must_be_string' })
      }

      if (section.description !== undefined && !isString(section.description)) {
        issues.push({ field: `${field}.sections[${sectionIndex}].description`, reason: 'must_be_string_when_present' })
      }

      if (!Array.isArray(section.fields)) {
        issues.push({ field: `${field}.sections[${sectionIndex}].fields`, reason: 'must_be_array' })
        return
      }

      section.fields.forEach((sectionField, fieldIndex) => {
        if (!isRecord(sectionField)) {
          issues.push({ field: `${field}.sections[${sectionIndex}].fields[${fieldIndex}]`, reason: 'must_be_object' })
          return
        }

        issues.push(...validateSettingsField(sectionField, sectionIndex, fieldIndex, field))
      })
    })
  }

  return issues
}

const validateUniqueIds = (items: readonly string[], field: string): ManifestValidationIssue[] => {
  const seen = new Set<string>()
  const issues: ManifestValidationIssue[] = []

  for (const item of items) {
    if (seen.has(item)) {
      issues.push({ field, reason: `duplicate_value:${item}` })
      continue
    }
    seen.add(item)
  }

  return issues
}

export async function validateManifest(input: ValidateManifestInput): Promise<ManifestValidationResult> {
  const issues: ManifestValidationIssue[] = []

  if (!isRecord(input.manifest)) {
    return {
      ok: false,
      issues: [{ field: 'manifest', reason: 'must_be_object' }],
    }
  }

  const manifest = input.manifest

  if (!isString(manifest.pluginId)) {
    issues.push({ field: 'pluginId', reason: 'must_be_string' })
  }

  if (!isString(manifest.extensionType) || !['workflow', 'automation'].includes(manifest.extensionType)) {
    issues.push({ field: 'extensionType', reason: 'must_be_workflow_or_automation' })
  }

  if (!isString(manifest.version)) {
    issues.push({ field: 'version', reason: 'must_be_string' })
  }

  if (!isString(manifest.hostApiVersion)) {
    issues.push({ field: 'hostApiVersion', reason: 'must_be_string' })
  } else if (!input.isHostApiVersionCompatible(manifest.hostApiVersion)) {
    issues.push({ field: 'hostApiVersion', reason: 'unsupported_host_api_version' })
  }

  if (!isString(manifest.uiRuntime) || manifest.uiRuntime !== 'react18') {
    issues.push({ field: 'uiRuntime', reason: 'must_be_react18' })
  }

  if (!isString(manifest.displayName)) {
    issues.push({ field: 'displayName', reason: 'must_be_string' })
  }

  if (!isString(manifest.entry)) {
    issues.push({ field: 'entry', reason: 'must_be_string' })
  }

  if (manifest.styleEntry !== undefined && !isString(manifest.styleEntry)) {
    issues.push({ field: 'styleEntry', reason: 'must_be_string_when_present' })
  }

  if (!Array.isArray(manifest.supportedDaws) || !isStringArray(manifest.supportedDaws)) {
    issues.push({ field: 'supportedDaws', reason: 'must_be_string_array' })
  } else if (manifest.supportedDaws.length === 0) {
    issues.push({ field: 'supportedDaws', reason: 'must_not_be_empty' })
  } else {
    issues.push(...validateUniqueIds(manifest.supportedDaws, 'supportedDaws'))
  }

  if (!Array.isArray(manifest.pages)) {
    issues.push({ field: 'pages', reason: 'must_be_array' })
  } else {
    const pages = manifest.pages as unknown[]

    pages.forEach((page, index) => {
      if (!isRecord(page)) {
        issues.push({ field: `pages[${index}]`, reason: 'must_be_object' })
        return
      }

      issues.push(...validatePage(page, index))
    })
  }

  if (manifest.automationItems !== undefined) {
    if (!Array.isArray(manifest.automationItems)) {
      issues.push({ field: 'automationItems', reason: 'must_be_array_when_present' })
    } else {
      const automationItems = manifest.automationItems as unknown[]
      automationItems.forEach((item, index) => {
        if (!isRecord(item)) {
          issues.push({ field: `automationItems[${index}]`, reason: 'must_be_object' })
          return
        }

        issues.push(...validateAutomationItem(item, index))
      })
    }
  }

  if (manifest.adapterModuleRequirements !== undefined) {
    if (!Array.isArray(manifest.adapterModuleRequirements)) {
      issues.push({ field: 'adapterModuleRequirements', reason: 'must_be_array_when_present' })
    } else {
      const requirements = manifest.adapterModuleRequirements as unknown[]
      requirements.forEach((item, index) => {
        if (!isRecord(item)) {
          issues.push({ field: `adapterModuleRequirements[${index}]`, reason: 'must_be_object' })
          return
        }
        issues.push(...validateAdapterModuleRequirement(item, index))
      })
    }
  }

  if (manifest.capabilityRequirements !== undefined) {
    if (!Array.isArray(manifest.capabilityRequirements)) {
      issues.push({ field: 'capabilityRequirements', reason: 'must_be_array_when_present' })
    } else {
      const requirements = manifest.capabilityRequirements as unknown[]
      requirements.forEach((item, index) => {
        if (!isRecord(item)) {
          issues.push({ field: `capabilityRequirements[${index}]`, reason: 'must_be_object' })
          return
        }
        issues.push(...validateCapabilityRequirement(item, index))
      })
    }
  }

  if (manifest.navigationItems !== undefined) {
    if (!Array.isArray(manifest.navigationItems)) {
      issues.push({ field: 'navigationItems', reason: 'must_be_array_when_present' })
    } else {
      const navigationItems = manifest.navigationItems as unknown[]

      navigationItems.forEach((item, index) => {
        if (!isRecord(item)) {
          issues.push({ field: `navigationItems[${index}]`, reason: 'must_be_object' })
          return
        }

        if (!isString(item.itemId)) {
          issues.push({ field: `navigationItems[${index}].itemId`, reason: 'must_be_string' })
        }

        if (!isString(item.title)) {
          issues.push({ field: `navigationItems[${index}].title`, reason: 'must_be_string' })
        }

        if (!isString(item.pageId)) {
          issues.push({ field: `navigationItems[${index}].pageId`, reason: 'must_be_string' })
        }

        if (item.section !== 'sidebar') {
          issues.push({ field: `navigationItems[${index}].section`, reason: 'must_be_sidebar' })
        }
      })
    }
  }

  if (manifest.settingsPages !== undefined) {
    if (!Array.isArray(manifest.settingsPages)) {
      issues.push({ field: 'settingsPages', reason: 'must_be_array_when_present' })
    } else {
      const settingsPages = manifest.settingsPages as unknown[]

      settingsPages.forEach((page, index) => {
        if (!isRecord(page)) {
          issues.push({ field: `settingsPages[${index}]`, reason: 'must_be_object' })
          return
        }

        issues.push(...validateSettingsPage(page, index))
      })
    }
  }

  if (manifest.commands !== undefined) {
    if (!Array.isArray(manifest.commands)) {
      issues.push({ field: 'commands', reason: 'must_be_array_when_present' })
    } else {
      const commands = manifest.commands as unknown[]

      commands.forEach((item, index) => {
        if (!isRecord(item)) {
          issues.push({ field: `commands[${index}]`, reason: 'must_be_object' })
          return
        }

        if (!isString(item.commandId)) {
          issues.push({ field: `commands[${index}].commandId`, reason: 'must_be_string' })
        }

        if (!isString(item.title)) {
          issues.push({ field: `commands[${index}].title`, reason: 'must_be_string' })
        }

        if (item.pageId !== undefined && !isString(item.pageId)) {
          issues.push({ field: `commands[${index}].pageId`, reason: 'must_be_string_when_present' })
        }
      })
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const typedManifest = manifest as unknown as WorkflowPluginManifest

  if (typedManifest.extensionType === 'workflow' && typedManifest.pages.length === 0) {
    return {
      ok: false,
      issues: [{ field: 'pages', reason: 'workflow_must_define_pages' }],
    }
  }

  if (typedManifest.extensionType === 'automation' && (!Array.isArray(typedManifest.automationItems) || typedManifest.automationItems.length === 0)) {
    return {
      ok: false,
      issues: [{ field: 'automationItems', reason: 'automation_must_define_items' }],
    }
  }

  const entryPath = join(input.pluginRoot, typedManifest.entry)
  if (!(await pathExists(entryPath))) {
    return {
      ok: false,
      issues: [{ field: 'entry', reason: 'entry_file_not_found' }],
    }
  }

  const pageIds = new Set<string>()
  for (const page of typedManifest.pages) {
    if (pageIds.has(page.pageId)) {
      return {
        ok: false,
        issues: [{ field: 'pages', reason: `duplicate_page_id:${page.pageId}` }],
      }
    }
    pageIds.add(page.pageId)
  }

  const automationItemIds = new Set<string>()
  if (Array.isArray(typedManifest.automationItems)) {
    for (const item of typedManifest.automationItems) {
      if (automationItemIds.has(item.itemId)) {
        return {
          ok: false,
          issues: [{ field: 'automationItems', reason: `duplicate_item_id:${item.itemId}` }],
        }
      }
      automationItemIds.add(item.itemId)
    }
  }

  const settingsPageIds = new Set<string>()
  if (Array.isArray(typedManifest.settingsPages)) {
    for (const page of typedManifest.settingsPages) {
      if (settingsPageIds.has(page.pageId)) {
        return {
          ok: false,
          issues: [{ field: 'settingsPages', reason: `duplicate_page_id:${page.pageId}` }],
        }
      }
      settingsPageIds.add(page.pageId)
    }
  }

  if (Array.isArray(typedManifest.navigationItems)) {
    for (const item of typedManifest.navigationItems) {
      if (!pageIds.has(item.pageId)) {
        return {
          ok: false,
          issues: [{ field: 'navigationItems', reason: `unknown_page_id:${item.pageId}` }],
        }
      }
    }
  }

  if (Array.isArray(typedManifest.commands)) {
    for (const item of typedManifest.commands) {
      if (item.pageId !== undefined && !pageIds.has(item.pageId)) {
        return {
          ok: false,
          issues: [{ field: 'commands', reason: `unknown_page_id:${item.pageId}` }],
        }
      }
    }
  }

  return {
    ok: true,
    issues: [],
    manifest: typedManifest,
  }
}
