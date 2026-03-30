import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const runtimeModulePath = path.resolve(currentDir, '../runtime/macAccessibilityRuntime.mjs')
const runtimeModule = await import(pathToFileURL(runtimeModulePath).href)
const { createMacAccessibilityRuntime } = runtimeModule

test('macAccessibility preflight reports trusted accessibility access on darwin', async () => {
  const invocations = []
  const runtime = createMacAccessibilityRuntime({
    platform: 'darwin',
    execFile(command, args, _options, callback) {
      invocations.push({ command, args })
      callback(null, 'true\n', '')
    },
  })

  const result = await runtime.preflight()
  assert.deepEqual(invocations, [
    {
      command: 'osascript',
      args: ['-e', 'tell application "System Events" to return UI elements enabled'],
    },
  ])
  assert.deepEqual(result, {
    ok: true,
    trusted: true,
  })
})

test('macAccessibility runtime runs script text with args and returns stdout/stderr', async () => {
  const invocations = []
  const runtime = createMacAccessibilityRuntime({
    platform: 'darwin',
    execFile(command, args, _options, callback) {
      invocations.push({ command, args })
      callback(null, 'script stdout\n', 'script stderr\n')
    },
  })

  const result = await runtime.runScript('on run argv\nreturn item 1 of argv\nend run', ['A', 'B'])
  assert.deepEqual(invocations, [
    {
      command: 'osascript',
      args: ['-e', 'on run argv\nreturn item 1 of argv\nend run', 'A', 'B'],
    },
  ])
  assert.deepEqual(result, {
    ok: true,
    stdout: 'script stdout',
    stderr: 'script stderr',
  })
})

test('macAccessibility runtime runs .scpt/.applescript files with args and blocks unsupported extensions', async () => {
  const invocations = []
  const runtime = createMacAccessibilityRuntime({
    platform: 'darwin',
    execFile(command, args, _options, callback) {
      invocations.push({ command, args })
      callback(null, 'file stdout\n', '')
    },
  })

  const runScpt = await runtime.runFile('/tmp/example.scpt', ['Track 1'])
  assert.equal(runScpt.ok, true)
  assert.equal(runScpt.stdout, 'file stdout')

  const runAppleScript = await runtime.runFile('/tmp/example.applescript', ['Track 2'])
  assert.equal(runAppleScript.ok, true)
  assert.equal(runAppleScript.stdout, 'file stdout')

  assert.deepEqual(invocations, [
    { command: 'osascript', args: ['/tmp/example.scpt', 'Track 1'] },
    { command: 'osascript', args: ['/tmp/example.applescript', 'Track 2'] },
  ])

  const invalid = await runtime.runFile('/tmp/example.txt', ['Track 3'])
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error?.code, 'MAC_ACCESSIBILITY_INVALID_FILE_TYPE')
})

test('macAccessibility runtime returns structured errors for osascript failures', async () => {
  const runtime = createMacAccessibilityRuntime({
    platform: 'darwin',
    execFile(_command, args, _options, callback) {
      const error = new Error('osascript failed')
      error.code = 1
      error.signal = null
      callback(error, '', `stderr for ${args[0]}\n`)
    },
  })

  const result = await runtime.runScript('return "x"', ['arg1'])
  assert.equal(result.ok, false)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'stderr for -e')
  assert.equal(result.error?.code, 'MAC_ACCESSIBILITY_EXECUTION_FAILED')
  assert.equal(result.error?.message, 'stderr for -e')
  assert.deepEqual(result.error?.details?.args, ['-e', 'return "x"', 'arg1'])
})

test('macAccessibility runtime returns unsupported on non-macOS and does not execute commands', async () => {
  let callCount = 0
  const runtime = createMacAccessibilityRuntime({
    platform: 'linux',
    execFile(_command, _args, _options, callback) {
      callCount += 1
      callback(new Error('should not execute'), '', '')
    },
  })

  const preflight = await runtime.preflight()
  assert.deepEqual(preflight, {
    ok: false,
    trusted: false,
    error: 'MAC_ACCESSIBILITY_UNSUPPORTED',
  })

  const runScript = await runtime.runScript('return "x"', ['arg1'])
  assert.equal(runScript.ok, false)
  assert.equal(runScript.error?.code, 'MAC_ACCESSIBILITY_UNSUPPORTED')
  assert.equal(runScript.stdout, '')

  const runFile = await runtime.runFile('/tmp/example.scpt', ['arg1'])
  assert.equal(runFile.ok, false)
  assert.equal(runFile.error?.code, 'MAC_ACCESSIBILITY_UNSUPPORTED')
  assert.equal(callCount, 0)
})

test('electron runtime bridge and main process register macAccessibility channels', async () => {
  const runtimeBridgeSource = await readFile(path.join(repoRoot, 'frontend/electron/runtime/runtimeBridge.ts'), 'utf8')
  const mainSource = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')
  const automationRuntimeSource = await readFile(path.join(repoRoot, 'frontend/electron/runtime/automationRuntime.mjs'), 'utf8')

  assert.match(runtimeBridgeSource, /macAccessibility:\s*\{/)
  assert.match(runtimeBridgeSource, /preflight:\s*'macAccessibility:preflight'/)
  assert.match(runtimeBridgeSource, /runScript:\s*'macAccessibility:run-script'/)
  assert.match(runtimeBridgeSource, /runFile:\s*'macAccessibility:run-file'/)
  assert.match(mainSource, /createAutomationRuntime/)
  assert.match(mainSource, /ipcMain\.handle\('automation:list-definitions'/)
  assert.match(mainSource, /ipcMain\.handle\('automation:run-definition'/)
  assert.match(automationRuntimeSource, /runDefinition\(request = \{\}\)/)
  assert.match(mainSource, /ipcMain\.handle\('macAccessibility:preflight'/)
  assert.match(mainSource, /ipcMain\.handle\('macAccessibility:run-script'/)
  assert.match(mainSource, /ipcMain\.handle\('macAccessibility:run-file'/)
})
