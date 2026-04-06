import { cp, mkdir, readdir, readFile, rename, rm, writeFile, access, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outputRoot = path.join(repoRoot, 'src-tauri', 'resources', 'backend')
const pythonRoot = path.join(outputRoot, 'python')
const stagingPythonRoot = path.join(outputRoot, 'python.staging')
const runtimeRequirementsPath = path.join(repoRoot, 'backend', 'requirements-runtime.txt')
const legacyRuntimeResourcesRoot = path.join(repoRoot, 'build', 'runtime-resources')
const DEV_ONLY_PACKAGES = ['pytest', 'flake8', 'pyflakes', 'pycodestyle', 'mccabe', 'pluggy', 'iniconfig', 'pygments', 'packaging']
const UNUSED_VENV_BINARIES = ['pip', 'pip3', 'pip3.13', 'activate', 'activate.csh', 'activate.fish', 'Activate.ps1']
const PYTHON_BINARIES = ['python', 'python3', 'python3.13']
const PYTHON_HELPER_WRAPPERS = {
  fastapi: ['-m', 'fastapi.cli'],
  uvicorn: ['-m', 'uvicorn'],
}
const PYTHON_FRAMEWORK_EXTERNAL_PATTERN = /\/Library\/Frameworks\/Python\.framework\/Versions\/([^/\s]+)\/Python/
const PYTHON_FRAMEWORK_BUNDLED_PATTERN = /@executable_path\/\.\.\/Frameworks\/Python\.framework\/Versions\/([^/\s]+)\/Python/
const PYTHON_FRAMEWORK_BUNDLED_TEMPLATE = '@executable_path/../Frameworks/Python.framework/Versions/%VERSION%/Python'
const PYTHON_FRAMEWORK_INSTALL_ID_TEMPLATE = '@rpath/Python.framework/Versions/%VERSION%/Python'
const PYTHON_APP_EXTERNAL_TEMPLATE = '/Library/Frameworks/Python.framework/Versions/%VERSION%/Python'
const PYTHON_APP_BUNDLED_TEMPLATE = '@executable_path/../../../../Python'

async function exists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function removeDirectoriesNamed(root, directoryName) {
  const entries = await readdir(root, { withFileTypes: true })

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) {
        return
      }

      const entryPath = path.join(root, entry.name)

      if (entry.name === directoryName) {
        await rm(entryPath, { recursive: true, force: true })
        return
      }

      await removeDirectoriesNamed(entryPath, directoryName)
    }),
  )
}

async function pruneBundledPython(root) {
  await Promise.all(
    UNUSED_VENV_BINARIES.map((name) => rm(path.join(root, 'bin', name), { force: true })),
  )

  const libRoot = path.join(root, 'lib')
  const libEntries = await readdir(libRoot, { withFileTypes: true })

  for (const entry of libEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith('python')) {
      continue
    }

    const stdlibRoot = path.join(libRoot, entry.name)
    const sitePackagesRoot = path.join(stdlibRoot, 'site-packages')

    await rm(path.join(stdlibRoot, '__pycache__'), { recursive: true, force: true })
    await rm(path.join(stdlibRoot, 'ensurepip'), { recursive: true, force: true })
    await rm(path.join(sitePackagesRoot, '__pycache__'), { recursive: true, force: true })
    await rm(path.join(sitePackagesRoot, 'pip'), { recursive: true, force: true })
    await removeDirectoriesNamed(sitePackagesRoot, '__pycache__')

    const sitePackageEntries = await readdir(sitePackagesRoot, { withFileTypes: true })
    await Promise.all(
      sitePackageEntries
        .filter((sitePackageEntry) => sitePackageEntry.name.startsWith('pip-') && sitePackageEntry.name.endsWith('.dist-info'))
        .map((sitePackageEntry) =>
          rm(path.join(sitePackagesRoot, sitePackageEntry.name), { recursive: true, force: true }),
        ),
    )
  }
}

function resolveBuildPythonBin() {
  return process.env.PRESTO_TAURI_PYTHON_BIN?.trim() || process.env.PRESTO_PYTHON_BIN?.trim() || 'python3'
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: repoRoot,
      ...options,
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const stdout = []
    const stderr = []
    const child = spawn(command, args, {
      cwd: repoRoot,
      ...options,
    })
    child.stdout?.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr?.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.once('error', reject)
    child.once('exit', (code) => {
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }
      if (code === 0) {
        resolve(result)
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 'unknown'}\n${result.stderr}`.trim()))
    })
  })
}

async function readPythonLinkage(root) {
  const bundledPython = path.join(root, 'bin', 'python3')
  const { stdout } = await runCapture('otool', ['-L', bundledPython])
  return stdout
}

async function readPythonAppLinkage(root, version) {
  const bundledPythonApp = path.join(
    root,
    'Frameworks',
    'Python.framework',
    'Versions',
    version,
    'Resources',
    'Python.app',
    'Contents',
    'MacOS',
    'Python',
  )
  const { stdout } = await runCapture('otool', ['-L', bundledPythonApp])
  return stdout
}

async function isBundledPythonSelfContained(root) {
  const linkage = await readPythonLinkage(root)
  const match = linkage.match(PYTHON_FRAMEWORK_BUNDLED_PATTERN)

  if (!match) {
    return false
  }

  const version = match[1]
  const frameworkBinary = path.join(root, 'Frameworks', 'Python.framework', 'Versions', version, 'Python')
  const frameworkPythonApp = path.join(
    root,
    'Frameworks',
    'Python.framework',
    'Versions',
    version,
    'Resources',
    'Python.app',
    'Contents',
    'MacOS',
    'Python',
  )
  const pythonAppLinkage = await readPythonAppLinkage(root, version)
  const { stdout: frameworkInstallId } = await runCapture('otool', ['-D', frameworkBinary])

  return (
    (await exists(frameworkBinary)) &&
    (await exists(frameworkPythonApp)) &&
    linkage.includes(PYTHON_FRAMEWORK_BUNDLED_TEMPLATE.replace('%VERSION%', version)) &&
    pythonAppLinkage.includes(PYTHON_APP_BUNDLED_TEMPLATE) &&
    frameworkInstallId.includes(PYTHON_FRAMEWORK_INSTALL_ID_TEMPLATE.replace('%VERSION%', version)) &&
    !PYTHON_FRAMEWORK_EXTERNAL_PATTERN.test(linkage) &&
    !PYTHON_FRAMEWORK_EXTERNAL_PATTERN.test(pythonAppLinkage)
  )
}

async function adHocSign(targetPath) {
  await run('codesign', ['--force', '--sign', '-', targetPath])
}

async function vendorPythonFramework(root) {
  const linkage = await readPythonLinkage(root)
  const externalMatch = linkage.match(PYTHON_FRAMEWORK_EXTERNAL_PATTERN)
  const bundledMatch = linkage.match(PYTHON_FRAMEWORK_BUNDLED_PATTERN)
  const version = externalMatch?.[1] ?? bundledMatch?.[1]

  if (!version) {
    if (await isBundledPythonSelfContained(root)) {
      return
    }
    throw new Error('Unable to resolve bundled Python framework source from python3 linkage')
  }

  const externalFrameworkBinary =
    externalMatch?.[0] ?? PYTHON_APP_EXTERNAL_TEMPLATE.replace('%VERSION%', version)
  const externalFrameworkVersionRoot = path.dirname(externalFrameworkBinary)
  const externalPythonApp = path.join(externalFrameworkVersionRoot, 'Resources', 'Python.app')
  const bundledFrameworkVersionRoot = path.join(root, 'Frameworks', 'Python.framework', 'Versions', version)
  const bundledFrameworkBinary = path.join(bundledFrameworkVersionRoot, 'Python')
  const bundledPythonApp = path.join(bundledFrameworkVersionRoot, 'Resources', 'Python.app')
  const bundledPythonAppExecutable = path.join(bundledPythonApp, 'Contents', 'MacOS', 'Python')
  const bundledFrameworkReference = PYTHON_FRAMEWORK_BUNDLED_TEMPLATE.replace('%VERSION%', version)
  const bundledFrameworkInstallId = PYTHON_FRAMEWORK_INSTALL_ID_TEMPLATE.replace('%VERSION%', version)
  const bundledPythonAppReference = PYTHON_APP_BUNDLED_TEMPLATE

  if (externalMatch) {
    await rm(bundledFrameworkVersionRoot, { recursive: true, force: true })
    await mkdir(path.join(bundledFrameworkVersionRoot, 'Resources'), { recursive: true })
    await cp(externalFrameworkBinary, bundledFrameworkBinary, { force: true })
    await cp(externalPythonApp, bundledPythonApp, { recursive: true, force: true })
  }

  for (const name of PYTHON_BINARIES) {
    const binaryPath = path.join(root, 'bin', name)
    if (!(await exists(binaryPath))) {
      continue
    }
    await run('install_name_tool', ['-change', externalFrameworkBinary, bundledFrameworkReference, binaryPath])
  }

  const pythonAppLinkage = await readPythonAppLinkage(root, version)
  if (PYTHON_FRAMEWORK_EXTERNAL_PATTERN.test(pythonAppLinkage)) {
    await run('install_name_tool', ['-change', externalFrameworkBinary, bundledPythonAppReference, bundledPythonAppExecutable])
  }

  const { stdout: frameworkInstallId } = await runCapture('otool', ['-D', bundledFrameworkBinary])
  if (!frameworkInstallId.includes(bundledFrameworkInstallId)) {
    await run('install_name_tool', ['-id', bundledFrameworkInstallId, bundledFrameworkBinary])
  }

  await adHocSign(bundledPythonApp)
  await adHocSign(bundledFrameworkBinary)

  for (const name of PYTHON_BINARIES) {
    const binaryPath = path.join(root, 'bin', name)
    if (!(await exists(binaryPath))) {
      continue
    }
    await adHocSign(binaryPath)
  }
}

async function rewritePythonHelperWrappers(root) {
  const scripts = Object.entries(PYTHON_HELPER_WRAPPERS)

  for (const [name, args] of scripts) {
    const scriptPath = path.join(root, 'bin', name)
    if (!(await exists(scriptPath))) {
      continue
    }

    const wrapper = [
      '#!/bin/sh',
      'SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"',
      `exec "$SCRIPT_DIR/python3" ${args.map((arg) => `"${arg}"`).join(' ')} "$@"`,
      '',
    ].join('\n')

    await writeFile(scriptPath, wrapper, 'utf8')
    await chmod(scriptPath, 0o755)
  }
}

async function normalizePyvenvConfig(root) {
  const pyvenvConfigPath = path.join(root, 'pyvenv.cfg')
  if (!(await exists(pyvenvConfigPath))) {
    return
  }

  const source = await readFile(pyvenvConfigPath, 'utf8')
  const version = source.match(/^version = (.+)$/m)?.[1]?.trim() || '3.13.7'
  const normalized = [
    'home = ./Frameworks/Python.framework/Versions/3.13/bin',
    'include-system-site-packages = false',
    `version = ${version}`,
    'executable = ./bin/python3.13',
    'command = python3 -m venv --copies',
    '',
  ].join('\n')

  await writeFile(pyvenvConfigPath, normalized, 'utf8')
}

async function writeRuntimeMetadata() {
  const requirements = (await readFile(runtimeRequirementsPath, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  await mkdir(outputRoot, { recursive: true })
  await cp(runtimeRequirementsPath, path.join(outputRoot, 'requirements-runtime.txt'), { force: true })
  await writeFile(
    path.join(outputRoot, 'python-runtime.json'),
    `${JSON.stringify(
      {
        pythonBin: path.join('python', 'bin', 'python3'),
        requirements,
      },
      null,
      2,
    )}\n`,
  )
}

async function validateBundledPython(root) {
  const bundledPython = path.join(root, 'bin', 'python3')
  await run(bundledPython, ['-c', 'import fastapi, uvicorn, pydantic, anyio, ptsl'])
}

async function normalizeBundledPython(root) {
  await rewritePythonHelperWrappers(root)
  await normalizePyvenvConfig(root)
}

async function hasUsableBundledPython() {
  try {
    await validateBundledPython(pythonRoot)
    return await isBundledPythonSelfContained(pythonRoot)
  } catch {
    return false
  }
}

async function main() {
  const pythonBin = resolveBuildPythonBin()

  await rm(legacyRuntimeResourcesRoot, { recursive: true, force: true })

  if (await hasUsableBundledPython()) {
    await normalizeBundledPython(pythonRoot)
    await pruneBundledPython(pythonRoot)
    await writeRuntimeMetadata()
    return
  }

  try {
    await validateBundledPython(pythonRoot)
    await vendorPythonFramework(pythonRoot)
    await validateBundledPython(pythonRoot)
    await normalizeBundledPython(pythonRoot)
    await pruneBundledPython(pythonRoot)
    await writeRuntimeMetadata()
    return
  } catch {
    // Fall through to a clean rebuild when the existing bundled runtime is missing or unusable.
  }

  await mkdir(outputRoot, { recursive: true })
  await rm(stagingPythonRoot, { recursive: true, force: true })
  await run(pythonBin, ['-m', 'venv', '--copies', stagingPythonRoot])

  const bundledPip = path.join(stagingPythonRoot, 'bin', 'pip3')

  await run(bundledPip, ['install', '--upgrade', 'pip'])
  await run(bundledPip, ['install', '--no-cache-dir', '-r', runtimeRequirementsPath])
  await run(bundledPip, ['uninstall', '--yes', ...DEV_ONLY_PACKAGES])
  await vendorPythonFramework(stagingPythonRoot)
  await validateBundledPython(stagingPythonRoot)
  await normalizeBundledPython(stagingPythonRoot)
  await pruneBundledPython(stagingPythonRoot)
  await rm(pythonRoot, { recursive: true, force: true })
  await rename(stagingPythonRoot, pythonRoot)
  await writeRuntimeMetadata()
}

await main()
