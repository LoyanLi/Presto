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
    capabilityId: 'daw.automation.splitStereoToMono.execute',
    minVersion: '2025.10.0',
  })
  assert.equal(fileManifest.requiredRuntimeServices, undefined)
  assert.equal(pluginModule.manifest.requiredRuntimeServices, undefined)
  assert.deepEqual(fileManifest.automationItems, pluginModule.manifest.automationItems)
})

test('split stereo automation resolves zh-CN manifest and runner messages inside the plugin', async () => {
  const pluginModule = await loadPluginModule()
  const localizedManifest = pluginModule.resolveManifest({
    requested: 'zh-CN',
    resolved: 'zh-CN',
  })

  assert.equal(localizedManifest.displayName, '立体声拆分单声道')
  assert.equal(localizedManifest.automationItems[0]?.title, '立体声拆分单声道')
  assert.equal(localizedManifest.automationItems[0]?.optionsSchema[0]?.label, '保留声道')
  assert.equal(localizedManifest.automationItems[0]?.optionsSchema[0]?.options[0]?.label, '左声道')

  const result = await pluginModule.runSplitStereoToMono(
    {
      locale: {
        requested: 'zh-CN',
        resolved: 'zh-CN',
      },
      presto: {
        automation: {
          splitStereoToMono: {
            async execute() {
              return {
                items: [{ keptTrackName: 'Lead Vox.L' }],
              }
            },
          },
        },
      },
    },
    { keepChannel: 'left' },
  )

  assert.equal(result.steps[0]?.message, '立体声拆分单声道自动化已完成。')
  assert.equal(result.summary, '自动化已完成。保留的轨道：Lead Vox.L')
})
