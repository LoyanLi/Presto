import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let modulePromise = null

async function loadHostShellHelpersModule() {
  if (!modulePromise) {
    modulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/hostShellHelpers.ts',
      tempPrefix: '.tmp-host-shell-helpers-test-',
      outfileName: 'host-shell-helpers.mjs',
      jsx: false,
    })
  }

  return modulePromise
}

test('isPluginAvailableForSnapshot rejects plugins whose adapter module requirements are not satisfied', async () => {
  const { isPluginAvailableForSnapshot } = await loadHostShellHelpersModule()

  assert.equal(
    isPluginAvailableForSnapshot(
      {
        pluginId: 'official.export-workflow',
        extensionType: 'workflow',
        displayName: 'Export Workflow',
        version: '1.0.0',
        origin: 'official',
        status: 'ready',
        enabled: true,
        supportedDaws: ['pro_tools'],
        adapterModuleRequirements: [{ moduleId: 'ptsl', minVersion: '2025.10.0' }],
      },
      {
        targetDaw: 'pro_tools',
        adapterVersion: '2025.09.0',
        hostVersion: '0.3.5',
        modules: [{ moduleId: 'ptsl', version: '2025.09.0' }],
        capabilities: [],
      },
    ),
    false,
  )
})

test('isPluginAvailableForSnapshot rejects plugins whose capability requirements are not satisfied', async () => {
  const { isPluginAvailableForSnapshot } = await loadHostShellHelpersModule()

  assert.equal(
    isPluginAvailableForSnapshot(
      {
        pluginId: 'official.export-workflow',
        extensionType: 'workflow',
        displayName: 'Export Workflow',
        version: '1.0.0',
        origin: 'official',
        status: 'ready',
        enabled: true,
        supportedDaws: ['pro_tools'],
        capabilityRequirements: [{ capabilityId: 'export.start', minVersion: '2025.10.0' }],
      },
      {
        targetDaw: 'pro_tools',
        adapterVersion: '2025.09.0',
        hostVersion: '0.3.5',
        modules: [],
        capabilities: [{ capabilityId: 'export.start', moduleId: 'ptsl', version: '2025.09.0' }],
      },
    ),
    false,
  )
})

test('isPluginAvailableForSnapshot keeps plugins available when daw support and minimum versions are satisfied', async () => {
  const { isPluginAvailableForSnapshot } = await loadHostShellHelpersModule()

  assert.equal(
    isPluginAvailableForSnapshot(
      {
        pluginId: 'official.export-workflow',
        extensionType: 'workflow',
        displayName: 'Export Workflow',
        version: '1.0.0',
        origin: 'official',
        status: 'ready',
        enabled: true,
        supportedDaws: ['pro_tools'],
        adapterModuleRequirements: [{ moduleId: 'ptsl', minVersion: '2025.10.0' }],
        capabilityRequirements: [{ capabilityId: 'export.start', minVersion: '2025.10.0' }],
      },
      {
        targetDaw: 'pro_tools',
        adapterVersion: '2025.10.0',
        hostVersion: '0.3.5',
        modules: [{ moduleId: 'ptsl', version: '2025.10.1' }],
        capabilities: [{ capabilityId: 'export.start', moduleId: 'ptsl', version: '2025.10.0' }],
      },
    ),
    true,
  )
})
