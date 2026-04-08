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

function inspectBundledPythonRuntime(pythonBin, env = {}) {
  const result = spawnSync(
    pythonBin,
    [
      '-c',
      [
        'import encodings, json, sys, sysconfig',
        'print(json.dumps({',
        '  "base_prefix": sys.base_prefix,',
        '  "base_exec_prefix": sys.base_exec_prefix,',
        '  "path": sys.path,',
        '  "stdlib": sysconfig.get_path("stdlib"),',
        '  "platstdlib": sysconfig.get_path("platstdlib"),',
        '  "encodings": encodings.__file__,',
        '}, ensure_ascii=False))',
      ].join('\n'),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        ...env,
      },
    },
  )

  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

function readMachOLinkage(binaryPath) {
  const result = spawnSync('otool', ['-L', binaryPath], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  return result.stdout
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
    if (binaryPath.endsWith('.a') || binaryPath.includes('/config-')) {
      continue
    }
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

test('prepared bundled python runtime extensions do not depend on external framework dylibs', async () => {
  if (process.platform !== 'darwin') {
    return
  }

  const dylibs = [
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_ssl.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_hashlib.cpython-313-darwin.so',
  ]

  for (const dylib of dylibs) {
    const linkage = readMachOLinkage(path.join(repoRoot, dylib))
    assert.doesNotMatch(
      linkage,
      /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\/lib\/lib(?:ssl|crypto)\.3\.dylib/,
      `External OpenSSL linkage found in ${dylib}`,
    )
  }
})

test('prepared bundled python lib-dynload keeps only backend-required runtime extensions', async () => {
  if (process.platform !== 'darwin') {
    return
  }

  const disallowedExtensions = [
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_ctypes_test.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_tkinter.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_curses.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_curses_panel.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testcapi.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testinternalcapi.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testclinic.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testclinic_limited.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testexternalinspection.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testimportmultiple.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testlimitedcapi.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testmultiphase.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_testsinglephase.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/_xxtestfuzz.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/xxlimited.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/xxlimited_35.cpython-313-darwin.so',
    'src-tauri/resources/backend/python/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/xxsubtype.cpython-313-darwin.so',
  ]

  for (const extensionPath of disallowedExtensions) {
    assert.equal(await exists(extensionPath), false, `${extensionPath} should not be packaged`)
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

test('prepared bundled python includes framework stdlib and resolves it when PYTHONHOME targets the bundled framework', async () => {
  if (process.platform !== 'darwin') {
    return
  }

  const bundledPython = path.join(repoRoot, 'src-tauri/resources/backend/python/bin/python3')
  const bundledRoot = path.join(repoRoot, 'src-tauri/resources/backend/python')
  const bundledFrameworkRoot = path.join(bundledRoot, 'Frameworks', 'Python.framework', 'Versions', '3.13')
  const bundledStdlib = path.join(bundledFrameworkRoot, 'lib', 'python3.13')
  const runtime = inspectBundledPythonRuntime(bundledPython, {
    PYTHONHOME: bundledFrameworkRoot,
  })

  assert.equal(await exists(path.relative(repoRoot, bundledStdlib)), true)
  assert.equal(await exists(path.relative(repoRoot, path.join(bundledStdlib, 'encodings'))), true)
  assert.match(runtime.base_prefix, new RegExp(`^${bundledFrameworkRoot.replaceAll('.', '\\.')}`))
  assert.match(runtime.base_exec_prefix, new RegExp(`^${bundledFrameworkRoot.replaceAll('.', '\\.')}`))
  assert.match(runtime.stdlib, new RegExp(`^${bundledFrameworkRoot.replaceAll('.', '\\.')}\\/lib\\/python3\\.13`))
  assert.match(runtime.encodings, new RegExp(`^${bundledFrameworkRoot.replaceAll('.', '\\.')}\\/lib\\/python3\\.13\\/encodings`))
  assert.doesNotMatch(runtime.platstdlib, /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\//)

  for (const entry of runtime.path) {
    assert.doesNotMatch(entry, /\/Library\/Frameworks\/Python\.framework\/Versions\/3\.13\//)
  }
})
