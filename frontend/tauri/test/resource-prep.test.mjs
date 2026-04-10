import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, readdir } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

async function exists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath))
    return true
  } catch {
    return false
  }
}

async function listDirectoriesNamed(relativeRoot, directoryName) {
  const matches = []
  const pending = [path.join(repoRoot, relativeRoot)]

  while (pending.length > 0) {
    const currentPath = pending.pop()
    const entries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const entryPath = path.join(currentPath, entry.name)

      if (entry.name === directoryName) {
        matches.push(path.relative(repoRoot, entryPath))
        continue
      }

      pending.push(entryPath)
    }
  }

  return matches.sort()
}

async function listFilesMatching(relativeRoot, matcher) {
  const matches = []
  const pending = [path.join(repoRoot, relativeRoot)]

  while (pending.length > 0) {
    const currentPath = pending.pop()
    const entries = await readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        pending.push(entryPath)
        continue
      }

      if (matcher(entry.name)) {
        matches.push(path.relative(repoRoot, entryPath))
      }
    }
  }

  return matches.sort()
}

test('prepared tauri runtime resources keep only packaged backend and plugin files', async () => {
  const sidecarEntry = 'src-tauri/resources/build/sidecar/main.mjs'
  const sidecarNode = 'src-tauri/resources/build/sidecar/node'
  const backendMain = 'src-tauri/resources/backend/presto/main_api.py'
  const backendPython = 'src-tauri/resources/backend/python/bin/python3'
  const backendPythonConfig = 'src-tauri/resources/backend/python/pyvenv.cfg'
  const backendPythonPip = 'src-tauri/resources/backend/python/bin/pip'
  const backendPythonPip3 = 'src-tauri/resources/backend/python/bin/pip3'
  const backendPythonPip313 = 'src-tauri/resources/backend/python/bin/pip3.13'
  const backendPythonActivate = 'src-tauri/resources/backend/python/bin/activate'
  const backendPythonActivateCsh = 'src-tauri/resources/backend/python/bin/activate.csh'
  const backendPythonActivateFish = 'src-tauri/resources/backend/python/bin/activate.fish'
  const backendPythonActivatePs1 = 'src-tauri/resources/backend/python/bin/Activate.ps1'
  const backendPythonPipPackage = 'src-tauri/resources/backend/python/lib/python3.13/site-packages/pip'
  const backendPythonPipDistInfo = 'src-tauri/resources/backend/python/lib/python3.13/site-packages/pip-26.0.1.dist-info'
  const backendPythonCache = 'src-tauri/resources/backend/python/lib/python3.13/site-packages/__pycache__'
  const backendFrameworkStdlibTest = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/test'
  const backendFrameworkStdlibConfig = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/config-3.13-darwin'
  const backendFrameworkStdlibIdlelib = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/idlelib'
  const backendFrameworkStdlibTkinter = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/tkinter'
  const backendFrameworkStdlibTurtledemo = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/turtledemo'
  const backendFrameworkStdlibHello = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/__phello__'
  const backendFrameworkStdlibEnsurepip = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/ensurepip'
  const backendFrameworkStdlibVenv = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/venv'
  const backendFrameworkStdlibUnittest = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/unittest'
  const backendFrameworkStdlibPydocData = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/pydoc_data'
  const backendFrameworkStdlibLib2to3 = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib2to3'
  const backendPythonCaches = await listDirectoriesNamed(
    'src-tauri/resources/backend/python/lib/python3.13/site-packages',
    '__pycache__',
  )
  const backendAllPythonCaches = await listDirectoriesNamed('src-tauri/resources/backend/python', '__pycache__')
  const backendPythonCompiledFiles = await listFilesMatching(
    'src-tauri/resources/backend/python',
    (name) => name.endsWith('.pyc') || name.endsWith('.pyo'),
  )
  const backendPythonTypingStubs = await listFilesMatching(
    'src-tauri/resources/backend/python',
    (name) => name.endsWith('.pyi'),
  )
  const backendPytestBinary = 'src-tauri/resources/backend/python/bin/pytest'
  const backendFlake8Binary = 'src-tauri/resources/backend/python/bin/flake8'
  const backendTests = 'src-tauri/resources/backend/presto/tests'
  const backendCache = 'src-tauri/resources/backend/presto/__pycache__'
  const pluginManifest = 'src-tauri/resources/plugins/official/import-workflow/manifest.json'
  const pluginDist = 'src-tauri/resources/plugins/official/import-workflow/dist/entry.mjs'
  const pluginTests = 'src-tauri/resources/plugins/official/import-workflow/test'
  const frontendResourcesRoot = 'src-tauri/resources/frontend'
  const legacyAutomationDefinition = 'src-tauri/resources/frontend/runtime/automation/definitions/splitStereoToMono.json'
  const legacyRuntimeResourcesRoot = 'build/runtime-resources'

  assert.equal(await exists(sidecarEntry), false)
  assert.equal(await exists(sidecarNode), false)
  assert.equal(await exists(backendMain), true)
  assert.equal(await exists(backendPython), true)
  assert.equal(await exists(backendPythonConfig), true)
  assert.equal(await exists(pluginManifest), true)
  assert.equal(await exists(pluginDist), true)
  assert.equal(await exists(frontendResourcesRoot), false)
  assert.equal(await exists(legacyAutomationDefinition), false)
  assert.equal(await exists(backendTests), false)
  assert.equal(await exists(backendCache), false)
  assert.equal(await exists(backendPythonPip), false)
  assert.equal(await exists(backendPythonPip3), false)
  assert.equal(await exists(backendPythonPip313), false)
  assert.equal(await exists(backendPythonActivate), false)
  assert.equal(await exists(backendPythonActivateCsh), false)
  assert.equal(await exists(backendPythonActivateFish), false)
  assert.equal(await exists(backendPythonActivatePs1), false)
  assert.equal(await exists(backendPythonPipPackage), false)
  assert.equal(await exists(backendPythonPipDistInfo), false)
  assert.equal(await exists(backendPythonCache), false)
  assert.equal(await exists(backendFrameworkStdlibTest), false)
  assert.equal(await exists(backendFrameworkStdlibConfig), false)
  assert.equal(await exists(backendFrameworkStdlibIdlelib), false)
  assert.equal(await exists(backendFrameworkStdlibTkinter), false)
  assert.equal(await exists(backendFrameworkStdlibTurtledemo), false)
  assert.equal(await exists(backendFrameworkStdlibHello), false)
  assert.equal(await exists(backendFrameworkStdlibEnsurepip), false)
  assert.equal(await exists(backendFrameworkStdlibVenv), false)
  assert.equal(await exists(backendFrameworkStdlibUnittest), false)
  assert.equal(await exists(backendFrameworkStdlibPydocData), false)
  assert.equal(await exists(backendFrameworkStdlibLib2to3), false)
  assert.deepEqual(backendPythonCaches, [])
  assert.deepEqual(backendAllPythonCaches, [])
  assert.deepEqual(backendPythonCompiledFiles, [])
  assert.deepEqual(backendPythonTypingStubs, [])
  assert.equal(await exists(backendPytestBinary), false)
  assert.equal(await exists(backendFlake8Binary), false)
  assert.equal(await exists(pluginTests), false)
  assert.equal(await exists(legacyRuntimeResourcesRoot), false)
})
