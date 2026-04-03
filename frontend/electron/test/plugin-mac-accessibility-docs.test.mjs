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

test('plugin docs describe the current plugin protocol', async () => {
  const guideDoc = await readDoc('docs/plugin-development/plugin-development-spec.md')

  assert.match(guideDoc, /插件开发规范/)
  assert.match(guideDoc, /当前 `0\.3\.0-alpha\.2` 代码已经成立的插件协议/)
  assert.match(guideDoc, /插件负责定义，不负责直接执行宿主或外部系统操作/)
})

test('plugin docs keep runtime closed but document page host folder picking', async () => {
  const guideDoc = await readDoc('docs/plugin-development/plugin-development-spec.md')

  assert.match(guideDoc, /插件 `activate\(context\)` 拿不到宿主通用 runtime/)
  assert.match(guideDoc, /`host\.pickFolder\(\)`/)
  assert.match(guideDoc, /页面 host 是页面渲染时的宿主辅助能力，不是插件通用 runtime/)
})

test('plugin docs keep raw runtime/backend boundaries closed', async () => {
  const guideDoc = await readDoc('docs/plugin-development/plugin-development-spec.md')

  assert.match(guideDoc, /插件不能直接控制外部 app/)
  assert.match(guideDoc, /插件当前不是宿主直通脚本模型/)
  assert.match(guideDoc, /插件执行正式业务动作时，必须走 `context\.presto\.\*`/)
})
