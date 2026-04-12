import { AtmosVideoMuxToolPage } from './AtmosVideoMuxToolPage.mjs'
import {
  ATMOS_MUX_RESOURCE_ID,
  buildAtmosMuxScriptArgs,
  normalizeAtmosMuxInput,
  parseAtmosMuxOutputPath,
  validateAtmosMuxInput,
} from './toolCore.mjs'

export const manifest = {
  pluginId: 'official.atmos-video-mux-tool',
  extensionType: 'tool',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: [],
  uiRuntime: 'react18',
  displayName: 'Atmos Video Mux Tool',
  description:
    'Merge a high-quality video MP4 with Dolby Atmos MP4 audio using the official one-click mux algorithm sample.',
  entry: 'dist/entry.mjs',
  styleEntry: 'dist/atmos-video-mux-tool.css',
  pages: [
    {
      pageId: 'atmos-video-mux.page.main',
      path: '/tools/atmos-video-mux-tool',
      title: 'Atmos Video Mux',
      mount: 'tools',
      componentExport: 'AtmosVideoMuxToolPage',
    },
  ],
  tools: [
    {
      toolId: 'atmos-video-mux',
      pageId: 'atmos-video-mux.page.main',
      title: 'Atmos Video Mux',
      description:
        'Combine a video MP4 and Atmos MP4 into an output MP4 with FPS alignment and level-repair retry.',
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
    throw new Error(`Cannot run Atmos Video Mux tool: ${validation.issues.join(' ')}`)
  }

  const args = buildAtmosMuxScriptArgs(normalizedInput)
  const execution = await context.process.execBundled(ATMOS_MUX_RESOURCE_ID, args)

  if (!execution.ok || execution.exitCode !== 0) {
    const details = [
      execution.error?.message,
      execution.stderr,
      execution.stdout,
    ]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
    throw new Error(`Atmos video mux process failed. ${details}`.trim())
  }

  const outputPath = parseAtmosMuxOutputPath(execution.stdout)

  return {
    summary: outputPath
      ? `Atmos video mux completed: ${outputPath}`
      : 'Atmos video mux completed.',
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
