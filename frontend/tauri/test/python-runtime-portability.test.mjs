import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

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

test('prepared bundled python is self-contained on macOS', async () => {
  if (process.platform !== 'darwin') {
    return
  }

  const bundledPython = path.join(repoRoot, 'src-tauri/resources/backend/python/bin/python3')
  const bundledFrameworkBinary = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/Python'
  const bundledPythonApp = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
  const result = spawnSync('otool', ['-L', bundledPython], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(await exists(bundledFrameworkBinary), true)
  assert.equal(await exists(bundledPythonApp), true)
  assert.match(result.stdout, /@executable_path\/\.\.\/Frameworks\/Python\.framework\/Versions\/3\.13\/Python/)
  assert.doesNotMatch(result.stdout, /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\/Python/)
})

test('prepared bundled python helper scripts do not keep build-machine paths', async () => {
  const fastapiPath = path.join(repoRoot, 'src-tauri/resources/backend/python/bin/fastapi')
  const uvicornPath = path.join(repoRoot, 'src-tauri/resources/backend/python/bin/uvicorn')
  const pyvenvConfigPath = path.join(repoRoot, 'src-tauri/resources/backend/python/pyvenv.cfg')
  const [fastapiSource, uvicornSource, pyvenvConfig] = await Promise.all([
    readFile(fastapiPath, 'utf8'),
    readFile(uvicornPath, 'utf8'),
    readFile(pyvenvConfigPath, 'utf8'),
  ])

  assert.doesNotMatch(fastapiSource, /python\.staging/)
  assert.doesNotMatch(uvicornSource, /python\.staging/)
  assert.doesNotMatch(fastapiSource, /^#!\/Users\//m)
  assert.doesNotMatch(uvicornSource, /^#!\/Users\//m)
  assert.doesNotMatch(pyvenvConfig, /python\.staging/)
})
