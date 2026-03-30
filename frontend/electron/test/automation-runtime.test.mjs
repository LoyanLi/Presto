import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const runtimeModulePath = path.resolve(currentDir, '../runtime/automationRuntime.mjs')
const runtimeModule = await import(pathToFileURL(runtimeModulePath).href)
const { createAutomationRuntime } = runtimeModule

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'presto-automation-runtime-'))
  const definitionsDir = path.join(root, 'definitions')
  const scriptsDir = path.join(root, 'scripts')
  await mkdir(definitionsDir, { recursive: true })
  await mkdir(scriptsDir, { recursive: true })
  await writeFile(
    path.join(definitionsDir, 'splitStereoToMono.json'),
    JSON.stringify({
      id: 'protools.splitStereoToMono',
      title: 'Split Stereo To Mono',
      app: 'pro_tools',
      description: 'Split the selected stereo track into mono and keep the chosen channel.',
      scriptFile: 'protoolsSplitStereoToMono.applescript',
      inputKeys: ['trackName'],
    }),
    'utf8',
  )
  await writeFile(path.join(scriptsDir, 'protoolsSplitStereoToMono.applescript'), '-- fixture', 'utf8')
  return {
    definitionsDir,
    scriptsDir,
  }
}

test('automation runtime lists shipped definitions metadata', async () => {
  const fixture = await createFixture()
  const runtime = createAutomationRuntime({
    definitionsDir: fixture.definitionsDir,
    scriptsDir: fixture.scriptsDir,
    macAccessibilityRuntime: {
      preflight: async () => ({ ok: true, trusted: true }),
      runFile: async () => ({ ok: true, stdout: '{}', stderr: '' }),
    },
  })

  const definitions = await runtime.listDefinitions()
  assert.deepEqual(definitions, [
    {
      id: 'protools.splitStereoToMono',
      title: 'Split Stereo To Mono',
      app: 'pro_tools',
      description: 'Split the selected stereo track into mono and keep the chosen channel.',
    },
  ])
})

test('automation runtime rejects unknown definitions with structured error payload', async () => {
  const fixture = await createFixture()
  const runtime = createAutomationRuntime({
    definitionsDir: fixture.definitionsDir,
    scriptsDir: fixture.scriptsDir,
    macAccessibilityRuntime: {
      preflight: async () => ({ ok: true, trusted: true }),
      runFile: async () => ({ ok: true, stdout: '{}', stderr: '' }),
    },
  })

  const result = await runtime.runDefinition({
    definitionId: 'missing.definition',
    input: {},
  })

  assert.deepEqual(result, {
    ok: false,
    steps: [],
    error: {
      code: 'AUTOMATION_DEFINITION_NOT_FOUND',
      message: 'Unknown automation definition: missing.definition',
    },
  })
})

test('automation runtime executes definition through mac accessibility runtime and returns step statuses', async () => {
  const fixture = await createFixture()
  const invocations = []
  const runtime = createAutomationRuntime({
    definitionsDir: fixture.definitionsDir,
    scriptsDir: fixture.scriptsDir,
    macAccessibilityRuntime: {
      preflight: async () => ({ ok: true, trusted: true }),
      runFile: async (scriptPath, args) => {
        invocations.push({ scriptPath, args })
        return {
          ok: true,
          stdout: JSON.stringify({
            keptTrackName: 'Lead Vox',
          }),
          stderr: '',
        }
      },
    },
  })

  const result = await runtime.runDefinition({
    definitionId: 'protools.splitStereoToMono',
    input: {
      trackName: 'Lead Vox',
    },
  })

  assert.deepEqual(invocations, [
    {
      scriptPath: path.join(fixture.scriptsDir, 'protoolsSplitStereoToMono.applescript'),
      args: ['Lead Vox'],
    },
  ])
  assert.deepEqual(result, {
    ok: true,
    steps: [
      {
        id: 'preflight',
        status: 'succeeded',
      },
      {
        id: 'execute',
        status: 'succeeded',
      },
    ],
    output: {
      keptTrackName: 'Lead Vox',
    },
  })
})

test('automation runtime returns execution step errors when mac accessibility runtime fails', async () => {
  const fixture = await createFixture()
  const runtime = createAutomationRuntime({
    definitionsDir: fixture.definitionsDir,
    scriptsDir: fixture.scriptsDir,
    macAccessibilityRuntime: {
      preflight: async () => ({ ok: true, trusted: true }),
      runFile: async () => ({
        ok: false,
        stdout: '',
        stderr: 'script failed',
        error: {
          code: 'MAC_ACCESSIBILITY_EXECUTION_FAILED',
          message: 'script failed',
        },
      }),
    },
  })

  const result = await runtime.runDefinition({
    definitionId: 'protools.splitStereoToMono',
    input: {
      trackName: 'Lead Vox',
    },
  })

  assert.deepEqual(result, {
    ok: false,
    steps: [
      {
        id: 'preflight',
        status: 'succeeded',
      },
      {
        id: 'execute',
        status: 'failed',
        message: 'script failed',
      },
    ],
    error: {
      code: 'MAC_ACCESSIBILITY_EXECUTION_FAILED',
      message: 'script failed',
      stepId: 'execute',
      details: {
        definitionId: 'protools.splitStereoToMono',
      },
    },
  })
})
