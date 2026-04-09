import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  const calls = []
  const runtime = createDesktopRuntimeBridge(
    {
      app: {
        getVersion: 'app.version.get',
        checkForUpdates: 'app.release.check',
        viewLog: 'app.log.view',
      },
      automation: {
        listDefinitions: 'automation.definition.list',
        runDefinition: 'automation.definition.run',
      },
      backend: {
        getStatus: 'backend.status.get',
        listCapabilities: 'backend.capabilities.list',
        getDawAdapterSnapshot: 'backend.daw-adapter.snapshot.get',
        restart: 'backend.lifecycle.restart',
        setDawTarget: 'backend.daw-target.set',
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
        mkdir: 'fs.dir.create',
        unlink: 'fs.file.unlink',
        rmdir: 'fs.dir.remove',
        deleteFile: 'fs.file.delete',
      },
      plugins: {
        list: 'plugins.catalog.list',
        installFromDirectory: 'plugins.install.directory',
        installFromZip: 'plugins.install.zip',
        setEnabled: 'plugins.set-enabled',
        uninstall: 'plugins.uninstall',
      },
      window: {
        toggleAlwaysOnTop: 'window.always-on-top.toggle',
        getAlwaysOnTop: 'window.always-on-top.get',
        setAlwaysOnTop: 'window.always-on-top.set',
      },
      mobileProgress: {
        createSession: 'mobile-progress.session.create',
        closeSession: 'mobile-progress.session.close',
        getViewUrl: 'mobile-progress.view-url.get',
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
  await runtime.backend.listCapabilities()
  await runtime.app.checkForUpdates({
    currentVersion: packageJson.version,
    includePrerelease: true,
  })
  await runtime.plugins.installFromDirectory(true)
  await runtime.plugins.installFromZip(false)
  await runtime.plugins.setEnabled('official.export-workflow', false)
  await runtime.plugins.uninstall('official.export-workflow')

  assert.deepEqual(calls, [
    ['plugins.catalog.list'],
    ['backend.capabilities.list'],
    ['app.release.check', { currentVersion: packageJson.version, includePrerelease: true }],
    ['plugins.install.directory', true],
    ['plugins.install.zip', false],
    ['plugins.set-enabled', 'official.export-workflow', false],
    ['plugins.uninstall', 'official.export-workflow'],
  ])
})
