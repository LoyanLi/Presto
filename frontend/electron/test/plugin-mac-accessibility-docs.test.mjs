import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

async function readDoc(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8')
}

test('plugin docs mark mac accessibility as formal runtime service in plugin SDK', async () => {
  const contractsDoc = await readDoc('docs/presto-platform/2026-03-19-plugin-contracts-file-structure.zh-CN.md')
  const systemDoc = await readDoc('docs/presto-platform/2026-03-19-workflow-plugin-system-design.zh-CN.md')
  const guideDoc = await readDoc('docs/presto-platform/2026-03-19-workflow-plugin-development-guide.zh-CN.md')

  assert.match(contractsDoc, /插件正式 SDK/)
  assert.match(systemDoc, /runtime service 提供/)
  assert.match(guideDoc, /插件正式 SDK 的 runtime service，不是 capability/)
})

test('plugin docs list mac accessibility runtime service names', async () => {
  const systemDoc = await readDoc('docs/presto-platform/2026-03-19-workflow-plugin-system-design.zh-CN.md')
  const guideDoc = await readDoc('docs/presto-platform/2026-03-19-workflow-plugin-development-guide.zh-CN.md')

  for (const service of [
    'macAccessibility.preflight',
    'macAccessibility.runScript',
    'macAccessibility.runFile',
  ]) {
    assert.match(systemDoc, new RegExp(service.replace('.', '\\.')))
    assert.match(guideDoc, new RegExp(service.replace('.', '\\.')))
  }
})

test('plugin docs keep raw runtime/backend boundaries closed', async () => {
  const contractsDoc = await readDoc('docs/presto-platform/2026-03-19-plugin-contracts-file-structure.zh-CN.md')
  const systemDoc = await readDoc('docs/presto-platform/2026-03-19-workflow-plugin-system-design.zh-CN.md')
  const guideDoc = await readDoc('docs/presto-platform/2026-03-19-workflow-plugin-development-guide.zh-CN.md')

  for (const token of ['原始 Electron IPC', 'PTSL', 'backend/presto/**', 'backend DAW adapter internals']) {
    assert.match(contractsDoc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(systemDoc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(guideDoc, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
