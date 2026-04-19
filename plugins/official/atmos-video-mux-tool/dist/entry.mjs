import { AtmosVideoMuxToolPage } from './AtmosVideoMuxToolPage.mjs'
import { tAtmos, translateAtmosPreviewIssue } from './i18n.mjs'
import {
  ATMOS_MUX_RESOURCE_ID,
  buildAtmosMuxScriptArgs,
  normalizeAtmosMuxInput,
  parseAtmosMuxOutputPath,
  validateAtmosMuxInput,
} from './toolCore.mjs'

function isZhCnLocale(locale) {
  return tAtmos(locale, 'manifest.displayName') !== tAtmos(null, 'manifest.displayName')
}

function joinErrorDetails(values) {
  return values.filter((value) => typeof value === 'string' && value.trim().length > 0).join('\n')
}

const baseManifest = {
  pluginId: 'official.atmos-video-mux-tool',
  extensionType: 'tool',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: [],
  uiRuntime: 'react18',
  displayName: tAtmos(null, 'manifest.displayName'),
  description: tAtmos(null, 'manifest.description'),
  entry: 'dist/entry.mjs',
  styleEntry: 'dist/atmos-video-mux-tool.css',
  pages: [
    {
      pageId: 'atmos-video-mux.page.main',
      path: '/tools/atmos-video-mux-tool',
      title: tAtmos(null, 'manifest.pageTitle'),
      mount: 'tools',
      componentExport: 'AtmosVideoMuxToolPage',
    },
  ],
  tools: [
    {
      toolId: 'atmos-video-mux',
      pageId: 'atmos-video-mux.page.main',
      title: tAtmos(null, 'manifest.pageTitle'),
      description: tAtmos(null, 'manifest.toolDescription'),
      order: 10,
      runnerExport: 'runAtmosVideoMuxTool',
    },
  ],
  toolRuntimePermissions: ['dialog.openFile', 'dialog.openDirectory', 'fs.list', 'shell.openPath', 'process.execBundled'],
  bundledResources: [
    {
      resourceId: 'atmos-video-mux-script',
      kind: 'script',
      relativePath: 'resources/scripts/atmos_mux.sh',
    },
    {
      resourceId: 'ffmpeg',
      kind: 'binary',
      relativePath: 'resources/bin/ffmpeg',
    },
    {
      resourceId: 'ffprobe',
      kind: 'binary',
      relativePath: 'resources/bin/ffprobe',
    },
    {
      resourceId: 'mp4demuxer',
      kind: 'binary',
      relativePath: 'resources/bin/mp4demuxer',
    },
    {
      resourceId: 'mp4muxer',
      kind: 'binary',
      relativePath: 'resources/bin/mp4muxer',
    },
  ],
  requiredCapabilities: [],
}

export const manifest = baseManifest

export function resolveManifest(locale) {
  if (!isZhCnLocale(locale)) {
    return baseManifest
  }

  return {
    ...baseManifest,
    displayName: tAtmos(locale, 'manifest.displayName'),
    description: tAtmos(locale, 'manifest.description'),
    pages: [
      {
        ...baseManifest.pages[0],
        title: tAtmos(locale, 'manifest.pageTitle'),
      },
    ],
    tools: [
      {
        ...baseManifest.tools[0],
        title: tAtmos(locale, 'manifest.pageTitle'),
        description: tAtmos(locale, 'manifest.toolDescription'),
      },
    ],
  }
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Atmos video mux tool plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

export async function runAtmosVideoMuxTool(context, input = {}) {
  const normalizedInput = normalizeAtmosMuxInput(input)
  const validation = validateAtmosMuxInput(normalizedInput)
  if (!validation.ok) {
    throw new Error(
      tAtmos(context?.locale, 'runner.invalidInput', {
        issues: validation.issues.map((issue) => translateAtmosPreviewIssue(context?.locale, issue)).join(' '),
      }),
    )
  }

  const args = buildAtmosMuxScriptArgs(normalizedInput)
  const execution = await context.process.execBundled(ATMOS_MUX_RESOURCE_ID, args)

  if (!execution.ok || execution.exitCode !== 0) {
    const details = joinErrorDetails([execution.error?.message, execution.stderr, execution.stdout])
    throw new Error(tAtmos(context?.locale, 'runner.processFailed', { details }).trim())
  }

  const outputPath = parseAtmosMuxOutputPath(execution.stdout)

  return {
    summary: outputPath
      ? tAtmos(context?.locale, 'runner.summaryWithOutput', { outputPath })
      : tAtmos(context?.locale, 'runner.summary'),
    result: {
      outputPath,
      args,
      stdout: execution.stdout,
      stderr: execution.stderr ?? '',
    },
  }
}

export { AtmosVideoMuxToolPage }

export function getActivePluginId() {
  return activePluginId
}
