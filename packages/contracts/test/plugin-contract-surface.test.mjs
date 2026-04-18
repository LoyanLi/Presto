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

test('plugin contracts expose tool plugin page and runner surfaces', async () => {
  const manifestSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/manifest.ts'), 'utf8')
  const pageSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/page.ts'), 'utf8')
  const moduleSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/module.ts'), 'utf8')
  const pluginIndexSource = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/index.ts'), 'utf8')

  assert.match(manifestSource, /extensionType:\s*PluginExtensionType/)
  assert.match(manifestSource, /'workflow' \| 'automation' \| 'tool'/)
  assert.match(manifestSource, /tools\??:\s*PluginToolDefinition\[\]/)
  assert.match(manifestSource, /toolRuntimePermissions\??:\s*PluginToolRuntimePermission\[\]/)
  assert.match(manifestSource, /bundledResources\??:\s*PluginBundledResourceDefinition\[\]/)

  assert.match(pageSource, /mount:\s*PluginPageMount/)
  assert.match(pageSource, /'workspace' \| 'tools'/)
  assert.match(pageSource, /export interface PluginToolPageHost/)
  assert.match(pageSource, /export interface PluginToolDialogFileFilter/)
  assert.match(pageSource, /export interface PluginToolDialogOpenFileOptions/)
  assert.match(pageSource, /dialog:\s*PluginToolDialogHost/)
  assert.match(pageSource, /openFile\(options\?: PluginToolDialogOpenFileOptions\)/)
  assert.match(pageSource, /fs:\s*PluginToolFsHost/)
  assert.match(pageSource, /shell:\s*PluginToolShellHost/)
  assert.match(pageSource, /export interface PluginToolRunRequest/)
  assert.match(pageSource, /export interface PluginToolRunResponse/)
  assert.match(pageSource, /runTool\(request:\s*PluginToolRunRequest\):\s*Promise<PluginToolRunResponse>/)
  assert.match(pageSource, /export interface PluginToolPageProps/)

  assert.match(moduleSource, /export interface PluginToolBundledProcessHost/)
  assert.match(moduleSource, /execBundled\(/)
  assert.match(moduleSource, /export interface PluginToolRunnerContext extends PluginContext/)
  assert.match(moduleSource, /export type PluginToolRunner =/)

  assert.match(pluginIndexSource, /PluginExtensionType/)
  assert.match(pluginIndexSource, /PluginToolDefinition/)
  assert.match(pluginIndexSource, /PluginToolRuntimePermission/)
  assert.match(pluginIndexSource, /PluginBundledResourceDefinition/)
  assert.match(pluginIndexSource, /PluginToolPageProps/)
  assert.match(pluginIndexSource, /PluginToolDialogOpenFileOptions/)
  assert.match(pluginIndexSource, /PluginToolRunRequest/)
  assert.match(pluginIndexSource, /PluginToolRunResponse/)
  assert.match(pluginIndexSource, /PluginToolRunnerContext/)
  assert.match(pluginIndexSource, /PluginToolRunner/)
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

test('public DAW capability ids use a unified daw namespace', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts-manifest/capabilities.json'), 'utf8'),
  )

  const hostRoots = new Set(['system', 'config', 'jobs', 'workflow'])
  const legacyIds = manifest
    .filter((capability) => capability.visibility === 'public')
    .map((capability) => capability.id)
    .filter((capabilityId) => !capabilityId.startsWith('daw.'))
    .filter((capabilityId) => !hostRoots.has(capabilityId.split('.')[0]))

  assert.deepEqual(legacyIds, [])
})

test('capability manifest entries declare workflow portability and per-daw implementations explicitly', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts-manifest/capabilities.json'), 'utf8'),
  )

  const missingMetadata = manifest
    .filter((capability) => !capability.workflowScope || !capability.portability || !capability.implementations)
    .map((capability) => capability.id)

  assert.deepEqual(missingMetadata, [])

  const trackMute = manifest.find((capability) => capability.id === 'daw.track.mute.set')
  assert.equal(trackMute?.workflowScope, 'shared')
  assert.equal(trackMute?.portability, 'canonical')
  assert.deepEqual(trackMute?.implementations?.pro_tools, {
    kind: 'handler',
    handler: 'daw.track.mute.set',
  })

  const ptslExecute = manifest.find((capability) => capability.id === 'daw.ptsl.command.execute')
  assert.equal(ptslExecute?.workflowScope, 'internal')
  assert.equal(ptslExecute?.portability, 'daw_specific')
  assert.deepEqual(ptslExecute?.implementations?.pro_tools, {
    kind: 'handler',
    handler: 'daw.ptsl.command.execute',
  })

  const stripSilenceExecuteViaUi = manifest.find((capability) => capability.id === 'daw.stripSilence.executeViaUi')
  assert.equal(stripSilenceExecuteViaUi?.workflowScope, 'internal')
  assert.equal(stripSilenceExecuteViaUi?.portability, 'daw_specific')
  assert.deepEqual(stripSilenceExecuteViaUi?.implementations?.pro_tools, {
    kind: 'ui_automation',
    handler: 'daw.stripSilence.executeViaUi',
  })
})

test('generated capability registry includes full vendor-neutral public daw semantic wrapper surface', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/generated/capabilityRegistry.ts'), 'utf8')
  const capabilityIdsSource = await readFile(path.join(repoRoot, 'packages/contracts/src/generated/capabilityIds.ts'), 'utf8')

  const publicSemantic = source.match(/kind":"ptsl_command","command":"CId_[^"]+"/g) ?? []
  const ptslSemanticIdsMatch = capabilityIdsSource.match(/export const PTSL_SEMANTIC_CAPABILITY_IDS = (\[[\s\S]*?\]) as const/)

  assert.equal(publicSemantic.length, 143)
  assert.ok(ptslSemanticIdsMatch)
  assert.doesNotMatch(ptslSemanticIdsMatch[1], /daw\.ptsl\./)
  assert.match(ptslSemanticIdsMatch[1], /daw\.sessionFile\.createSession/)
  assert.match(source, /id: 'daw\.sessionFile\.createSession'/)
  assert.match(source, /implementations: \{\"pro_tools\":\{\"kind\":\"ptsl_command\",\"command\":\"CId_CreateSession\"\}\} as const/)
})

test('import workflow capability metadata declares import mode, ixml cleanup, and fade coverage explicitly', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts-manifest/capabilities.json'), 'utf8'),
  )
  const requestsSource = await readFile(path.join(repoRoot, 'packages/contracts/src/capabilities/requests.ts'), 'utf8')
  const responsesSource = await readFile(path.join(repoRoot, 'packages/contracts/src/capabilities/responses.ts'), 'utf8')
  const registrySource = await readFile(path.join(repoRoot, 'packages/contracts/src/generated/capabilityRegistry.ts'), 'utf8')
  const clientsSource = await readFile(path.join(repoRoot, 'packages/contracts/src/capabilities/clients.ts'), 'utf8')

  const planRunItems = manifest.find((capability) => capability.id === 'daw.import.planRunItems')
  assert.deepEqual(planRunItems?.fieldSupport?.pro_tools, {
    requestFields: ['rows', 'categories', 'importedTrackNames', 'stripAfterImport', 'fadeAfterStrip'],
    responseFields: ['items'],
  })

  const importRunStart = manifest.find((capability) => capability.id === 'daw.import.run.start')
  assert.deepEqual(importRunStart?.fieldSupport?.pro_tools, {
    requestFields: ['folderPaths', 'orderedFilePaths', 'importMode', 'deleteIxmlIfPresent', 'host', 'port', 'timeoutSeconds'],
    responseFields: ['jobId', 'capability', 'state'],
  })

  assert.match(requestsSource, /deleteIxmlIfPresent\?: boolean/)
  assert.match(responsesSource, /hasIxml: boolean/)
  assert.match(clientsSource, /analyze\(request: ImportAnalyzeRequest\): Promise<ImportAnalyzeResponse>/)
  assert.match(responsesSource, /fadeAfterStrip:\s*boolean/)
  assert.match(
    registrySource,
    /id: 'daw\.editing\.createFadesBasedOnPreset'[\s\S]*?fieldSupport: \{"pro_tools":\{"requestFields":\["fade_preset_name","auto_adjust_bounds"\],"responseFields":\["command","result"\]\}\} as const,/,
  )
})

test('track inactive capability keeps its own handler in the manifest', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts-manifest/capabilities.json'), 'utf8'),
  )

  const definition = manifest.find((capability) => capability.id === 'daw.track.inactive.set')

  assert.equal(definition?.handler, 'daw.track.inactive.set')
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
