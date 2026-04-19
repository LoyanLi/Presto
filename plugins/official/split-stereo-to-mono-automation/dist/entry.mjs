function isZhCnLocale(locale) {
  const candidates = [locale?.resolved, locale?.requested, locale?.locale]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return candidates.some((value) => value === 'zh-cn' || value === 'zh' || value.startsWith('zh-'))
}

function t(locale, key, replacements = {}) {
  const messages = {
    en: {
      displayName: 'Split Stereo To Mono',
      description: 'Split the current stereo selection into mono tracks and keep the chosen side through the core automation capability.',
      itemTitle: 'Split Stereo To Mono',
      itemDescription: 'Use the current Pro Tools selection and keep either the left or right mono channel.',
      keepChannel: 'Keep Channel',
      keepLeft: 'Left',
      keepRight: 'Right',
      stepFinished: 'Split stereo to mono automation finished.',
      summaryTrack: 'Automation finished. Kept track: {trackName}',
      summaryCount: 'Automation finished. Processed {count} tracks.',
    },
    'zh-CN': {
      displayName: '立体声拆分单声道',
      description: '使用核心自动化能力把当前立体声选择拆成单声道轨道，并保留指定声道。',
      itemTitle: '立体声拆分单声道',
      itemDescription: '使用当前 Pro Tools 选择，并保留左声道或右声道。',
      keepChannel: '保留声道',
      keepLeft: '左声道',
      keepRight: '右声道',
      stepFinished: '立体声拆分单声道自动化已完成。',
      summaryTrack: '自动化已完成。保留的轨道：{trackName}',
      summaryCount: '自动化已完成。处理了 {count} 条轨道。',
    },
  }
  const localeKey = isZhCnLocale(locale) ? 'zh-CN' : 'en'
  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value)),
    messages[localeKey][key] ?? messages.en[key] ?? key,
  )
}

const baseManifest = {
  pluginId: 'official.split-stereo-to-mono-automation',
  extensionType: 'automation',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: ['pro_tools'],
  uiRuntime: 'react18',
  displayName: 'Split Stereo To Mono',
  description:
    'Split the current stereo selection into mono tracks and keep the chosen side through the core automation capability.',
  entry: 'dist/entry.mjs',
  pages: [],
  automationItems: [
    {
      itemId: 'split-stereo-to-mono.card',
      title: 'Split Stereo To Mono',
      automationType: 'splitStereoToMono',
      description: 'Use the current Pro Tools selection and keep either the left or right mono channel.',
      order: 10,
      runnerExport: 'runSplitStereoToMono',
      optionsSchema: [
        {
          optionId: 'keepChannel',
          kind: 'select',
          label: 'Keep Channel',
          defaultValue: 'left',
          options: [
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ],
        },
      ],
    },
  ],
  requiredCapabilities: ['daw.automation.splitStereoToMono.execute'],
  adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
  capabilityRequirements: [{ capabilityId: 'daw.automation.splitStereoToMono.execute', minVersion: '2025.10.0' }],
}

export const manifest = baseManifest

export function resolveManifest(locale) {
  if (!isZhCnLocale(locale)) {
    return baseManifest
  }

  return {
    ...baseManifest,
    displayName: t(locale, 'displayName'),
    description: t(locale, 'description'),
    automationItems: [
      {
        ...baseManifest.automationItems[0],
        title: t(locale, 'itemTitle'),
        description: t(locale, 'itemDescription'),
        optionsSchema: [
          {
            ...baseManifest.automationItems[0].optionsSchema[0],
            label: t(locale, 'keepChannel'),
            options: [
              { value: 'left', label: t(locale, 'keepLeft') },
              { value: 'right', label: t(locale, 'keepRight') },
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
  context.logger.info('Split stereo to mono automation plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

export async function runSplitStereoToMono(context, input = {}) {
  const keepChannel = input.keepChannel === 'right' ? 'right' : 'left'
  const response = await context.presto.automation.splitStereoToMono.execute({ keepChannel })

  return {
    steps: [
      {
        id: 'automation.execute',
        status: 'succeeded',
        message: t(context?.locale, 'stepFinished'),
      },
    ],
    summary:
      response.items?.length === 1
        ? t(context?.locale, 'summaryTrack', { trackName: response.items[0]?.keptTrackName ?? '' })
        : t(context?.locale, 'summaryCount', { count: response.items?.length ?? 0 }),
  }
}

export function getActivePluginId() {
  return activePluginId
}
