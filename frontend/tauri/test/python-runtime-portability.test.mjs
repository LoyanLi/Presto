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

function listMachOBinaries(rootPath) {
  const result = spawnSync(
    'python3',
    [
      '-c',
      [
        'import pathlib, subprocess, sys',
        'root = pathlib.Path(sys.argv[1])',
        'for path in sorted(root.rglob("*")):',
        '    if not path.is_file():',
        '        continue',
        '    probe = subprocess.run(["file", str(path)], capture_output=True, text=True, check=False)',
        '    if "Mach-O" in probe.stdout:',
        '        print(path)',
      ].join('\n'),
      rootPath,
    ],
    {
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0, result.stderr)
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

test('prepared bundled python is self-contained on macOS', async () => {
  if (process.platform !== 'darwin') {
    return
  }

  const bundledPython = path.join(repoRoot, 'src-tauri/resources/backend/python/bin/python3')
  const bundledFrameworkBinary = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/Python'
  const bundledPythonApp = 'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
  const python3Linkage = spawnSync('otool', ['-L', bundledPython], {
    encoding: 'utf8',
  })
  const pythonAppLinkage = spawnSync('otool', ['-L', path.join(repoRoot, bundledPythonApp)], {
    encoding: 'utf8',
  })

  assert.equal(python3Linkage.status, 0, python3Linkage.stderr)
  assert.equal(pythonAppLinkage.status, 0, pythonAppLinkage.stderr)
  assert.equal(await exists(bundledFrameworkBinary), true)
  assert.equal(await exists(bundledPythonApp), true)
  assert.match(python3Linkage.stdout, /@executable_path\/\.\.\/Frameworks\/Python\.framework\/Versions\/3\.13\/Python/)
  assert.doesNotMatch(python3Linkage.stdout, /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\/Python/)
  assert.match(pythonAppLinkage.stdout, /@executable_path\/\.\.\/\.\.\/\.\.\/\.\.\/Python/)
  assert.doesNotMatch(pythonAppLinkage.stdout, /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\/Python/)
})

test('prepared bundled python mach-o files do not keep external Python framework linkage', async () => {
  if (process.platform !== 'darwin') {
    return
  }

  const pythonRoot = path.join(repoRoot, 'src-tauri/resources/backend/python')
  const machOBinaries = listMachOBinaries(pythonRoot)
  assert.ok(machOBinaries.length > 0)

  for (const binaryPath of machOBinaries) {
    const linkage = spawnSync('otool', ['-L', binaryPath], {
      encoding: 'utf8',
    })
    assert.equal(linkage.status, 0, linkage.stderr)
    assert.doesNotMatch(
      linkage.stdout,
      /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\/Python/,
      `External Python framework linkage found in ${binaryPath}`,
    )
  }
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
