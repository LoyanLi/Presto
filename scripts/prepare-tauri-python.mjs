import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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

async function hasUsableBundledPython() {
  try {
    await validateBundledPython(pythonRoot)
    return true
  } catch {
    return false
  }
}

async function main() {
  const pythonBin = resolveBuildPythonBin()

  await rm(legacyRuntimeResourcesRoot, { recursive: true, force: true })

  if (await hasUsableBundledPython()) {
    await pruneBundledPython(pythonRoot)
    await writeRuntimeMetadata()
    return
  }

  await mkdir(outputRoot, { recursive: true })
  await rm(stagingPythonRoot, { recursive: true, force: true })
  await run(pythonBin, ['-m', 'venv', '--copies', stagingPythonRoot])

  const bundledPip = path.join(stagingPythonRoot, 'bin', 'pip3')

  await run(bundledPip, ['install', '--upgrade', 'pip'])
  await run(bundledPip, ['install', '--no-cache-dir', '-r', runtimeRequirementsPath])
  await run(bundledPip, ['uninstall', '--yes', ...DEV_ONLY_PACKAGES])
  await validateBundledPython(stagingPythonRoot)
  await pruneBundledPython(stagingPythonRoot)
  await rm(pythonRoot, { recursive: true, force: true })
  await rename(stagingPythonRoot, pythonRoot)
  await writeRuntimeMetadata()
}

await main()
