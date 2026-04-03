import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outputRoot = path.join(repoRoot, 'build', 'runtime-resources')

function isIgnoredName(name) {
  return (
    name === '.DS_Store' ||
    name === '.pytest_cache' ||
    name === '.mypy_cache' ||
    name === '.ruff_cache' ||
    name === '__pycache__' ||
    name === 'tests'
  )
}

function filterEntry(sourcePath) {
  const name = path.basename(sourcePath)
  if (isIgnoredName(name)) {
    return false
  }
  if (name.endsWith('.pyc')) {
    return false
  }
  return true
}

async function copyFiltered(source, destination) {
  await cp(source, destination, {
    recursive: true,
    force: true,
    filter: filterEntry,
  })
}

async function prepareBackendResources() {
  const backendOutput = path.join(outputRoot, 'backend')
  await mkdir(backendOutput, { recursive: true })
  await copyFiltered(path.join(repoRoot, 'backend', 'presto'), path.join(backendOutput, 'presto'))
}

async function prepareOfficialPluginResources() {
  const pluginsRoot = path.join(repoRoot, 'plugins', 'official')
  const pluginsOutput = path.join(outputRoot, 'plugins', 'official')
  await mkdir(pluginsOutput, { recursive: true })
  const pluginEntries = await readdir(pluginsRoot, { withFileTypes: true })

  for (const entry of pluginEntries) {
    if (!entry.isDirectory() || isIgnoredName(entry.name)) {
      continue
    }
    const sourcePluginRoot = path.join(pluginsRoot, entry.name)
    const destinationPluginRoot = path.join(pluginsOutput, entry.name)
    await mkdir(destinationPluginRoot, { recursive: true })
    await cp(path.join(sourcePluginRoot, 'manifest.json'), path.join(destinationPluginRoot, 'manifest.json'), { force: true })
    await copyFiltered(path.join(sourcePluginRoot, 'dist'), path.join(destinationPluginRoot, 'dist'))
  }
}

async function prepareAutomationResources() {
  await copyFiltered(
    path.join(repoRoot, 'frontend', 'runtime', 'automation'),
    path.join(outputRoot, 'frontend', 'runtime', 'automation'),
  )
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

await Promise.all([
  prepareBackendResources(),
  prepareOfficialPluginResources(),
  prepareAutomationResources(),
])
