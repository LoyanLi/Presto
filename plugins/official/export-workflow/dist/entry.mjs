import { ExportWorkflowPage } from './ExportWorkflowPage.mjs'
import {
  createDefaultExportWorkflowSettings,
  loadExportWorkflowSettings,
  saveExportWorkflowSettings,
} from './workflowCore.mjs'

function isZhCnLocale(locale) {
  const candidates = [locale?.resolved, locale?.requested, locale?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
}

const baseManifest = {
  pluginId: 'official.export-workflow',
  extensionType: 'workflow',
  version: '1.0.1',
  hostApiVersion: '0.1.0',
  supportedDaws: ['pro_tools'],
  uiRuntime: 'react18',
  displayName: 'Export Workflow',
  description: 'Capture track snapshots, manage export presets, and run the official batch export workflow.',
  entry: 'dist/entry.mjs',
  styleEntry: 'dist/export-workflow.css',
  workflowDefinition: {
    workflowId: 'official.export-workflow.run',
    inputSchemaId: 'official.export-workflow.run.v1',
    definitionEntry: 'dist/workflow-definition.json',
  },
  pages: [
    {
      pageId: 'export-workflow.page.main',
      path: '/plugins/export-workflow',
      title: 'Export Workflow',
      mount: 'workspace',
      componentExport: 'ExportWorkflowPage',
    },
  ],
  settingsPages: [
    {
      pageId: 'export-workflow.page.settings',
      title: 'Export Workflow',
      order: 40,
      storageKey: 'settings.v1',
      loadExport: 'loadExportWorkflowSettings',
      saveExport: 'saveExportWorkflowSettings',
      defaults: createDefaultExportWorkflowSettings(),
      sections: [
        {
          sectionId: 'defaultSnapshotSelection',
          title: 'Default snapshot selection',
          fields: [
            {
              fieldId: 'default-snapshot-selection',
              kind: 'toggle',
              label: 'Select all snapshots by default',
              path: 'defaultSnapshotSelection',
              checkedValue: 'all',
              uncheckedValue: 'none',
            },
          ],
        },
      ],
    },
  ],
  requiredCapabilities: [
    'workflow.run.start',
    'daw.connection.getStatus',
    'daw.session.getInfo',
    'daw.track.list',
    'daw.export.mixWithSource',
    'daw.export.run.start',
    'jobs.get',
    'jobs.cancel',
  ],
  adapterModuleRequirements: [
    { moduleId: 'daw', minVersion: '2025.10.0' },
    { moduleId: 'session', minVersion: '2025.10.0' },
    { moduleId: 'track', minVersion: '2025.10.0' },
    { moduleId: 'export', minVersion: '2025.10.0' },
    { moduleId: 'jobs', minVersion: '2025.10.0' },
  ],
  capabilityRequirements: [
    { capabilityId: 'workflow.run.start', minVersion: '2025.10.0' },
    { capabilityId: 'daw.connection.getStatus', minVersion: '2025.10.0' },
    { capabilityId: 'daw.session.getInfo', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.list', minVersion: '2025.10.0' },
    { capabilityId: 'daw.export.mixWithSource', minVersion: '2025.10.0' },
    { capabilityId: 'daw.export.run.start', minVersion: '2025.10.0' },
    { capabilityId: 'jobs.get', minVersion: '2025.10.0' },
    { capabilityId: 'jobs.cancel', minVersion: '2025.10.0' },
  ],
}

export const manifest = baseManifest

export function resolveManifest(locale) {
  if (!isZhCnLocale(locale)) {
    return baseManifest
  }

  return {
    ...baseManifest,
    displayName: '导出流程',
    description: '捕捉轨道快照、管理导出预设，并执行官方批量导出流程。',
    pages: [
      {
        ...baseManifest.pages[0],
        title: '导出流程',
      },
    ],
    settingsPages: [
      {
        ...baseManifest.settingsPages[0],
        title: '导出流程',
        sections: [
          {
            ...baseManifest.settingsPages[0].sections[0],
            title: '默认快照选择',
            fields: [
              {
                ...baseManifest.settingsPages[0].sections[0].fields[0],
                label: '默认选中全部快照',
              },
            ],
          },
        ],
      },
    ],
  }
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Export workflow plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

export { ExportWorkflowPage }
export { loadExportWorkflowSettings, saveExportWorkflowSettings }

export function getActivePluginId() {
  return activePluginId
}
