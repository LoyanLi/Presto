import { cp, mkdir, readdir, readFile, rename, rm, writeFile, access, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outputRoot = path.join(repoRoot, 'src-tauri', 'resources', 'backend')
const pythonRoot = path.join(outputRoot, 'python')
const stagingPythonRoot = path.join(outputRoot, 'python.staging')
const PYTHON_VERSION = '3.13'
const runtimeRequirementsPath = path.join(repoRoot, 'backend', 'requirements-runtime.txt')
const legacyRuntimeResourcesRoot = path.join(repoRoot, 'build', 'runtime-resources')
const DEV_ONLY_PACKAGES = ['pytest', 'flake8', 'pyflakes', 'pycodestyle', 'mccabe', 'pluggy', 'iniconfig', 'pygments', 'packaging']
const UNUSED_VENV_BINARIES = ['pip', 'pip3', 'pip3.13', 'activate', 'activate.csh', 'activate.fish', 'Activate.ps1']
const UNUSED_FRAMEWORK_STDLIB_ENTRIES = [
  'ensurepip',
  'idlelib',
  'test',
  'tkinter',
  'turtledemo',
  '__phello__',
  'config-3.13-darwin',
  'venv',
  'unittest',
  'pydoc_data',
  'lib2to3',
]
const UNUSED_SITE_PACKAGES_DIRECTORIES = ['tests', 'test', 'testing', 'examples', 'example', 'benchmarks', 'docs']
const UNUSED_RUNTIME_FILE_SUFFIXES = ['.pyc', '.pyo', '.pyi']
const REQUIRED_RUNTIME_IMPORTS = [
  'encodings',
  'ssl',
  'hashlib',
  'json',
  'asyncio',
  'fastapi',
  'uvicorn',
  'pydantic',
  'pydantic_core',
  'anyio',
  'grpc',
  'google.protobuf',
  'ptsl',
]
const EXTRA_REQUIRED_LIB_DYNLOAD_BASENAMES = [
  '_asyncio.cpython-313-darwin.so',
  '_blake2.cpython-313-darwin.so',
  '_contextvars.cpython-313-darwin.so',
  '_ctypes.cpython-313-darwin.so',
  '_datetime.cpython-313-darwin.so',
  '_hashlib.cpython-313-darwin.so',
  '_heapq.cpython-313-darwin.so',
  '_json.cpython-313-darwin.so',
  '_opcode.cpython-313-darwin.so',
  '_pickle.cpython-313-darwin.so',
  '_posixsubprocess.cpython-313-darwin.so',
  '_queue.cpython-313-darwin.so',
  '_random.cpython-313-darwin.so',
  '_socket.cpython-313-darwin.so',
  '_ssl.cpython-313-darwin.so',
  '_struct.cpython-313-darwin.so',
  '_uuid.cpython-313-darwin.so',
  '_zoneinfo.cpython-313-darwin.so',
  'array.cpython-313-darwin.so',
  'binascii.cpython-313-darwin.so',
  'fcntl.cpython-313-darwin.so',
  'math.cpython-313-darwin.so',
  'pyexpat.cpython-313-darwin.so',
  'select.cpython-313-darwin.so',
  'termios.cpython-313-darwin.so',
  'unicodedata.cpython-313-darwin.so',
  'zlib.cpython-313-darwin.so',
]
const DISALLOWED_LIB_DYNLOAD_BASENAMES = new Set([
  '_ctypes_test.cpython-313-darwin.so',
  '_tkinter.cpython-313-darwin.so',
  '_curses.cpython-313-darwin.so',
  '_curses_panel.cpython-313-darwin.so',
  '_testbuffer.cpython-313-darwin.so',
  '_testcapi.cpython-313-darwin.so',
  '_testclinic.cpython-313-darwin.so',
  '_testclinic_limited.cpython-313-darwin.so',
  '_testexternalinspection.cpython-313-darwin.so',
  '_testimportmultiple.cpython-313-darwin.so',
  '_testinternalcapi.cpython-313-darwin.so',
  '_testlimitedcapi.cpython-313-darwin.so',
  '_testmultiphase.cpython-313-darwin.so',
  '_testsinglephase.cpython-313-darwin.so',
  '_xxtestfuzz.cpython-313-darwin.so',
  'xxlimited.cpython-313-darwin.so',
  'xxlimited_35.cpython-313-darwin.so',
  'xxsubtype.cpython-313-darwin.so',
])
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

function resolveTargetArch() {
  const targetTriple = process.env.PRESTO_TAURI_TARGET?.trim()
  if (targetTriple === 'aarch64-apple-darwin') {
    return 'arm64'
  }
  if (targetTriple === 'x86_64-apple-darwin') {
    return 'x86_64'
  }
  if (process.arch === 'arm64') {
    return 'arm64'
  }
  if (process.arch === 'x64') {
    return 'x86_64'
  }
  throw new Error(`unsupported_python_runtime_arch:${targetTriple || process.arch}`)
}

function resolveHostArch() {
  if (process.arch === 'arm64') {
    return 'arm64'
  }
  if (process.arch === 'x64') {
    return 'x86_64'
  }
  throw new Error(`unsupported_host_arch:${process.arch}`)
}

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

async function removeDirectoriesByName(root, directoryNames) {
  for (const directoryName of directoryNames) {
    await removeDirectoriesNamed(root, directoryName)
  }
}

async function removeFilesBySuffix(root, suffixes) {
  const entries = await readdir(root, { withFileTypes: true })

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        await removeFilesBySuffix(entryPath, suffixes)
        return
      }
      if (entry.isFile() && suffixes.some((suffix) => entry.name.endsWith(suffix))) {
        await rm(entryPath, { force: true })
      }
    }),
  )
}

async function pruneBundledPython(root, targetArch) {
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
    await removeDirectoriesByName(sitePackagesRoot, UNUSED_SITE_PACKAGES_DIRECTORIES)
    await removeFilesBySuffix(sitePackagesRoot, UNUSED_RUNTIME_FILE_SUFFIXES)

    const sitePackageEntries = await readdir(sitePackagesRoot, { withFileTypes: true })
    await Promise.all(
      sitePackageEntries
        .filter((sitePackageEntry) => sitePackageEntry.name.startsWith('pip-') && sitePackageEntry.name.endsWith('.dist-info'))
        .map((sitePackageEntry) =>
          rm(path.join(sitePackagesRoot, sitePackageEntry.name), { recursive: true, force: true }),
        ),
    )
  }

  const frameworkStdlibRoot = resolveBundledFrameworkStdlib(root)
  await rm(path.join(frameworkStdlibRoot, '__pycache__'), { recursive: true, force: true })
  await removeDirectoriesNamed(frameworkStdlibRoot, '__pycache__')
  await removeFilesBySuffix(frameworkStdlibRoot, UNUSED_RUNTIME_FILE_SUFFIXES)
  await Promise.all(
    UNUSED_FRAMEWORK_STDLIB_ENTRIES.map((name) =>
      rm(path.join(frameworkStdlibRoot, name), { recursive: true, force: true }),
    ),
  )
  await pruneLibDynload(root, targetArch)
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

function runTargetArch(targetArch, command, args, options = {}) {
  if (process.platform === 'darwin' && resolveHostArch() !== targetArch) {
    return run('arch', [`-${targetArch}`, command, ...args], options)
  }

  return run(command, args, options)
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

function runTargetArchCapture(targetArch, command, args, options = {}) {
  if (process.platform === 'darwin' && resolveHostArch() !== targetArch) {
    return runCapture('arch', [`-${targetArch}`, command, ...args], options)
  }

  return runCapture(command, args, options)
}

async function readPythonLinkage(root) {
  const bundledPython = path.join(root, 'bin', 'python3')
  const { stdout } = await runCapture('otool', ['-L', bundledPython])
  return stdout
}

function resolveBundledFrameworkRoot(root, version = PYTHON_VERSION) {
  return path.join(root, 'Frameworks', 'Python.framework', 'Versions', version)
}

function resolveBundledFrameworkStdlib(root, version = PYTHON_VERSION) {
  return path.join(resolveBundledFrameworkRoot(root, version), 'lib', `python${version}`)
}

function parseMachOLinkedPaths(linkage) {
  return linkage
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(' (')[0])
}

function toLoaderRelativeReference(targetPath, dependencyPath) {
  const relativePath = path.relative(path.dirname(targetPath), dependencyPath).split(path.sep).join('/')
  return relativePath ? `@loader_path/${relativePath}` : '@loader_path'
}

async function readMachOLinkage(targetPath) {
  const { stdout } = await runCapture('otool', ['-L', targetPath])
  return stdout
}

async function readMachOInstallId(targetPath) {
  const { stdout } = await runCapture('otool', ['-D', targetPath])
  const [, installId = ''] = stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  return installId
}

async function listLibDynloadExtensions(root, version = PYTHON_VERSION) {
  const libDynloadRoot = path.join(resolveBundledFrameworkStdlib(root, version), 'lib-dynload')
  const entries = await readdir(libDynloadRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.so'))
    .map((entry) => path.join(libDynloadRoot, entry.name))
}

async function listSitePackageExtensions(root, version = PYTHON_VERSION) {
  const sitePackagesRoot = path.join(root, 'lib', `python${version}`, 'site-packages')
  if (!(await exists(sitePackagesRoot))) {
    return []
  }

  const matches = []
  const pending = [sitePackagesRoot]

  while (pending.length > 0) {
    const currentPath = pending.pop()
    if (!currentPath) {
      continue
    }

    const entries = await readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.so')) {
        matches.push(entryPath)
      }
    }
  }

  return matches.sort()
}

async function collectFrameworkLibraries(root, version = PYTHON_VERSION) {
  const frameworkLibRoot = path.join(resolveBundledFrameworkRoot(root, version), 'lib')
  if (!(await exists(frameworkLibRoot))) {
    return []
  }

  const entries = await readdir(frameworkLibRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dylib'))
    .map((entry) => path.join(frameworkLibRoot, entry.name))
    .sort()
}

async function collectRequiredLibDynloadBasenames(root, targetArch) {
  const bundledPython = path.join(root, 'bin', 'python3')
  const bundledFrameworkRoot = resolveBundledFrameworkRoot(root)
  const { stdout } = await runTargetArchCapture(
    targetArch,
    bundledPython,
    [
      '-c',
      [
        'import importlib, json, pathlib, sys',
        `imports = ${JSON.stringify(REQUIRED_RUNTIME_IMPORTS)}`,
        'for name in imports:',
        '    importlib.import_module(name)',
        'lib_dynload = pathlib.Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "lib-dynload"',
        'required = set()',
        'for module in list(sys.modules.values()):',
        '    module_file = getattr(module, "__file__", None)',
        '    if not module_file:',
        '        continue',
        '    try:',
        '        module_path = pathlib.Path(module_file).resolve()',
        '    except OSError:',
        '        continue',
        '    try:',
        '        module_path.relative_to(lib_dynload.resolve())',
        '    except ValueError:',
        '        continue',
        '    required.add(module_path.name)',
        'print(json.dumps(sorted(required), ensure_ascii=False))',
      ].join('\n'),
    ],
    {
      env: {
        ...process.env,
        PYTHONHOME: bundledFrameworkRoot,
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
  )

  return new Set([
    ...EXTRA_REQUIRED_LIB_DYNLOAD_BASENAMES,
    ...JSON.parse(stdout),
  ])
}

async function pruneLibDynload(root, targetArch, version = PYTHON_VERSION) {
  const requiredBasenames = await collectRequiredLibDynloadBasenames(root, targetArch)
  const libDynloadExtensions = await listLibDynloadExtensions(root, version)

  await Promise.all(
    libDynloadExtensions.map(async (targetPath) => {
      const basename = path.basename(targetPath)
      if (!DISALLOWED_LIB_DYNLOAD_BASENAMES.has(basename) && requiredBasenames.has(basename)) {
        return
      }
      await rm(targetPath, { force: true })
    }),
  )
}

async function stripBundledPythonBinaries(root) {
  const frameworkVersionRoot = resolveBundledFrameworkRoot(root)
  const bundledPythonApp = path.join(frameworkVersionRoot, 'Resources', 'Python.app', 'Contents', 'MacOS', 'Python')
  const targets = [
    ...PYTHON_BINARIES.map((name) => path.join(root, 'bin', name)),
    path.join(frameworkVersionRoot, 'Python'),
    bundledPythonApp,
    ...(await collectFrameworkLibraries(root)),
    ...(await listLibDynloadExtensions(root)),
    ...(await listSitePackageExtensions(root)),
  ]

  for (const targetPath of targets) {
    if (!(await exists(targetPath))) {
      continue
    }
    await run('strip', ['-x', targetPath])
    await adHocSign(targetPath)
  }
}

async function assertMachOBinariesContainTargetArch(targetPaths, targetArch) {
  for (const targetPath of targetPaths) {
    if (!(await exists(targetPath))) {
      continue
    }
    const { stdout } = await runCapture('lipo', ['-archs', targetPath])
    const architectures = stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    if (!architectures.includes(targetArch)) {
      throw new Error(`Bundled Python Mach-O is missing target arch ${targetArch}: ${targetPath} -> ${stdout.trim()}`)
    }
  }
}

function extractExternalFrameworkLibraryDeps(linkage, externalFrameworkVersionRoot) {
  return parseMachOLinkedPaths(linkage).filter(
    (dependency) =>
      dependency.startsWith(`${externalFrameworkVersionRoot}/lib/`) &&
      dependency.endsWith('.dylib'),
  )
}

async function vendorFrameworkLibraryDependencies(root, externalFrameworkVersionRoot, bundledFrameworkVersionRoot, version) {
  const pendingTargets = await listLibDynloadExtensions(root, version)
  const processedTargets = new Set()

  while (pendingTargets.length > 0) {
    const targetPath = pendingTargets.pop()
    if (!targetPath || processedTargets.has(targetPath)) {
      continue
    }

    processedTargets.add(targetPath)
    const linkage = await readMachOLinkage(targetPath)
    const dependencies = extractExternalFrameworkLibraryDeps(linkage, externalFrameworkVersionRoot)

    for (const dependency of dependencies) {
      const bundledDependency = dependency.replace(externalFrameworkVersionRoot, bundledFrameworkVersionRoot)
      if (!(await exists(bundledDependency))) {
        await mkdir(path.dirname(bundledDependency), { recursive: true })
        await cp(dependency, bundledDependency, { force: true })
      }
      if (!processedTargets.has(bundledDependency)) {
        pendingTargets.push(bundledDependency)
      }
    }
  }

  for (const targetPath of processedTargets) {
    let changed = false
    const linkage = await readMachOLinkage(targetPath)
    const dependencies = extractExternalFrameworkLibraryDeps(linkage, externalFrameworkVersionRoot)

    for (const dependency of dependencies) {
      const bundledDependency = dependency.replace(externalFrameworkVersionRoot, bundledFrameworkVersionRoot)
      await run('install_name_tool', [
        '-change',
        dependency,
        toLoaderRelativeReference(targetPath, bundledDependency),
        targetPath,
      ])
      changed = true
    }

    if (targetPath.endsWith('.dylib')) {
      const installId = await readMachOInstallId(targetPath)
      if (installId.startsWith(`${externalFrameworkVersionRoot}/lib/`)) {
        await run('install_name_tool', ['-id', toLoaderRelativeReference(targetPath, targetPath), targetPath])
        changed = true
      }
    }

    if (changed) {
      await adHocSign(targetPath)
    }
  }
}

async function assertNoExternalFrameworkLibraryLinkage(root, version = PYTHON_VERSION) {
  const bundledFrameworkRoot = resolveBundledFrameworkRoot(root, version)
  const targets = [
    ...(await listLibDynloadExtensions(root, version)).filter((targetPath) => {
      const basename = path.basename(targetPath)
      return basename.startsWith('_ssl.') || basename.startsWith('_hashlib.')
    }),
    path.join(bundledFrameworkRoot, 'lib', 'libssl.3.dylib'),
    path.join(bundledFrameworkRoot, 'lib', 'libcrypto.3.dylib'),
  ]

  for (const targetPath of targets) {
    if (!(await exists(targetPath))) {
      throw new Error(`Bundled Python runtime library is missing: ${targetPath}`)
    }
    const linkage = await readMachOLinkage(targetPath)
    const externalDeps = parseMachOLinkedPaths(linkage).filter((dependency) =>
      dependency.startsWith('/Library/Frameworks/Python.framework/Versions/'),
    )
    if (externalDeps.length > 0) {
      throw new Error(`Bundled runtime linkage escaped to external framework: ${targetPath} -> ${externalDeps.join(', ')}`)
    }
  }
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
  const externalStdlibRoot = path.join(externalFrameworkVersionRoot, 'lib', `python${version}`)
  const bundledStdlibRoot = path.join(bundledFrameworkVersionRoot, 'lib', `python${version}`)
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

  await rm(bundledStdlibRoot, { recursive: true, force: true })
  await mkdir(path.dirname(bundledStdlibRoot), { recursive: true })
  await cp(externalStdlibRoot, bundledStdlibRoot, { recursive: true, force: true })
  await rm(path.join(bundledStdlibRoot, 'site-packages'), { recursive: true, force: true })
  await vendorFrameworkLibraryDependencies(root, externalFrameworkVersionRoot, bundledFrameworkVersionRoot, version)

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

async function validateBundledPython(root, targetArch) {
  const bundledPython = path.join(root, 'bin', 'python3')
  const bundledFrameworkRoot = resolveBundledFrameworkRoot(root)
  const bundledStdlib = resolveBundledFrameworkStdlib(root)

  if (!(await exists(path.join(bundledStdlib, 'encodings')))) {
    throw new Error(`Bundled Python stdlib is missing encodings at ${bundledStdlib}`)
  }

  const { stdout } = await runTargetArchCapture(
    targetArch,
    bundledPython,
    [
      '-c',
      [
        'import encodings, ssl, hashlib, json, asyncio, fastapi, uvicorn, pydantic, pydantic_core, anyio, grpc, google.protobuf, ptsl, sys, sysconfig',
        'print(json.dumps({',
        '  "base_prefix": sys.base_prefix,',
        '  "base_exec_prefix": sys.base_exec_prefix,',
        '  "stdlib": sysconfig.get_path("stdlib"),',
        '  "platstdlib": sysconfig.get_path("platstdlib"),',
        '  "encodings": encodings.__file__,',
        '  "path": sys.path,',
        '}, ensure_ascii=False))',
      ].join('\n'),
    ],
    {
      env: {
        ...process.env,
        PYTHONHOME: bundledFrameworkRoot,
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
  )

  const runtime = JSON.parse(stdout)
  for (const key of ['base_prefix', 'base_exec_prefix', 'stdlib', 'encodings']) {
    if (!String(runtime[key] ?? '').startsWith(bundledFrameworkRoot)) {
      throw new Error(`Bundled Python ${key} escaped bundled framework: ${runtime[key]}`)
    }
  }
  for (const entry of runtime.path ?? []) {
    if (String(entry).includes('/Library/Frameworks/Python.framework/Versions/')) {
      throw new Error(`Bundled Python path escaped to build-machine framework: ${entry}`)
    }
  }

  await assertMachOBinariesContainTargetArch(
    [
      bundledPython,
      ...(await listLibDynloadExtensions(root)),
      ...(await listSitePackageExtensions(root)),
    ],
    targetArch,
  )
  await assertNoExternalFrameworkLibraryLinkage(root)
}

async function normalizeBundledPython(root) {
  await rewritePythonHelperWrappers(root)
  await normalizePyvenvConfig(root)
}

async function hasUsableBundledPython(targetArch) {
  try {
    await validateBundledPython(pythonRoot, targetArch)
    return await isBundledPythonSelfContained(pythonRoot)
  } catch {
    return false
  }
}

async function main() {
  const pythonBin = resolveBuildPythonBin()
  const targetArch = resolveTargetArch()

  await rm(legacyRuntimeResourcesRoot, { recursive: true, force: true })

  if (await hasUsableBundledPython(targetArch)) {
    await normalizeBundledPython(pythonRoot)
    await pruneBundledPython(pythonRoot, targetArch)
    await stripBundledPythonBinaries(pythonRoot)
    await validateBundledPython(pythonRoot, targetArch)
    await writeRuntimeMetadata()
    return
  }

  try {
    await vendorPythonFramework(pythonRoot)
    await normalizeBundledPython(pythonRoot)
    await pruneBundledPython(pythonRoot, targetArch)
    await stripBundledPythonBinaries(pythonRoot)
    await validateBundledPython(pythonRoot, targetArch)
    await writeRuntimeMetadata()
    return
  } catch {
    // Fall through to a clean rebuild when the existing bundled runtime is missing or unusable.
  }

  await mkdir(outputRoot, { recursive: true })
  await rm(stagingPythonRoot, { recursive: true, force: true })
  await runTargetArch(targetArch, pythonBin, ['-m', 'venv', '--copies', stagingPythonRoot])

  const bundledPip = path.join(stagingPythonRoot, 'bin', 'pip3')

  await runTargetArch(targetArch, bundledPip, ['install', '--upgrade', 'pip'])
  await runTargetArch(targetArch, bundledPip, ['install', '--no-cache-dir', '-r', runtimeRequirementsPath])
  await runTargetArch(targetArch, bundledPip, ['uninstall', '--yes', ...DEV_ONLY_PACKAGES])
  await vendorPythonFramework(stagingPythonRoot)
  await normalizeBundledPython(stagingPythonRoot)
  await pruneBundledPython(stagingPythonRoot, targetArch)
  await stripBundledPythonBinaries(stagingPythonRoot)
  await validateBundledPython(stagingPythonRoot, targetArch)
  await rm(pythonRoot, { recursive: true, force: true })
  await rename(stagingPythonRoot, pythonRoot)
  await writeRuntimeMetadata()
}

await main()
