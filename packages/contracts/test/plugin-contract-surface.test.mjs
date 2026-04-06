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

test('automation plugin contracts expose runner and host-rendered option schema types', async () => {
  const pageSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/page.ts'), 'utf8')
  const moduleSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/module.ts'), 'utf8')
  const pluginIndexSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/index.ts'), 'utf8')

  assert.match(pageSource, /runnerExport:\s*string/)
  assert.match(pageSource, /optionsSchema\??:\s*PluginAutomationOptionDefinition\[\]/)
  assert.match(pageSource, /export type PluginAutomationOptionDefinition/)
  assert.match(pageSource, /kind:\s*'boolean'/)
  assert.match(pageSource, /kind:\s*'select'/)
  assert.match(moduleSource, /export interface PluginAutomationMacAccessibility/)
  assert.match(moduleSource, /preflight\(\):\s*Promise<\{ ok: boolean; trusted: boolean; error\?: string \}>/)
  assert.match(moduleSource, /runScript\(script: string, args\?: string\[\]\):/)
  assert.match(moduleSource, /runFile\(path: string, args\?: string\[\]\):/)
  assert.match(moduleSource, /export interface PluginAutomationRunnerContext/)
  assert.match(moduleSource, /macAccessibility:\s*PluginAutomationMacAccessibility/)
  assert.match(moduleSource, /export type PluginAutomationRunner =/)
  assert.match(pluginIndexSource, /PluginAutomationOptionDefinition/)
  assert.match(pluginIndexSource, /PluginAutomationRunner/)
  assert.match(pluginIndexSource, /PluginAutomationRunnerContext/)
})

test('generate-contracts script no longer references runtime service manifest artifacts', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/generate-contracts.mjs'), 'utf8')
  assert.doesNotMatch(source, /runtime-services\.json/)
  assert.doesNotMatch(source, /plugin-permissions\.json/)
  assert.doesNotMatch(source, /generateTsRuntimeServices/)
  assert.doesNotMatch(source, /runtimeServices\.ts/)
})

test('generate-contracts writes Python capability catalog into the runtime backend package path', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/generate-contracts.mjs'), 'utf8')

  assert.match(source, /path\.join\(repoRoot,\s*'backend',\s*'presto',\s*'application',\s*'capabilities'\)/)
  assert.doesNotMatch(
    source,
    /path\.join\(repoRoot,\s*'backend',\s*'import',\s*'presto',\s*'application',\s*'capabilities'\)/,
  )
})

test('public capability manifest entries declare canonical source and field support explicitly', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts-manifest/capabilities.json'), 'utf8'),
  )

  const missingMetadata = manifest
    .filter((capability) => capability.visibility === 'public')
    .filter((capability) => !capability.canonicalSource || !capability.fieldSupport)
    .map((capability) => capability.id)

  assert.deepEqual(missingMetadata, [])
})

test('track inactive capability keeps its own handler in the manifest', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts-manifest/capabilities.json'), 'utf8'),
  )

  const definition = manifest.find((capability) => capability.id === 'track.inactive.set')

  assert.equal(definition?.handler, 'track.inactive.set')
})

test('generate-contracts requires manifest canonical metadata instead of backfilling defaults', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/generate-contracts.mjs'), 'utf8')

  assert.doesNotMatch(source, /if \(Array\.isArray\(capability\.supportedDaws\) && capability\.supportedDaws\.length > 0\) \{\s*return capability\.supportedDaws\[0\]/)
  assert.doesNotMatch(source, /return \{\s*\[resolvedCanonicalSource\]:\s*\{\s*requestFields: \[\],\s*responseFields: \[\],\s*\},\s*\}/)
})

test('plugin runtime contract artifacts are removed', async () => {
  await assertFileMissing(path.join(repoRoot, 'packages/contracts/src/plugins/runtime.ts'))
  await assertFileMissing(path.join(repoRoot, 'packages/contracts-manifest/runtime-services.json'))
  await assertFileMissing(path.join(repoRoot, 'packages/contracts-manifest/plugin-permissions.json'))
})
