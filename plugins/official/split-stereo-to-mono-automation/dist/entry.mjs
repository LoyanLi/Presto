export const manifest = {
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
  requiredCapabilities: ['automation.splitStereoToMono.execute'],
  adapterModuleRequirements: [{ moduleId: 'automation', minVersion: '2025.10.0' }],
  capabilityRequirements: [{ capabilityId: 'automation.splitStereoToMono.execute', minVersion: '2025.10.0' }],
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
        message: 'Split stereo to mono automation finished.',
      },
    ],
    summary:
      response.items?.length === 1
        ? `Automation finished. Kept track: ${response.items[0]?.keptTrackName ?? ''}`
        : `Automation finished. Processed ${response.items?.length ?? 0} tracks.`,
  }
}

export function getActivePluginId() {
  return activePluginId
}
