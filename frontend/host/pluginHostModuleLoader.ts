import React from 'react'
import { convertFileSrc, isTauri } from '@tauri-apps/api/core'

import type { WorkflowPluginModule } from '@presto/contracts'
import type { PluginRuntimeIssue } from '@presto/sdk-runtime/clients/plugins'
import { toRuntimeAssetUrl, toRuntimeModuleUrl } from './pluginHostAssetUrls'

export type PluginModuleNamespace = WorkflowPluginModule & Record<string, unknown>

function extractStaticModuleImports(sourceText: string): string[] {
  const importMatches = sourceText.matchAll(/import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g)
  return Array.from(new Set(Array.from(importMatches, (match) => match[1]).filter(Boolean)))
}

async function inspectModuleImportFailure(entryPath: string, importUrl: string, error: unknown): Promise<string> {
  const diagnostics: string[] = []
  const message = error instanceof Error ? error.message : 'module_import_failed'
  diagnostics.push(message)
  diagnostics.push(`entryPath: ${entryPath}`)
  diagnostics.push(`importUrl: ${importUrl}`)

  if (isTauri()) {
    diagnostics.push(`assetUrl: ${convertFileSrc(entryPath)}`)
  }

  if (typeof fetch === 'function') {
    try {
      const response = await fetch(importUrl)
      diagnostics.push(`fetch.ok: ${response.ok}`)
      diagnostics.push(`fetch.status: ${response.status}`)
      diagnostics.push(`fetch.contentType: ${response.headers.get('content-type') ?? 'unknown'}`)
      const sourceText = await response.text()
      diagnostics.push(`fetch.length: ${sourceText.length}`)
      const staticImports = extractStaticModuleImports(sourceText)
      if (staticImports.length > 0) {
        diagnostics.push(`entryImports: ${staticImports.join(', ')}`)
      }
    } catch (fetchError) {
      diagnostics.push(`fetchError: ${fetchError instanceof Error ? fetchError.message : 'unknown_fetch_error'}`)
    }
  }

  return diagnostics.join('\n')
}

export async function loadRendererPluginModule(entryPath: string): Promise<{
  ok: boolean
  module?: PluginModuleNamespace
  issue?: PluginRuntimeIssue
}> {
  const importUrl = toRuntimeModuleUrl(entryPath)

  try {
    const moduleNamespace = (await import(/* @vite-ignore */ importUrl)) as PluginModuleNamespace
    if (typeof moduleNamespace.activate !== 'function' || typeof moduleNamespace.manifest !== 'object') {
      return {
        ok: false,
        issue: {
          category: 'entry_load',
          reason: 'module_does_not_export_workflow_plugin_module',
        },
      }
    }

    return {
      ok: true,
      module: moduleNamespace,
    }
  } catch (error) {
    return {
      ok: false,
      issue: {
        category: 'entry_load',
        reason: await inspectModuleImportFailure(entryPath, importUrl, error),
      },
    }
  }
}

export function ensurePluginStyle(pluginId: string, styleEntryPath: string | undefined, pluginRoot: string): void {
  if (!styleEntryPath) {
    return
  }

  const styleId = `presto-plugin-style:${pluginId}`
  if (document.getElementById(styleId)) {
    return
  }

  const link = document.createElement('link')
  link.id = styleId
  link.rel = 'stylesheet'
  link.href = toRuntimeAssetUrl(`${pluginRoot}/${styleEntryPath}`.replace(/\/+/g, '/'))
  document.head.append(link)
}

export function renderPluginLoadFailurePage(title: string, message: string): () => React.ReactElement {
  return () =>
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gap: 12,
          padding: 24,
          borderRadius: 24,
          border: '1px solid rgba(188, 195, 208, 0.9)',
          background: 'rgba(244, 246, 251, 0.96)',
        },
      },
      React.createElement(
        'div',
        { style: { display: 'grid', gap: 6 } },
        React.createElement('h2', { style: { margin: 0, fontSize: 20, fontWeight: 600 } }, title),
        React.createElement(
          'p',
          { style: { margin: 0, fontSize: 14, lineHeight: 1.5, color: 'rgba(80, 88, 102, 0.95)' } },
          'This workflow failed to load in the renderer.',
        ),
      ),
      React.createElement(
        'pre',
        {
          style: {
            margin: 0,
            padding: 12,
            borderRadius: 16,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            lineHeight: 1.5,
            background: 'rgba(255, 255, 255, 0.92)',
          },
        },
        message,
      ),
    )
}
