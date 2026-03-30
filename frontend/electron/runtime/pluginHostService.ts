import { execFile } from 'node:child_process'
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import type { DawTarget, WorkflowPluginManifest } from '../../../packages/contracts/src'
import { discoverPlugins, loadPluginModule } from '../../../host-plugin-runtime/src'

export type PluginIssueCategory =
  | 'manifest'
  | 'permission'
  | 'daw_support'
  | 'entry_load'
  | 'discovery'
  | 'install'

export interface PluginHostIssue {
  category: PluginIssueCategory
  reason: string
  pluginRoot?: string
  manifestPath?: string
}

export interface PluginHostPluginRecord {
  pluginId: string
  displayName: string
  version: string
  pluginRoot: string
  entryPath: string
  manifest: WorkflowPluginManifest
  settingsPages: NonNullable<WorkflowPluginManifest['settingsPages']>
  loadable: boolean
}

export interface PluginHostListResult {
  managedPluginsRoot: string
  plugins: PluginHostPluginRecord[]
  issues: PluginHostIssue[]
}

export interface PluginInstallResult {
  ok: boolean
  managedPluginsRoot: string
  plugin?: PluginHostPluginRecord
  issues: PluginHostIssue[]
}

export interface PluginUninstallResult {
  ok: boolean
  managedPluginsRoot: string
  pluginId: string
  issues: PluginHostIssue[]
}

export interface CreatePluginHostServiceOptions {
  managedPluginsRoot: string
  discoveryRoots?: readonly string[]
  isHostApiVersionCompatible?(hostApiVersion: string): boolean
  currentDaw?: DawTarget
  unzip?(zipPath: string, outputDir: string): Promise<void>
}

export interface PluginHostService {
  getManagedPluginsRoot(): string
  listPlugins(): Promise<PluginHostListResult>
  installFromDirectory(input: { selectedPath: string; overwrite?: boolean }): Promise<PluginInstallResult>
  installFromZip(input: { zipPath: string; overwrite?: boolean }): Promise<PluginInstallResult>
  syncOfficialExtensions(input: { officialExtensionsRoot: string }): Promise<{ ok: true; managedPluginsRoot: string }>
  uninstall(pluginId: string): Promise<PluginUninstallResult>
}

const unzipExec = promisify(execFile)
const officialSeedStateFileName = '.presto-official-extension-seed-state.json'

function sanitizePluginFolderName(pluginId: string): string {
  return pluginId.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function classifyDiscoveryReason(reason: string): PluginIssueCategory {
  if (reason.startsWith('manifest_validation:')) {
    return 'manifest'
  }
  if (reason.startsWith('permission_validation:')) {
    return 'permission'
  }
  if (reason.startsWith('daw_support_validation:')) {
    return 'daw_support'
  }
  return 'discovery'
}

function mapDiscoveryIssue(issue: { reason: string; pluginRoot: string; manifestPath?: string }): PluginHostIssue {
  return {
    category: classifyDiscoveryReason(issue.reason),
    reason: issue.reason,
    pluginRoot: issue.pluginRoot,
    manifestPath: issue.manifestPath,
  }
}

function createLoadIssue(pluginRoot: string, reason: string): PluginHostIssue {
  return {
    category: 'entry_load',
    reason,
    pluginRoot,
  }
}

function toSettingsPages(manifest: WorkflowPluginManifest): NonNullable<WorkflowPluginManifest['settingsPages']> {
  return manifest.settingsPages ?? []
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function defaultUnzip(zipPath: string, outputDir: string): Promise<void> {
  await unzipExec('unzip', ['-qq', '-o', zipPath, '-d', outputDir])
}

async function readOfficialSeedState(managedPluginsRoot: string): Promise<Record<string, string>> {
  const filePath = path.join(managedPluginsRoot, officialSeedStateFileName)

  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

async function writeOfficialSeedState(managedPluginsRoot: string, state: Record<string, string>): Promise<void> {
  const filePath = path.join(managedPluginsRoot, officialSeedStateFileName)
  const payload = JSON.stringify(
    Object.fromEntries(Object.entries(state).sort(([left], [right]) => left.localeCompare(right))),
    null,
    2,
  )
  await writeFile(filePath, `${payload}\n`, 'utf8')
}

export function createPluginHostService(options: CreatePluginHostServiceOptions): PluginHostService {
  const managedPluginsRoot = path.resolve(options.managedPluginsRoot)
  const discoveryRoots = (options.discoveryRoots ?? []).map((root) => path.resolve(root))
  const unzip = options.unzip ?? defaultUnzip

  const runDiscovery = async (roots: readonly string[]) =>
    discoverPlugins({
      roots,
      isHostApiVersionCompatible: options.isHostApiVersionCompatible ?? (() => true),
      currentDaw: options.currentDaw,
    })

  const buildListResult = async (roots: readonly string[]): Promise<PluginHostListResult> => {
    await mkdir(managedPluginsRoot, { recursive: true })
    const result = await runDiscovery(roots)
    const issues: PluginHostIssue[] = result.issues.map(mapDiscoveryIssue)
    const plugins: PluginHostPluginRecord[] = []

    for (const candidate of result.plugins) {
      const manifest = candidate.manifest as WorkflowPluginManifest
      const entryPath = path.join(candidate.pluginRoot, manifest.entry)
      const loaded = await loadPluginModule({ entryPath })
      if (!loaded.ok || !loaded.module) {
        issues.push(createLoadIssue(candidate.pluginRoot, loaded.issue?.reason ?? 'module_load_failed'))
      }
      plugins.push({
        pluginId: manifest.pluginId,
        displayName: manifest.displayName,
        version: manifest.version,
        pluginRoot: candidate.pluginRoot,
        entryPath,
        manifest,
        settingsPages: toSettingsPages(manifest),
        loadable: loaded.ok,
      })
    }

    return {
      managedPluginsRoot,
      plugins,
      issues,
    }
  }

  const installFromDiscoveredRoot = async (
    selectedRoot: string,
    overwrite = false,
  ): Promise<PluginInstallResult> => {
    await mkdir(managedPluginsRoot, { recursive: true })

    const discovered = await runDiscovery([selectedRoot])
    const issues: PluginHostIssue[] = discovered.issues.map(mapDiscoveryIssue)

    if (discovered.plugins.length === 0) {
      return {
        ok: false,
        managedPluginsRoot,
        issues: issues.length > 0 ? issues : [{ category: 'discovery', reason: 'plugin_not_found' }],
      }
    }

    if (discovered.plugins.length > 1) {
      return {
        ok: false,
        managedPluginsRoot,
        issues: [
          {
            category: 'install',
            reason: 'multiple_plugin_candidates_found',
            pluginRoot: path.resolve(selectedRoot),
          },
        ],
      }
    }

    const candidate = discovered.plugins[0]
    const manifest = candidate.manifest as WorkflowPluginManifest
    const entryPath = path.join(candidate.pluginRoot, manifest.entry)
    const loaded = await loadPluginModule({ entryPath })
    if (!loaded.ok || !loaded.module) {
      return {
        ok: false,
        managedPluginsRoot,
        issues: [
          ...issues,
          createLoadIssue(candidate.pluginRoot, loaded.issue?.reason ?? 'module_load_failed'),
        ],
      }
    }

    const destinationRoot = path.join(managedPluginsRoot, sanitizePluginFolderName(manifest.pluginId))
    if (await exists(destinationRoot)) {
      if (!overwrite) {
        return {
          ok: false,
          managedPluginsRoot,
          issues: [{ category: 'install', reason: 'plugin_already_installed', pluginRoot: destinationRoot }],
        }
      }
      await rm(destinationRoot, { recursive: true, force: true })
    }

    await cp(candidate.pluginRoot, destinationRoot, {
      recursive: true,
      force: false,
      errorOnExist: true,
    })

    const verification = await buildListResult([destinationRoot])
    const installed = verification.plugins.find((plugin) => plugin.pluginId === manifest.pluginId)
    if (!installed || !installed.loadable) {
      return {
        ok: false,
        managedPluginsRoot,
        issues: [
          ...verification.issues,
          { category: 'install', reason: 'post_install_verification_failed', pluginRoot: destinationRoot },
        ],
      }
    }

    return {
      ok: true,
      managedPluginsRoot,
      plugin: installed,
      issues: verification.issues,
    }
  }

  return {
    getManagedPluginsRoot(): string {
      return managedPluginsRoot
    },

    async listPlugins(): Promise<PluginHostListResult> {
      const roots = [managedPluginsRoot, ...discoveryRoots]
      return buildListResult(roots)
    },

    async installFromDirectory(input: { selectedPath: string; overwrite?: boolean }): Promise<PluginInstallResult> {
      return installFromDiscoveredRoot(path.resolve(input.selectedPath), input.overwrite ?? false)
    },

    async installFromZip(input: { zipPath: string; overwrite?: boolean }): Promise<PluginInstallResult> {
      const zipPath = path.resolve(input.zipPath)
      const stagingRoot = await mkdtemp(path.join(tmpdir(), 'presto-plugin-install-'))
      const extractRoot = path.join(stagingRoot, 'extracted')
      await mkdir(extractRoot, { recursive: true })

      try {
        await unzip(zipPath, extractRoot)
        return await installFromDiscoveredRoot(extractRoot, input.overwrite ?? false)
      } catch (error) {
        return {
          ok: false,
          managedPluginsRoot,
          issues: [
            {
              category: 'install',
              reason: error instanceof Error ? error.message : 'zip_install_failed',
              pluginRoot: zipPath,
            },
          ],
        }
      } finally {
        await rm(stagingRoot, { recursive: true, force: true })
      }
    },

    async syncOfficialExtensions(input: { officialExtensionsRoot: string }): Promise<{ ok: true; managedPluginsRoot: string }> {
      await mkdir(managedPluginsRoot, { recursive: true })
      const discovered = await runDiscovery([path.resolve(input.officialExtensionsRoot)])
      const seedState = await readOfficialSeedState(managedPluginsRoot)

      for (const candidate of discovered.plugins) {
        const manifest = candidate.manifest as WorkflowPluginManifest
        const destinationRoot = path.join(managedPluginsRoot, sanitizePluginFolderName(manifest.pluginId))
        const destinationManifestPath = path.join(destinationRoot, 'manifest.json')
        const destinationExists = await exists(destinationManifestPath)
        const seededVersion = seedState[manifest.pluginId]

        if (!seededVersion) {
          if (!destinationExists) {
            await cp(candidate.pluginRoot, destinationRoot, {
              recursive: true,
              force: false,
              errorOnExist: true,
            })
          }
          seedState[manifest.pluginId] = manifest.version
          continue
        }

        if (destinationExists && seededVersion !== manifest.version) {
          await rm(destinationRoot, { recursive: true, force: true })
          await cp(candidate.pluginRoot, destinationRoot, {
            recursive: true,
            force: false,
            errorOnExist: true,
          })
          seedState[manifest.pluginId] = manifest.version
        }
      }

      await writeOfficialSeedState(managedPluginsRoot, seedState)
      return { ok: true, managedPluginsRoot }
    },

    async uninstall(pluginId: string): Promise<PluginUninstallResult> {
      const normalizedPluginId = String(pluginId)
      const destinationRoot = path.join(managedPluginsRoot, sanitizePluginFolderName(normalizedPluginId))
      const manifestPath = path.join(destinationRoot, 'manifest.json')

      if (!(await exists(manifestPath))) {
        return {
          ok: false,
          managedPluginsRoot,
          pluginId: normalizedPluginId,
          issues: [
            {
              category: 'install',
              reason: 'plugin_not_installed_in_managed_root',
              pluginRoot: destinationRoot,
            },
          ],
        }
      }

      await rm(destinationRoot, { recursive: true, force: true })

      return {
        ok: true,
        managedPluginsRoot,
        pluginId: normalizedPluginId,
        issues: [],
      }
    },
  }
}
