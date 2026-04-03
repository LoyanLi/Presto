import { access, readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { type DawTarget, type PublicCapabilityId } from '../../../packages/contracts/src'
import { FORMAL_PUBLIC_CAPABILITY_IDS } from './runtimeServices'
import { validateDawSupport } from '../validation/validateDawSupport'
import { validateManifest } from '../validation/validateManifest'
import { validatePermissions } from '../validation/validatePermissions'

export interface PluginDiscoveryCandidate {
  pluginRoot: string
  manifestPath: string
  manifest: unknown
}

export interface PluginDiscoveryIssue {
  pluginRoot: string
  manifestPath?: string
  reason: string
}

export interface PluginDiscoveryResult {
  plugins: PluginDiscoveryCandidate[]
  issues: PluginDiscoveryIssue[]
}

export interface DiscoverPluginsOptions {
  roots: readonly string[]
  isHostApiVersionCompatible?(hostApiVersion: string): boolean
  currentDaw?: DawTarget
}

const MANIFEST_FILE_NAME = 'manifest.json'
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const readManifest = async (manifestPath: string): Promise<unknown> => {
  const raw = await readFile(manifestPath, 'utf8')
  return JSON.parse(raw) as unknown
}

const readPluginCandidate = async (pluginRoot: string): Promise<PluginDiscoveryCandidate | PluginDiscoveryIssue> => {
  const manifestPath = join(pluginRoot, MANIFEST_FILE_NAME)

  if (!(await pathExists(manifestPath))) {
    return {
      pluginRoot,
      manifestPath,
      reason: 'manifest_not_found',
    }
  }

  try {
    const manifest = await readManifest(manifestPath)
    return {
      pluginRoot,
      manifestPath,
      manifest,
    }
  } catch (error) {
    return {
      pluginRoot,
      manifestPath,
      reason: error instanceof Error ? error.message : 'manifest_read_failed',
    }
  }
}

const collectPluginRoots = async (root: string): Promise<string[]> => {
  const resolvedRoot = resolve(root)

  if (!(await pathExists(resolvedRoot))) {
    return []
  }

  const rootStat = await stat(resolvedRoot)
  if (!rootStat.isDirectory()) {
    return []
  }

  const directManifest = join(resolvedRoot, MANIFEST_FILE_NAME)
  if (await pathExists(directManifest)) {
    return [resolvedRoot]
  }

  const entries = await readdir(resolvedRoot, { withFileTypes: true })
  const pluginRoots: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const pluginRoot = join(resolvedRoot, entry.name)
    if (await pathExists(join(pluginRoot, MANIFEST_FILE_NAME))) {
      pluginRoots.push(pluginRoot)
    }
  }

  return pluginRoots
}

function mapValidationIssues(
  pluginRoot: string,
  manifestPath: string,
  phase: 'manifest_validation' | 'permission_validation' | 'daw_support_validation',
  validationIssues: readonly { field: string; reason: string }[],
): PluginDiscoveryIssue[] {
  return validationIssues.map((issue) => ({
    pluginRoot,
    manifestPath,
    reason: `${phase}:${issue.field}:${issue.reason}`,
  }))
}

export async function discoverPlugins(options: DiscoverPluginsOptions): Promise<PluginDiscoveryResult> {
  const plugins: PluginDiscoveryCandidate[] = []
  const issues: PluginDiscoveryIssue[] = []
  const visitedRoots = new Set<string>()
  const isHostApiVersionCompatible = options.isHostApiVersionCompatible ?? (() => true)

  for (const root of options.roots) {
    const pluginRoots = await collectPluginRoots(root)

    if (pluginRoots.length === 0) {
      issues.push({
        pluginRoot: resolve(root),
        reason: 'plugin_root_not_found_or_empty',
      })
      continue
    }

    for (const pluginRoot of pluginRoots) {
      if (visitedRoots.has(pluginRoot)) {
        continue
      }

      visitedRoots.add(pluginRoot)
      const candidate = await readPluginCandidate(pluginRoot)

      if ('reason' in candidate) {
        issues.push(candidate)
        continue
      }

      const manifestValidation = await validateManifest({
        manifest: candidate.manifest,
        pluginRoot: candidate.pluginRoot,
        isHostApiVersionCompatible,
      })
      if (!manifestValidation.ok || !manifestValidation.manifest) {
        issues.push(
          ...mapValidationIssues(
            candidate.pluginRoot,
            candidate.manifestPath,
            'manifest_validation',
            manifestValidation.issues,
          ),
        )
        continue
      }

      const permissionValidation = validatePermissions({
        manifest: manifestValidation.manifest,
        allowedCapabilities: FORMAL_PUBLIC_CAPABILITY_IDS as readonly PublicCapabilityId[],
      })
      if (!permissionValidation.ok) {
        issues.push(
          ...mapValidationIssues(
            candidate.pluginRoot,
            candidate.manifestPath,
            'permission_validation',
            permissionValidation.issues,
          ),
        )
        continue
      }

      if (options.currentDaw) {
        const dawSupportValidation = validateDawSupport({
          manifest: manifestValidation.manifest,
          currentDaw: options.currentDaw,
        })
        if (!dawSupportValidation.ok) {
          issues.push(
            ...mapValidationIssues(
              candidate.pluginRoot,
              candidate.manifestPath,
              'daw_support_validation',
              dawSupportValidation.issues,
            ),
          )
          continue
        }
      }

      plugins.push({
        ...candidate,
        manifest: manifestValidation.manifest,
      })
    }
  }

  return { plugins, issues }
}
