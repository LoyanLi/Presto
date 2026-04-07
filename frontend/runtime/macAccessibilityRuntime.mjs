import { execFile as nodeExecFile } from 'node:child_process'
import path from 'node:path'

const OSASCRIPT_COMMAND = 'osascript'
const DEFAULT_EXECUTION_TIMEOUT_MS = 10_000
const MAC_ACCESSIBILITY_PERMISSION_REQUIRED = 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED'

function normalizeOutput(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.replace(/\r\n/g, '\n').trim()
}

function normalizeArgs(args) {
  if (!Array.isArray(args)) {
    return []
  }
  return args.map((value) => String(value))
}

function createUnsupportedPreflightResult() {
  return {
    ok: false,
    trusted: false,
    error: 'MAC_ACCESSIBILITY_UNSUPPORTED',
  }
}

function createUnsupportedExecutionResult(platform) {
  return {
    ok: false,
    stdout: '',
    stderr: '',
    error: {
      code: 'MAC_ACCESSIBILITY_UNSUPPORTED',
      message: 'macAccessibility runtime service is available on macOS only.',
      details: {
        platform,
      },
    },
  }
}

function createInvalidFileTypeResult(filePath) {
  return {
    ok: false,
    stdout: '',
    stderr: '',
    error: {
      code: 'MAC_ACCESSIBILITY_INVALID_FILE_TYPE',
      message: 'Only .scpt and .applescript files are supported.',
      details: {
        path: filePath,
      },
    },
  }
}

function isAccessibilityPermissionDenied(message) {
  const normalized = normalizeOutput(message).toLowerCase()
  if (!normalized) {
    return false
  }

  return normalized.includes('not allowed assistive access') || normalized.includes('assistive access')
}

function runOsascript(execFile, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(OSASCRIPT_COMMAND, args, { encoding: 'utf8', timeout: timeoutMs }, (error, stdout, stderr) => {
      const normalizedStdout = normalizeOutput(stdout)
      const normalizedStderr = normalizeOutput(stderr)

      if (!error) {
        resolve({
          ok: true,
          stdout: normalizedStdout,
          ...(normalizedStderr ? { stderr: normalizedStderr } : {}),
        })
        return
      }

      const rawMessage = normalizedStderr || normalizedStdout || error.message || 'AppleScript execution failed.'
      const errorCode =
        error.code === 'ETIMEDOUT'
          ? 'MAC_ACCESSIBILITY_TIMEOUT'
          : isAccessibilityPermissionDenied(rawMessage)
            ? MAC_ACCESSIBILITY_PERMISSION_REQUIRED
            : 'MAC_ACCESSIBILITY_EXECUTION_FAILED'
      const message =
        errorCode === MAC_ACCESSIBILITY_PERMISSION_REQUIRED
          ? 'Presto needs macOS Accessibility permission. Open System Settings > Privacy & Security > Accessibility and enable Presto.'
          : rawMessage
      resolve({
        ok: false,
        stdout: normalizedStdout,
        ...(normalizedStderr ? { stderr: normalizedStderr } : {}),
        error: {
          code: errorCode,
          message,
          details: {
            command: OSASCRIPT_COMMAND,
            args,
            exitCode: typeof error.code === 'number' ? error.code : null,
            signal: error.signal ?? null,
            ...(normalizedStdout ? { stdout: normalizedStdout } : {}),
            ...(normalizedStderr ? { stderr: normalizedStderr } : {}),
          },
        },
      })
    })
  })
}

export function createMacAccessibilityRuntime(options = {}) {
  const platform = options.platform ?? process.platform
  const execFile = options.execFile ?? nodeExecFile
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS

  async function preflight() {
    if (platform !== 'darwin') {
      return createUnsupportedPreflightResult()
    }

    const script = 'tell application "System Events" to return UI elements enabled'
    const result = await runOsascript(execFile, ['-e', script], timeoutMs)
    if (!result.ok) {
      return {
        ok: false,
        trusted: false,
        error: result.error?.code ?? 'MAC_ACCESSIBILITY_EXECUTION_FAILED',
      }
    }

    const trusted = result.stdout.toLowerCase() === 'true' || result.stdout === '1'
    return {
      ok: true,
      trusted,
    }
  }

  async function runScript(script, args = []) {
    if (platform !== 'darwin') {
      return createUnsupportedExecutionResult(platform)
    }

    const scriptText = typeof script === 'string' ? script : ''
    const normalizedArgs = normalizeArgs(args)
    const commandArgs = ['-e', scriptText, ...normalizedArgs]
    return runOsascript(execFile, commandArgs, timeoutMs)
  }

  async function runFile(filePath, args = []) {
    if (platform !== 'darwin') {
      return createUnsupportedExecutionResult(platform)
    }

    const normalizedPath = typeof filePath === 'string' ? filePath : ''
    const extension = path.extname(normalizedPath).toLowerCase()
    if (extension !== '.scpt' && extension !== '.applescript') {
      return createInvalidFileTypeResult(normalizedPath)
    }

    const normalizedArgs = normalizeArgs(args)
    const commandArgs = [normalizedPath, ...normalizedArgs]
    return runOsascript(execFile, commandArgs, timeoutMs)
  }

  return {
    preflight,
    runScript,
    runFile,
  }
}
