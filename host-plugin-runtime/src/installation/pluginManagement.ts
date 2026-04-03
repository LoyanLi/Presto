import { spawn } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type { DawTarget, WorkflowPluginManifest, WorkflowPluginModule } from '@presto/contracts'
import {
  discoverPlugins,
  type PluginDiscoveryIssue,
} from '../discovery/discoverPlugins'
import { loadPluginModule } from '../loading/loadPluginModule'

export type PluginInstallationIssueCategory =
  | 'manifest'
  | 'permission'
  | 'unsupported_daw'
  | 'entry_load'
  | 'discovery'

export interface PluginInstallationIssue {
  category: PluginInstallationIssueCategory
  pluginRoot: string
  manifestPath?: string
  reason: string
}

export interface PluginDiscoveredEntry {
  pluginRoot: string
  manifestPath: string
  manifest: WorkflowPluginManifest
  module: WorkflowPluginModule
}

export interface PluginDiscoveryWithLoadResult {
  plugins: PluginDiscoveredEntry[]
  issues: PluginInstallationIssue[]
}

export interface DiscoverInstalledPluginsOptions {
  officialRoots: readonly string[]
  managedRoot: string
  isHostApiVersionCompatible?(hostApiVersion: string): boolean
  currentDaw?: DawTarget
}

export interface InstallPluginFromDirectoryOptions {
  sourcePath: string
  managedRoot: string
  isHostApiVersionCompatible?(hostApiVersion: string): boolean
  currentDaw?: DawTarget
  allowOverwrite?: boolean
}

export type PluginZipExtractor = (zipPath: string, destinationRoot: string) => Promise<void>

export interface InstallPluginFromZipOptions {
  zipPath: string
  managedRoot: string
  isHostApiVersionCompatible?(hostApiVersion: string): boolean
  currentDaw?: DawTarget
  allowOverwrite?: boolean
  extractZip?: PluginZipExtractor
}

export type PluginInstallResult =
  | {
      ok: true
      plugin: PluginDiscoveredEntry
    }
  | {
      ok: false
      issues: PluginInstallationIssue[]
    }

interface DiscoveryInput {
  isHostApiVersionCompatible?(hostApiVersion: string): boolean
  currentDaw?: DawTarget
}

interface CandidateSelectionResult {
  ok: true
  candidate: {
    pluginRoot: string
    manifestPath: string
    manifest: WorkflowPluginManifest
  }
}

function classifyIssueCategory(reason: string): PluginInstallationIssueCategory {
  if (reason.startsWith('manifest_validation:')) {
    return 'manifest'
  }
  if (reason.startsWith('permission_validation:')) {
    return 'permission'
  }
  if (reason.startsWith('daw_support_validation:')) {
    return 'unsupported_daw'
  }
  if (reason.startsWith('entry_load:')) {
    return 'entry_load'
  }
  return 'discovery'
}

function mapDiscoveryIssue(issue: PluginDiscoveryIssue): PluginInstallationIssue {
  return {
    category: classifyIssueCategory(issue.reason),
    pluginRoot: issue.pluginRoot,
    manifestPath: issue.manifestPath,
    reason: issue.reason,
  }
}

function mapEntryLoadIssue(
  pluginRoot: string,
  manifestPath: string,
  reason: string,
): PluginInstallationIssue {
  const namespacedReason = reason.startsWith('entry_load:') ? reason : `entry_load:${reason}`
  return {
    category: 'entry_load',
    pluginRoot,
    manifestPath,
    reason: namespacedReason,
  }
}

function buildDiscoveryInput(input: DiscoveryInput): DiscoveryInput {
  return {
    isHostApiVersionCompatible: input.isHostApiVersionCompatible,
    currentDaw: input.currentDaw,
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function dedupeResolvedPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const path of paths) {
    const resolvedPath = resolve(path)
    if (seen.has(resolvedPath)) {
      continue
    }
    seen.add(resolvedPath)
    output.push(resolvedPath)
  }
  return output
}

async function pickSingleCandidate(
  sourceRoot: string,
  input: DiscoveryInput,
): Promise<CandidateSelectionResult | { ok: false; issues: PluginInstallationIssue[] }> {
  const discovered = await discoverPlugins({
    roots: [sourceRoot],
    ...buildDiscoveryInput(input),
  })
  const typedCandidates = discovered.plugins as Array<{
    pluginRoot: string
    manifestPath: string
    manifest: WorkflowPluginManifest
  }>

  if (typedCandidates.length === 0) {
    const issues = discovered.issues.map(mapDiscoveryIssue)
    if (issues.length > 0) {
      return { ok: false, issues }
    }
    return {
      ok: false,
      issues: [
        {
          category: 'discovery',
          pluginRoot: resolve(sourceRoot),
          reason: 'plugin_not_found_in_source',
        },
      ],
    }
  }

  if (typedCandidates.length > 1) {
    return {
      ok: false,
      issues: [
        {
          category: 'discovery',
          pluginRoot: resolve(sourceRoot),
          reason: 'multiple_plugins_found_in_source',
        },
      ],
    }
  }

  return {
    ok: true,
    candidate: typedCandidates[0],
  }
}

async function runAndValidateInstalledPlugin(
  destinationRoot: string,
  input: DiscoveryInput,
): Promise<PluginInstallResult> {
  const discovered = await discoverPlugins({
    roots: [destinationRoot],
    ...buildDiscoveryInput(input),
  })
  const typedCandidates = discovered.plugins as Array<{
    pluginRoot: string
    manifestPath: string
    manifest: WorkflowPluginManifest
  }>

  if (typedCandidates.length !== 1) {
    const issues = discovered.issues.map(mapDiscoveryIssue)
    if (issues.length > 0) {
      return { ok: false, issues }
    }
    return {
      ok: false,
      issues: [
        {
          category: 'discovery',
          pluginRoot: destinationRoot,
          reason: 'installed_plugin_not_discoverable',
        },
      ],
    }
  }

  const candidate = typedCandidates[0]
  const entryPath = join(candidate.pluginRoot, candidate.manifest.entry)
  const loadResult = await loadPluginModule({ entryPath })
  if (!loadResult.ok || !loadResult.module) {
    return {
      ok: false,
      issues: [
        mapEntryLoadIssue(
          candidate.pluginRoot,
          candidate.manifestPath,
          loadResult.issue?.reason ?? 'module_import_failed',
        ),
      ],
    }
  }

  return {
    ok: true,
    plugin: {
      pluginRoot: candidate.pluginRoot,
      manifestPath: candidate.manifestPath,
      manifest: candidate.manifest,
      module: loadResult.module,
    },
  }
}

async function prepareDestinationRoot(
  managedRoot: string,
  pluginId: string,
  allowOverwrite = true,
): Promise<{ ok: true; destinationRoot: string } | { ok: false; issues: PluginInstallationIssue[] }> {
  const resolvedManagedRoot = resolve(managedRoot)
  const destinationRoot = join(resolvedManagedRoot, pluginId)
  await mkdir(resolvedManagedRoot, { recursive: true })

  if (await pathExists(destinationRoot)) {
    if (!allowOverwrite) {
      return {
        ok: false,
        issues: [
          {
            category: 'discovery',
            pluginRoot: destinationRoot,
            manifestPath: join(destinationRoot, 'manifest.json'),
            reason: `plugin_already_installed:${pluginId}`,
          },
        ],
      }
    }
    await rm(destinationRoot, { recursive: true, force: true })
  }

  return { ok: true, destinationRoot }
}

async function copyIntoManagedRoot(
  sourcePluginRoot: string,
  managedRoot: string,
  pluginId: string,
  allowOverwrite: boolean,
  discoveryInput: DiscoveryInput,
): Promise<PluginInstallResult> {
  const destinationResult = await prepareDestinationRoot(managedRoot, pluginId, allowOverwrite)
  if (!destinationResult.ok) {
    return destinationResult
  }

  const destinationRoot = destinationResult.destinationRoot
  try {
    await cp(sourcePluginRoot, destinationRoot, { recursive: true, force: true })
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          category: 'discovery',
          pluginRoot: destinationRoot,
          reason: error instanceof Error ? `copy_failed:${error.message}` : 'copy_failed',
        },
      ],
    }
  }

  const validationResult = await runAndValidateInstalledPlugin(destinationRoot, discoveryInput)
  if (!validationResult.ok) {
    await rm(destinationRoot, { recursive: true, force: true })
  }
  return validationResult
}

async function extractZipWithSystemUnzip(zipPath: string, destinationRoot: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const process = spawn('unzip', ['-qq', zipPath, '-d', destinationRoot], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''

    process.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    process.once('error', (error) => {
      rejectPromise(error)
    })

    process.once('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      const errorMessage = stderr.trim() || `unzip_exit_code_${code ?? 'unknown'}`
      rejectPromise(new Error(errorMessage))
    })
  })
}

export async function discoverInstalledPlugins(
  options: DiscoverInstalledPluginsOptions,
): Promise<PluginDiscoveryWithLoadResult> {
  const roots = dedupeResolvedPaths([...options.officialRoots, options.managedRoot])
  const discovered = await discoverPlugins({
    roots,
    isHostApiVersionCompatible: options.isHostApiVersionCompatible,
    currentDaw: options.currentDaw,
  })

  const typedCandidates = discovered.plugins as Array<{
    pluginRoot: string
    manifestPath: string
    manifest: WorkflowPluginManifest
  }>

  const issues = discovered.issues.map(mapDiscoveryIssue)
  const loadablePlugins: PluginDiscoveredEntry[] = []

  for (const candidate of typedCandidates) {
    const entryPath = join(candidate.pluginRoot, candidate.manifest.entry)
    const loadResult = await loadPluginModule({ entryPath })
    if (!loadResult.ok || !loadResult.module) {
      issues.push(
        mapEntryLoadIssue(
          candidate.pluginRoot,
          candidate.manifestPath,
          loadResult.issue?.reason ?? 'module_import_failed',
        ),
      )
      continue
    }
    loadablePlugins.push({
      pluginRoot: candidate.pluginRoot,
      manifestPath: candidate.manifestPath,
      manifest: candidate.manifest,
      module: loadResult.module,
    })
  }

  return {
    plugins: loadablePlugins,
    issues,
  }
}

export async function installPluginFromDirectory(
  options: InstallPluginFromDirectoryOptions,
): Promise<PluginInstallResult> {
  const sourcePath = resolve(options.sourcePath)
  const candidateResult = await pickSingleCandidate(sourcePath, {
    isHostApiVersionCompatible: options.isHostApiVersionCompatible,
    currentDaw: options.currentDaw,
  })
  if (!candidateResult.ok) {
    return candidateResult
  }

  return copyIntoManagedRoot(
    candidateResult.candidate.pluginRoot,
    options.managedRoot,
    candidateResult.candidate.manifest.pluginId,
    options.allowOverwrite ?? true,
    {
      isHostApiVersionCompatible: options.isHostApiVersionCompatible,
      currentDaw: options.currentDaw,
    },
  )
}

export async function installPluginFromZip(
  options: InstallPluginFromZipOptions,
): Promise<PluginInstallResult> {
  const managedRoot = resolve(options.managedRoot)
  const stagingParent = join(managedRoot, '.staging')
  await mkdir(stagingParent, { recursive: true })
  const stagingRoot = await mkdtemp(join(stagingParent, 'install-'))

  const extractor = options.extractZip ?? extractZipWithSystemUnzip

  try {
    await extractor(options.zipPath, stagingRoot)
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true })
    return {
      ok: false,
      issues: [
        {
          category: 'discovery',
          pluginRoot: stagingRoot,
          reason:
            error instanceof Error
              ? `zip_extract_failed:${error.message}`
              : 'zip_extract_failed',
        },
      ],
    }
  }

  try {
    const candidateResult = await pickSingleCandidate(stagingRoot, {
      isHostApiVersionCompatible: options.isHostApiVersionCompatible,
      currentDaw: options.currentDaw,
    })
    if (!candidateResult.ok) {
      return candidateResult
    }

    return await copyIntoManagedRoot(
      candidateResult.candidate.pluginRoot,
      managedRoot,
      candidateResult.candidate.manifest.pluginId,
      options.allowOverwrite ?? true,
      {
        isHostApiVersionCompatible: options.isHostApiVersionCompatible,
        currentDaw: options.currentDaw,
      },
    )
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}
