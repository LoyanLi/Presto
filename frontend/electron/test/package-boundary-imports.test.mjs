import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

const sourceFiles = [
  'frontend/desktop/runtimeBridge.ts',
  'frontend/desktop/renderHostShellApp.tsx',
  'frontend/electron/runtime/runtimeBridge.ts',
  'frontend/runtime/appLogStore.mjs',
  'frontend/runtime/automationRuntime.mjs',
  'frontend/runtime/backendSupervisor.ts',
  'frontend/runtime/macAccessibilityRuntime.mjs',
  'frontend/runtime/mobileProgressRuntimeController.mjs',
  'frontend/runtime/mobileProgressServer.mjs',
  'frontend/runtime/mobileProgressServer.ts',
  'frontend/runtime/pluginHostService.ts',
  'frontend/tauri/runtimeBridge.ts',
  'frontend/tauri/renderer.tsx',
  'frontend/sidecar/main.ts',
  'frontend/sidecar/resourcePaths.ts',
  'frontend/host/DeveloperCapabilityConsole.tsx',
  'frontend/host/HostDeveloperSurface.tsx',
  'frontend/host/HostHomeSurface.tsx',
  'frontend/host/HostShellApp.tsx',
  'frontend/host/automation/AutomationSurface.tsx',
  'frontend/host/automation/cards/SplitStereoToMonoCard.tsx',
  'frontend/host/developerCapabilityInventory.ts',
  'frontend/host/hooks/useDawStatusPolling.ts',
  'frontend/host/pluginHostRuntime.ts',
  'frontend/host/pluginHostTypes.ts',
  'frontend/host/settings/GeneralSettingsPage.tsx',
  'frontend/host/settings/workflowSettingsFields.tsx',
  'frontend/host/shellPreferences.ts',
  'host-plugin-runtime/src/discovery/discoverPlugins.ts',
  'host-plugin-runtime/src/installation/pluginManagement.ts',
  'host-plugin-runtime/src/lifecycle/activatePlugin.ts',
  'host-plugin-runtime/src/lifecycle/deactivatePlugin.ts',
  'host-plugin-runtime/src/loading/loadPluginModule.ts',
  'host-plugin-runtime/src/mounting/mountPluginCommands.ts',
  'host-plugin-runtime/src/mounting/mountPluginNavigation.ts',
  'host-plugin-runtime/src/mounting/mountPluginPages.tsx',
  'host-plugin-runtime/src/permissions/createPluginRuntime.ts',
  'host-plugin-runtime/src/permissions/guardCapabilityAccess.ts',
  'host-plugin-runtime/src/validation/validateDawSupport.ts',
  'host-plugin-runtime/src/validation/validateManifest.ts',
  'host-plugin-runtime/src/validation/validatePermissions.ts',
  'packages/sdk-core/src/createPrestoClient.ts',
  'packages/sdk-core/src/index.ts',
  'packages/sdk-core/src/transport.ts',
  'packages/sdk-core/src/clients/automation.ts',
  'packages/sdk-core/src/clients/clip.ts',
  'packages/sdk-core/src/clients/config.ts',
  'packages/sdk-core/src/clients/daw.ts',
  'packages/sdk-core/src/clients/export.ts',
  'packages/sdk-core/src/clients/import.ts',
  'packages/sdk-core/src/clients/jobs.ts',
  'packages/sdk-core/src/clients/session.ts',
  'packages/sdk-core/src/clients/system.ts',
  'packages/sdk-core/src/clients/track.ts',
  'packages/sdk-core/src/clients/transport.ts',
]

test('business code consumes shared packages only through @presto package names', async () => {
  const violations = []

  for (const relativePath of sourceFiles) {
    const source = await readFile(path.join(repoRoot, relativePath), 'utf8')

    if (/from ['"](\.\.\/)+packages\//.test(source)) {
      violations.push(`${relativePath}:relative-packages-import`)
    }

    if (/from ['"](\.\.\/)+contracts(?:['"/])/.test(source)) {
      violations.push(`${relativePath}:relative-contracts-import`)
    }

    if (/from ['"][^'"]*host-plugin-runtime\/src(?:\/|['"])/.test(source)) {
      violations.push(`${relativePath}:host-plugin-runtime-internal-import`)
    }
  }

  assert.deepEqual(violations, [])
})
