import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

async function assertFileMissing(filePath) {
  await assert.rejects(
    () => access(filePath),
    (error) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'),
  )
}

test('PluginContext contract no longer exposes runtime', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/context.ts'), 'utf8')
  assert.doesNotMatch(source, /from '\.\/runtime'/)
  assert.doesNotMatch(source, /runtime:\s*PluginRuntime/)
})

test('WorkflowPluginManifest no longer exposes runtime service requirements', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/manifest.ts'), 'utf8')
  assert.doesNotMatch(source, /from '\.\/runtime'/)
  assert.doesNotMatch(source, /PluginRuntimeServiceName/)
  assert.doesNotMatch(source, /requiredRuntimeServices\??:/)
})

test('workflow plugin contracts expose workflow definition references and step definitions', async () => {
  const manifestSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/manifest.ts'), 'utf8')
  const workflowSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/index.ts'), 'utf8')
  const workflowRequestSource = await readFile(path.join(repoRoot, 'packages/contracts/src/capabilities/requests.ts'), 'utf8')

  assert.match(manifestSource, /workflowDefinition\??:\s*WorkflowDefinitionReference/)
  assert.match(manifestSource, /WorkflowDefinitionReference/)
  assert.match(workflowSource, /WorkflowDefinitionReference/)
  assert.match(workflowSource, /WorkflowDefinition/)
  assert.match(workflowSource, /WorkflowStepDefinition/)
  assert.match(workflowRequestSource, /pluginId:\s*string/)
  assert.match(workflowRequestSource, /workflowId:\s*string/)
  assert.doesNotMatch(workflowRequestSource, /definition\??:\s*WorkflowDefinition/)
  assert.doesNotMatch(workflowRequestSource, /allowedCapabilities\??:\s*string\[\]/)
})

test('contracts plugin barrels no longer export plugin runtime types', async () => {
  const pluginsSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/index.ts'), 'utf8')
  assert.doesNotMatch(pluginsSource, /PluginRuntime/)
  assert.doesNotMatch(pluginsSource, /PluginRuntimeServiceName/)
  assert.doesNotMatch(pluginsSource, /AutomationDefinition/)
  assert.doesNotMatch(pluginsSource, /AutomationRunDefinitionRequest/)
  assert.doesNotMatch(pluginsSource, /AutomationRunDefinitionResult/)
  assert.doesNotMatch(pluginsSource, /AutomationRunDefinitionStepResult/)
})

test('contracts root index keeps plugin exports type-only', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/index.ts'), 'utf8')
  assert.match(source, /export type \* from '\.\/plugins'/)
  assert.doesNotMatch(source, /export \* from '\.\/plugins'/)
})

test('generate-contracts script no longer references runtime service manifest artifacts', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/generate-contracts.mjs'), 'utf8')
  assert.doesNotMatch(source, /runtime-services\.json/)
  assert.doesNotMatch(source, /plugin-permissions\.json/)
  assert.doesNotMatch(source, /generateTsRuntimeServices/)
  assert.doesNotMatch(source, /runtimeServices\.ts/)
})

test('plugin runtime contract artifacts are removed', async () => {
  await assertFileMissing(path.join(repoRoot, 'packages/contracts/src/plugins/runtime.ts'))
  await assertFileMissing(path.join(repoRoot, 'packages/contracts-manifest/runtime-services.json'))
  await assertFileMissing(path.join(repoRoot, 'packages/contracts-manifest/plugin-permissions.json'))
})
