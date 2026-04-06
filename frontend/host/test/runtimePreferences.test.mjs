import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let runtimePreferencesModulePromise = null

async function loadRuntimePreferencesModule() {
  if (!runtimePreferencesModulePromise) {
    runtimePreferencesModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-runtime-preferences-test-'))
      const outfile = path.join(tempDir, 'runtimePreferences.mjs')
      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
        await esbuild.build({
          entryPoints: [path.join(repoRoot, 'frontend/host/runtimePreferences.ts')],
          bundle: true,
          format: 'esm',
          platform: 'node',
          target: 'node20',
          outfile,
          loader: {
            '.ts': 'ts',
            '.tsx': 'tsx',
          },
        })

        return await import(pathToFileURL(outfile).href)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })()
  }

  return runtimePreferencesModulePromise
}

test('host runtime preferences derive language, developer mode, and daw target from config payload', async () => {
  const { getHostShellPreferencesFromConfig } = await loadRuntimePreferencesModule()

  assert.deepEqual(
    getHostShellPreferencesFromConfig({
      uiPreferences: {
        logsCollapsedByDefault: true,
        followSystemTheme: true,
        developerModeEnabled: false,
      },
      hostPreferences: {
        language: 'zh-CN',
        dawTarget: 'pro_tools',
        includePrereleaseUpdates: true,
      },
    }),
    {
      language: 'zh-CN',
      developerMode: false,
      dawTarget: 'pro_tools',
      includePrereleaseUpdates: true,
    },
  )
})

test('host runtime preferences write shell preferences back into config without dropping unrelated fields', async () => {
  const { applyHostShellPreferencesToConfig } = await loadRuntimePreferencesModule()

  assert.deepEqual(
    applyHostShellPreferencesToConfig(
      {
        categories: [{ id: 'dx', name: 'DX' }],
        silenceProfile: { thresholdDb: -40, minStripMs: 50, minSilenceMs: 250, startPadMs: 0, endPadMs: 0 },
        aiNaming: {
          enabled: false,
          baseUrl: '',
          model: '',
          timeoutSeconds: 30,
          keychainService: 'openai',
          keychainAccount: 'api_key',
        },
        uiPreferences: {
          logsCollapsedByDefault: true,
          followSystemTheme: true,
          developerModeEnabled: true,
        },
        hostPreferences: {
          language: 'system',
          dawTarget: 'pro_tools',
          includePrereleaseUpdates: false,
        },
      },
      {
        language: 'en',
        developerMode: false,
        dawTarget: 'pro_tools',
        includePrereleaseUpdates: true,
      },
    ),
    {
      categories: [{ id: 'dx', name: 'DX' }],
      silenceProfile: { thresholdDb: -40, minStripMs: 50, minSilenceMs: 250, startPadMs: 0, endPadMs: 0 },
      aiNaming: {
        enabled: false,
        baseUrl: '',
        model: '',
        timeoutSeconds: 30,
        keychainService: 'openai',
        keychainAccount: 'api_key',
      },
      uiPreferences: {
        logsCollapsedByDefault: true,
        followSystemTheme: true,
        developerModeEnabled: false,
      },
      hostPreferences: {
        language: 'en',
        dawTarget: 'pro_tools',
        includePrereleaseUpdates: true,
      },
    },
  )
})

test('HostShellApp hydrates and persists shell preferences through backend config instead of local-only storage', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostShellApp.tsx'), 'utf8')

  assert.match(source, /developerPresto\.config\.get\(\)/)
  assert.match(source, /developerPresto\.config\.update\(/)
})
