import { tMusicMixProject } from './i18n.mjs'
import {
  MUSIC_MIX_PROJECT_RESOURCE_ID,
  buildMusicMixProjectScriptArgs,
  buildProjectTargetPath,
  normalizeMusicMixProjectInput,
  parseMusicMixProjectOutput,
  validateMusicMixProjectInput,
} from './toolCore.mjs'
import { MusicMixProjectToolPage } from './MusicMixProjectToolPage.mjs'

const baseManifest = {
  pluginId: 'loyan.music-mix-project-tool',
  extensionType: 'tool',
  version: '1.0.0',
  hostApiVersion: '0.1.0',
  supportedDaws: [],
  uiRuntime: 'react18',
  displayName: tMusicMixProject(null, 'manifest.displayName'),
  description: tMusicMixProject(null, 'manifest.description'),
  entry: 'dist/entry.mjs',
  styleEntry: 'dist/music-mix-project-tool.css',
  pages: [
    {
      pageId: 'music-mix-project-tool.page.main',
      path: '/tools/music-mix-project-tool',
      title: tMusicMixProject(null, 'page.title'),
      mount: 'tools',
      componentExport: 'MusicMixProjectToolPage',
    },
  ],
  tools: [
    {
      toolId: 'music-mix-project-tool',
      pageId: 'music-mix-project-tool.page.main',
      title: tMusicMixProject(null, 'page.title'),
      description: 'Create a dated music mix project folder with a selectable folder list.',
      order: 10,
      runnerExport: 'runMusicMixProjectTool',
    },
  ],
  toolRuntimePermissions: [
    'dialog.openDirectory',
    'fs.read',
    'shell.openPath',
    'process.execBundled',
  ],
  bundledResources: [
    {
      resourceId: 'music-mix-project-script',
      kind: 'script',
      relativePath: 'resources/scripts/create_project.sh',
    },
  ],
  requiredCapabilities: [],
}

export const manifest = baseManifest

export function resolveManifest() {
  return baseManifest
}

let activePluginId = ''

export function activate(context) {
  activePluginId = context.pluginId
  context.logger.info('Music mix project tool plugin activated.')
}

export function deactivate() {
  activePluginId = ''
}

export async function runMusicMixProjectTool(context, input = {}) {
  const normalizedInput = normalizeMusicMixProjectInput(input)
  const validation = validateMusicMixProjectInput(normalizedInput)

  if (!validation.ok) {
    throw new Error(validation.issues.join(', '))
  }

  const targetPath = buildProjectTargetPath(normalizedInput)
  const exists = await context.fs.exists(targetPath)
  if (exists) {
    throw new Error(`Target project folder already exists: ${targetPath}`)
  }

  const execution = await context.process.execBundled(
    MUSIC_MIX_PROJECT_RESOURCE_ID,
    buildMusicMixProjectScriptArgs(normalizedInput),
  )

  if (!execution.ok || execution.exitCode !== 0) {
    const details = [execution.error?.message, execution.stderr, execution.stdout].filter(Boolean).join('\n')
    throw new Error(details || 'Failed to create the music mix project folder.')
  }

  const result = parseMusicMixProjectOutput(execution.stdout)

  return {
    summary: tMusicMixProject(context?.locale, 'summary.created', { createdRoot: result.createdRoot || targetPath }),
    result,
  }
}

export { MusicMixProjectToolPage }

export function getActivePluginId() {
  return activePluginId
}
