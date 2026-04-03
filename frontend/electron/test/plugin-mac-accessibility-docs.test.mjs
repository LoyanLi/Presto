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
  const guideDoc = await readDoc('docs/third-party-plugin-development.md')

  assert.match(guideDoc, /插件开发规范与流程/)
  assert.match(guideDoc, /当前真实有效的插件协议/)
  assert.match(guideDoc, /插件负责定义，不负责直接执行宿主或外部系统操作/)
})

test('plugin docs list mac accessibility runtime service names', async () => {
  const guideDoc = await readDoc('docs/third-party-plugin-development.md')

  assert.match(guideDoc, /插件不能直接控制外部 app/)
  assert.match(guideDoc, /插件不能使用 `context\.runtime`/)
  assert.match(guideDoc, /插件不能依赖 `shell\.openPath`、`dialog\.openFolder`、`fs\.\*`、`mobileProgress\.\*`/)
})

test('plugin docs keep raw runtime/backend boundaries closed', async () => {
  const guideDoc = await readDoc('docs/third-party-plugin-development.md')

  assert.match(guideDoc, /插件不能直接控制外部 app/)
  assert.match(guideDoc, /不能直接访问宿主私有 runtime/)
  assert.match(guideDoc, /直接调用 Electron、Node 文件系统或系统 shell/)
})
