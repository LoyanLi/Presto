import { ImportWorkflowPage } from './ImportWorkflowPage.mjs'
import {
  createDefaultImportWorkflowSettings,
  loadImportWorkflowSettings,
  saveImportWorkflowSettings,
} from './workflowCore.mjs'

export const manifest = {
  pluginId: 'official.import-workflow',
  extensionType: 'workflow',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: ['pro_tools'],
  uiRuntime: 'react18',
  displayName: 'Import Workflow',
  description: 'Scan folders, classify files, batch-edit names, and run the import workflow from an official plugin package.',
  entry: 'dist/entry.mjs',
  styleEntry: 'dist/import-workflow.css',
  workflowDefinition: {
    workflowId: 'official.import-workflow.run',
    inputSchemaId: 'official.import-workflow.run.v1',
    definitionEntry: 'dist/workflow-definition.json',
  },
  pages: [
    {
      pageId: 'import-workflow.page.main',
      path: '/plugins/import-workflow',
      title: 'Import Workflow',
      mount: 'workspace',
      componentExport: 'ImportWorkflowPage',
    },
  ],
  settingsPages: [
    {
      pageId: 'import-workflow.page.settings',
      title: 'Import Workflow',
      order: 30,
      storageKey: 'settings.v1',
      loadExport: 'loadImportWorkflowSettings',
      saveExport: 'saveImportWorkflowSettings',
      defaults: createDefaultImportWorkflowSettings(),
      sections: [
        {
          sectionId: 'aiNaming',
          title: 'AI naming',
          description: 'This prompt, model, key, and timeout remain plugin-local.',
          fields: [
            { fieldId: 'ai-enabled', kind: 'toggle', label: 'Enable AI naming', path: 'aiConfig.enabled' },
            {
              fieldId: 'ai-timeout',
              kind: 'number',
              label: 'Timeout (seconds)',
              path: 'aiConfig.timeoutSeconds',
              min: 1,
              max: 600,
              step: 1,
            },
            { fieldId: 'ai-base-url', kind: 'text', label: 'Base URL', path: 'aiConfig.baseUrl' },
            { fieldId: 'ai-model', kind: 'text', label: 'Model', path: 'aiConfig.model' },
            { fieldId: 'ai-api-key', kind: 'password', label: 'API key', path: 'aiConfig.apiKey' },
            { fieldId: 'ai-prompt', kind: 'textarea', label: 'Prompt', path: 'aiConfig.prompt' },
          ],
        },
        {
          sectionId: 'runDefaults',
          title: 'Run defaults',
          fields: [
            {
              fieldId: 'ui-strip-after-import',
              kind: 'toggle',
              label: 'Apply Strip Silence after import',
              path: 'ui.stripAfterImport',
            },
            { fieldId: 'ui-auto-save', kind: 'toggle', label: 'Save session after run', path: 'ui.autoSaveSession' },
            {
              fieldId: 'ui-analyze-cache',
              kind: 'toggle',
              label: 'Read and write .presto_ai_analyze.json cache files',
              path: 'ui.analyzeCacheEnabled',
            },
          ],
        },
        {
          sectionId: 'categories',
          title: 'Categories and colors',
          description: 'These categories drive classification, manual mapping, color application, and execution ordering.',
          fields: [{ fieldId: 'categories-editor', kind: 'categoryList', label: 'Categories', path: 'categories' }],
        },
      ],
    },
  ],
  requiredCapabilities: [
    'workflow.run.start',
    'daw.import.analyze',
    'daw.import.cache.save',
    'daw.import.planRunItems',
    'daw.import.run.start',
    'jobs.get',
    'jobs.cancel',
    'daw.track.listNames',
    'daw.track.rename',
    'daw.track.select',
    'daw.track.color.apply',
    'daw.clip.selectAllOnTrack',
    'daw.stripSilence.open',
    'daw.stripSilence.execute',
    'daw.session.save',
  ],
  adapterModuleRequirements: [
    { moduleId: 'import', minVersion: '2025.10.0' },
    { moduleId: 'jobs', minVersion: '2025.10.0' },
    { moduleId: 'track', minVersion: '2025.10.0' },
    { moduleId: 'clip', minVersion: '2025.10.0' },
    { moduleId: 'stripSilence', minVersion: '2025.10.0' },
    { moduleId: 'session', minVersion: '2025.10.0' },
  ],
  capabilityRequirements: [
    { capabilityId: 'daw.import.analyze', minVersion: '2025.10.0' },
    { capabilityId: 'daw.import.cache.save', minVersion: '2025.10.0' },
    { capabilityId: 'workflow.run.start', minVersion: '2025.10.0' },
    { capabilityId: 'daw.import.planRunItems', minVersion: '2025.10.0' },
    { capabilityId: 'daw.import.run.start', minVersion: '2025.10.0' },
    { capabilityId: 'jobs.get', minVersion: '2025.10.0' },
    { capabilityId: 'jobs.cancel', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.listNames', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.rename', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.select', minVersion: '2025.10.0' },
    { capabilityId: 'daw.track.color.apply', minVersion: '2025.10.0' },
    { capabilityId: 'daw.clip.selectAllOnTrack', minVersion: '2025.10.0' },
    { capabilityId: 'daw.stripSilence.open', minVersion: '2025.10.0' },
    { capabilityId: 'daw.stripSilence.execute', minVersion: '2025.10.0' },
    { capabilityId: 'daw.session.save', minVersion: '2025.10.0' },
  ],
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Import workflow plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

export { ImportWorkflowPage }
export { loadImportWorkflowSettings, saveImportWorkflowSettings }

export function getActivePluginId() {
  return activePluginId
}
