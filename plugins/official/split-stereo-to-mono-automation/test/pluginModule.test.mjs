import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

let pluginModulePromise = null

async function loadPluginModule() {
  if (!pluginModulePromise) {
    const entryUrl = new URL('../dist/entry.mjs', import.meta.url)
    entryUrl.searchParams.set('test', String(Date.now()))
    pluginModulePromise = import(entryUrl.href)
  }

  return pluginModulePromise
}

test('split stereo automation manifest stays aligned with dist entry essentials', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.deepEqual(fileManifest.requiredCapabilities, pluginModule.manifest.requiredCapabilities)
  assert.deepEqual(fileManifest.adapterModuleRequirements, pluginModule.manifest.adapterModuleRequirements)
  assert.deepEqual(fileManifest.capabilityRequirements, pluginModule.manifest.capabilityRequirements)
  assert.equal(Array.isArray(fileManifest.adapterModuleRequirements), true)
  assert.equal(fileManifest.adapterModuleRequirements.length, 1)
  assert.deepEqual(fileManifest.adapterModuleRequirements[0], {
    moduleId: 'automation',
    minVersion: '2025.10.0',
  })
  assert.equal(Array.isArray(fileManifest.capabilityRequirements), true)
  assert.equal(fileManifest.capabilityRequirements.length, 1)
  assert.deepEqual(fileManifest.capabilityRequirements[0], {
    capabilityId: 'automation.splitStereoToMono.execute',
    minVersion: '2025.10.0',
  })
  assert.deepEqual(fileManifest.automationItems, pluginModule.manifest.automationItems)
})
