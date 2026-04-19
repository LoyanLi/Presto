import { tTimeCalculator } from './i18n.mjs'
import { TimeCalculatorToolPage } from './TimeCalculatorToolPage.mjs'

const baseManifest = {
  pluginId: 'official.time-calculator-tool',
  extensionType: 'tool',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: [],
  uiRuntime: 'react18',
  displayName: tTimeCalculator(null, 'manifest.displayName'),
  description: tTimeCalculator(null, 'manifest.description'),
  entry: 'dist/entry.mjs',
  styleEntry: 'dist/time-calculator-tool.css',
  pages: [
    {
      pageId: 'time-calculator.page.main',
      path: '/tools/time-calculator',
      title: tTimeCalculator(null, 'page.title'),
      mount: 'tools',
      componentExport: 'TimeCalculatorToolPage',
    },
  ],
  requiredCapabilities: [],
}

export const manifest = baseManifest

export function resolveManifest(locale) {
  const displayName = tTimeCalculator(locale, 'manifest.displayName')
  if (displayName === baseManifest.displayName) {
    return baseManifest
  }

  return {
    ...baseManifest,
    displayName,
    description: tTimeCalculator(locale, 'manifest.description'),
    pages: [
      {
        ...baseManifest.pages[0],
        title: tTimeCalculator(locale, 'page.title'),
      },
    ],
  }
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Time calculator plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

export { TimeCalculatorToolPage }

export function getActivePluginId() {
  return activePluginId
}
