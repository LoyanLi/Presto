import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let runtimeBridgePromise = null

async function loadRuntimeBridge() {
  if (!runtimeBridgePromise) {
    runtimeBridgePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/desktop/runtimeBridge.ts',
      tempPrefix: '.tmp-runtime-plugins-test-',
      outfileName: 'runtime-bridge.mjs',
    })
  }

  return runtimeBridgePromise
}

test('shared desktop runtime bridge exposes plugin management inside PrestoRuntime', async () => {
  const { createDesktopRuntimeBridge } = await loadRuntimeBridge()
  const calls = []
  const runtime = createDesktopRuntimeBridge(
    {
      app: {
        getVersion: 'app.version.get',
        getLatestRelease: 'app.release.get-latest',
        viewLog: 'app.log.view',
      },
      automation: {
        listDefinitions: 'automation.definition.list',
        runDefinition: 'automation.definition.run',
      },
      backend: {
        getStatus: 'backend.status.get',
        getDawAdapterSnapshot: 'backend.daw.snapshot.get',
        restart: 'backend.process.restart',
        setDawTarget: 'backend.daw.target.set',
        setDeveloperMode: 'backend.developer-mode.set',
        invokeCapability: 'backend.capability.invoke',
      },
      dialog: {
        open: 'dialog.open',
      },
      shell: {
        openPath: 'shell.path.open',
        openExternal: 'shell.external.open',
      },
      fs: {
        readFile: 'fs.file.read',
        writeFile: 'fs.file.write',
        ensureDir: 'fs.dir.ensure',
        getHomePath: 'fs.home-path.get',
        exists: 'fs.path.exists',
        stat: 'fs.path.stat',
        readdir: 'fs.dir.read',
        mkdir: 'fs.dir.make',
        unlink: 'fs.file.unlink',
        rmdir: 'fs.dir.remove',
        deleteFile: 'fs.file.delete',
      },
      plugins: {
        list: 'plugins.catalog.list',
        installFromDirectory: 'plugins.catalog.install-directory',
        installFromZip: 'plugins.catalog.install-zip',
        uninstall: 'plugins.catalog.uninstall',
      },
      window: {
        toggleAlwaysOnTop: 'window.always-on-top.toggle',
        getAlwaysOnTop: 'window.always-on-top.get',
        setAlwaysOnTop: 'window.always-on-top.set',
      },
      mobileProgress: {
        createSession: 'mobile-progress.session.create',
        closeSession: 'mobile-progress.session.close',
        getViewUrl: 'mobile-progress.session.view-url.get',
        updateSession: 'mobile-progress.session.update',
      },
      macAccessibility: {
        preflight: 'mac-accessibility.preflight',
        runScript: 'mac-accessibility.script.run',
        runFile: 'mac-accessibility.file.run',
      },
    },
    (operation, ...args) => {
      calls.push([operation, ...args])
      return Promise.resolve({ ok: true, managedPluginsRoot: '/tmp/extensions', plugins: [], issues: [] })
    },
  )

  await runtime.plugins.list()
  await runtime.plugins.installFromDirectory(true)
  await runtime.plugins.installFromZip(false)
  await runtime.plugins.uninstall('official.export-workflow')

  assert.deepEqual(calls, [
    ['plugins.catalog.list'],
    ['plugins.catalog.install-directory', true],
    ['plugins.catalog.install-zip', false],
    ['plugins.catalog.uninstall', 'official.export-workflow'],
  ])
})
