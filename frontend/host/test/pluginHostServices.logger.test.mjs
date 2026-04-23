import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let pluginHostServicesPromise = null

async function loadPluginHostServices() {
  if (!pluginHostServicesPromise) {
    pluginHostServicesPromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/pluginHostServices.ts',
      tempPrefix: '.tmp-plugin-host-services-test-',
      outfileName: 'plugin-host-services.mjs',
    })
  }

  return pluginHostServicesPromise
}

test('createHostPluginLogger forwards execution entries into the runtime app log sink', async () => {
  const { createHostPluginLogger } = await loadPluginHostServices()
  const writes = []
  const logger = createHostPluginLogger(
    {
      app: {
        async writeExecutionLog(entry) {
          writes.push(entry)
        },
      },
    },
    {
      source: 'plugin.host',
      pluginId: 'installed.audio-tools',
      requestId: 'req-plugin-1',
    },
  )

  logger.info('tool finished', {
    jobId: 'job-tool-1',
    capability: 'tool.run',
    nested: { ok: true },
  })

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.deepEqual(writes, [
    {
      level: 'info',
      source: 'plugin.host',
      event: 'plugin.log',
      message: 'tool finished',
      pluginId: 'installed.audio-tools',
      requestId: 'req-plugin-1',
      data: {
        jobId: 'job-tool-1',
        capability: 'tool.run',
        nested: { ok: true },
      },
    },
  ])
})

test('createHostPluginLogger suppresses immediate duplicate plugin activation entries', async () => {
  const { createHostPluginLogger } = await loadPluginHostServices()
  const writes = []
  const logger = createHostPluginLogger(
    {
      app: {
        async writeExecutionLog(entry) {
          writes.push(entry)
        },
      },
    },
    {
      source: 'plugin.host',
      pluginId: 'official.export-workflow',
    },
  )

  logger.info('[official.export-workflow] Export workflow plugin activated.', {
    pluginId: 'official.export-workflow',
  })
  logger.info('[official.export-workflow] Export workflow plugin activated.', {
    pluginId: 'official.export-workflow',
  })

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(writes.length, 1)
  assert.equal(writes[0]?.message, '[official.export-workflow] Export workflow plugin activated.')
})
