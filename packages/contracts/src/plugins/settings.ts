export type WorkflowSettingsFieldKind =
  | 'toggle'
  | 'select'
  | 'text'
  | 'password'
  | 'textarea'
  | 'number'
  | 'categoryList'

export interface WorkflowSettingsSelectOption {
  value: string
  label: string
}

interface WorkflowSettingsFieldBase {
  fieldId: string
  kind: WorkflowSettingsFieldKind
  label: string
  path: string
  description?: string
}

export interface WorkflowSettingsToggleFieldDefinition extends WorkflowSettingsFieldBase {
  kind: 'toggle'
  checkedValue?: string | number | boolean
  uncheckedValue?: string | number | boolean
}

export interface WorkflowSettingsSelectFieldDefinition extends WorkflowSettingsFieldBase {
  kind: 'select'
  options: WorkflowSettingsSelectOption[]
}

export interface WorkflowSettingsTextFieldDefinition extends WorkflowSettingsFieldBase {
  kind: 'text' | 'password' | 'textarea'
  placeholder?: string
}

export interface WorkflowSettingsNumberFieldDefinition extends WorkflowSettingsFieldBase {
  kind: 'number'
  min?: number
  max?: number
  step?: number
}

export interface WorkflowSettingsCategoryListFieldDefinition extends WorkflowSettingsFieldBase {
  kind: 'categoryList'
}

export type WorkflowSettingsFieldDefinition =
  | WorkflowSettingsToggleFieldDefinition
  | WorkflowSettingsSelectFieldDefinition
  | WorkflowSettingsTextFieldDefinition
  | WorkflowSettingsNumberFieldDefinition
  | WorkflowSettingsCategoryListFieldDefinition

export interface WorkflowSettingsSectionDefinition {
  sectionId: string
  title: string
  description?: string
  fields: WorkflowSettingsFieldDefinition[]
}

export interface WorkflowSettingsPageDefinition {
  pageId: string
  title: string
  order?: number
  storageKey: string
  defaults: Record<string, unknown>
  loadExport: string
  saveExport: string
  sections: WorkflowSettingsSectionDefinition[]
}
