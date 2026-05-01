import { ImportWorkflowPage } from './ImportWorkflowPage.mjs'
import {
  createDefaultImportWorkflowSettings,
  loadImportWorkflowSettings,
  saveImportWorkflowSettings,
} from './workflowCore.mjs'

function isZhCnLocale(locale) {
  const candidates = [locale?.resolved, locale?.requested, locale?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
}

const baseManifest = {
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
              fieldId: 'ui-import-audio-mode',
              kind: 'select',
              label: 'Import audio mode',
              path: 'ui.importAudioMode',
              options: [
                { value: 'copy', label: 'Copy into Audio Files folder' },
                { value: 'link', label: 'Link to source media' },
              ],
            },
            {
              fieldId: 'ui-delete-ixml-if-present',
              kind: 'toggle',
              label: 'Delete iXML sidecar files after import',
              path: 'ui.deleteIxmlIfPresent',
            },
            {
              fieldId: 'ui-strip-after-import',
              kind: 'toggle',
              label: 'Apply Strip Silence after import',
              path: 'ui.stripAfterImport',
            },
            {
              fieldId: 'ui-fade-after-strip',
              kind: 'toggle',
              label: 'Apply fades after Strip Silence',
              path: 'ui.fadeAfterStrip',
            },
            {
              fieldId: 'ui-fade-preset-name',
              kind: 'text',
              label: 'Fade preset name',
              path: 'ui.fadePresetName',
            },
            {
              fieldId: 'ui-fade-auto-adjust-bounds',
              kind: 'toggle',
              label: 'Auto-adjust fade bounds',
              path: 'ui.fadeAutoAdjustBounds',
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
    'daw.editing.renameSelectedClip',
    'daw.stripSilence.open',
    'daw.stripSilence.execute',
    'daw.editing.createFadesBasedOnPreset',
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
}

export const manifest = baseManifest

export function resolveManifest(locale) {
  if (!isZhCnLocale(locale)) {
    return baseManifest
  }

  return {
    ...baseManifest,
    displayName: '导入流程',
    description: '扫描文件夹、整理文件分类、批量编辑名称，并通过官方插件包执行导入流程。',
    pages: [
      {
        ...baseManifest.pages[0],
        title: '导入流程',
      },
    ],
    settingsPages: [
      {
        ...baseManifest.settingsPages[0],
        title: '导入流程',
        sections: [
          {
            ...baseManifest.settingsPages[0].sections[0],
            title: 'AI 命名',
            description: '这些提示词、模型、密钥和超时设置只保存在当前插件里。',
            fields: [
              { ...baseManifest.settingsPages[0].sections[0].fields[0], label: '启用 AI 命名' },
              { ...baseManifest.settingsPages[0].sections[0].fields[1], label: '超时时间（秒）' },
              { ...baseManifest.settingsPages[0].sections[0].fields[2], label: 'Base URL' },
              { ...baseManifest.settingsPages[0].sections[0].fields[3], label: '模型' },
              { ...baseManifest.settingsPages[0].sections[0].fields[4], label: 'API 密钥' },
              { ...baseManifest.settingsPages[0].sections[0].fields[5], label: '提示词' },
            ],
          },
          {
            ...baseManifest.settingsPages[0].sections[1],
            title: '运行默认值',
            fields: [
              {
                ...baseManifest.settingsPages[0].sections[1].fields[0],
                label: '音频导入方式',
                options: [
                  { value: 'copy', label: '复制到 Audio Files 文件夹' },
                  { value: 'link', label: '仅链接源媒体' },
                ],
              },
              { ...baseManifest.settingsPages[0].sections[1].fields[1], label: '导入后删除 iXML sidecar 文件' },
              { ...baseManifest.settingsPages[0].sections[1].fields[2], label: '导入后执行 Strip Silence' },
              { ...baseManifest.settingsPages[0].sections[1].fields[3], label: 'Strip Silence 后执行淡变' },
              { ...baseManifest.settingsPages[0].sections[1].fields[4], label: 'Fade preset name' },
              { ...baseManifest.settingsPages[0].sections[1].fields[5], label: '自动调整淡变边界' },
              { ...baseManifest.settingsPages[0].sections[1].fields[6], label: '执行后保存工程' },
              { ...baseManifest.settingsPages[0].sections[1].fields[7], label: '读写 .presto_ai_analyze.json 缓存文件' },
            ],
          },
          {
            ...baseManifest.settingsPages[0].sections[2],
            title: '分类与颜色',
            description: '这些分类决定自动分类、手动映射、颜色应用和执行顺序。',
            fields: [{ ...baseManifest.settingsPages[0].sections[2].fields[0], label: '分类' }],
          },
        ],
      },
    ],
  }
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
