import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const removedPaths = []

async function removeIfExists(relativePath) {
  const targetPath = path.join(rootDir, relativePath)
  await rm(targetPath, { recursive: true, force: true })
  removedPaths.push(relativePath)
}

async function walkAndClean(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name)
    const relativePath = path.relative(rootDir, absolutePath) || '.'

    if (entry.isDirectory()) {
      if (entry.name === '__pycache__' || entry.name === '.pytest_cache') {
        await rm(absolutePath, { recursive: true, force: true })
        removedPaths.push(relativePath)
        continue
      }

      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue
      }

      await walkAndClean(absolutePath)
      continue
    }

    if (entry.isFile() && (entry.name === '.DS_Store' || entry.name.endsWith('.pyc'))) {
      await rm(absolutePath, { force: true })
      removedPaths.push(relativePath)
    }
  }
}

await removeIfExists('.worktrees')
await removeIfExists('release')
await removeIfExists('build/stage1')
await walkAndClean(rootDir)

removedPaths.sort((left, right) => left.localeCompare(right))

for (const relativePath of removedPaths) {
  console.log(relativePath)
}
