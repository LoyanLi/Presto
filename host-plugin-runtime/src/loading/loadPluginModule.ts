import type { WorkflowPluginModule } from '../../../packages/contracts/src'

export interface PluginModuleLoadIssue {
  entryPath: string
  reason: string
}

export interface PluginModuleLoadResult {
  ok: boolean
  module?: WorkflowPluginModule
  issue?: PluginModuleLoadIssue
}

export interface LoadPluginModuleInput {
  entryPath?: string
  entryUrl?: string
  importModule?(specifier: string): Promise<unknown>
}

const isWorkflowPluginModule = (value: unknown): value is WorkflowPluginModule => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const module = value as Partial<WorkflowPluginModule> & Record<string, unknown>
  return (
    typeof module.manifest === 'object' &&
    module.manifest !== null &&
    typeof module.activate === 'function'
  )
}

function isAbsoluteUrlSpecifier(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
}

async function resolveImportSpecifier(input: LoadPluginModuleInput): Promise<string | null> {
  if (typeof input.entryUrl === 'string' && input.entryUrl.trim()) {
    return input.entryUrl
  }

  if (typeof input.entryPath !== 'string' || !input.entryPath.trim()) {
    return null
  }

  if (isAbsoluteUrlSpecifier(input.entryPath)) {
    return input.entryPath
  }

  const { pathToFileURL } = await import('node:url')
  return pathToFileURL(input.entryPath).href
}

export async function loadPluginModule(input: LoadPluginModuleInput): Promise<PluginModuleLoadResult> {
  const entryPath = input.entryPath ?? input.entryUrl ?? ''
  const importModule = input.importModule ?? ((specifier: string) => import(specifier))

  const importSpecifier = await resolveImportSpecifier(input)
  if (!importSpecifier) {
    return {
      ok: false,
      issue: {
        entryPath,
        reason: 'entry_path_or_url_required',
      },
    }
  }

  try {
    const moduleNamespace = await importModule(importSpecifier)

    if (isWorkflowPluginModule(moduleNamespace)) {
      return {
        ok: true,
        module: moduleNamespace,
      }
    }

    return {
      ok: false,
      issue: {
        entryPath,
        reason: 'module_does_not_export_workflow_plugin_module',
      },
    }
  } catch (error) {
    return {
      ok: false,
      issue: {
        entryPath,
        reason: error instanceof Error ? error.message : 'module_import_failed',
      },
    }
  }
}
