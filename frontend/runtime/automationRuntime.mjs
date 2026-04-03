import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

function normalizeStep(id, status, message) {
  return message ? { id, status, message } : { id, status }
}

async function readDefinitions({ definitionsDir, scriptsDir, readFileFn = readFile, readdirFn = readdir }) {
  const fileNames = (await readdirFn(definitionsDir)).filter((fileName) => fileName.endsWith('.json')).sort()
  const definitions = []

  for (const fileName of fileNames) {
    const source = await readFileFn(path.join(definitionsDir, fileName), 'utf8')
    const parsed = JSON.parse(source)
    const id = String(parsed.id ?? '').trim()
    const title = String(parsed.title ?? '').trim()
    const app = String(parsed.app ?? '').trim()
    const scriptFile = String(parsed.scriptFile ?? '').trim()

    if (!id || !title || !app || !scriptFile) {
      continue
    }

    definitions.push({
      id,
      title,
      app,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      scriptPath: path.join(scriptsDir, scriptFile),
      inputKeys: Array.isArray(parsed.inputKeys) ? parsed.inputKeys.map((value) => String(value)) : [],
    })
  }

  return definitions
}

function parseOutput(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) {
    return undefined
  }

  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed }
  } catch {
    return {
      stdout: text,
    }
  }
}

export function createAutomationRuntime({
  definitionsDir,
  scriptsDir,
  macAccessibilityRuntime,
  readFileFn,
  readdirFn,
}) {
  let definitionsPromise = null

  async function loadDefinitions() {
    if (!definitionsPromise) {
      definitionsPromise = readDefinitions({
        definitionsDir,
        scriptsDir,
        readFileFn,
        readdirFn,
      })
    }

    return definitionsPromise
  }

  return {
    async listDefinitions() {
      const definitions = await loadDefinitions()
      return definitions.map((definition) => ({
        id: definition.id,
        title: definition.title,
        app: definition.app,
        ...(definition.description ? { description: definition.description } : {}),
      }))
    },

    async runDefinition(request = {}) {
      const definitionId = String(request.definitionId ?? '').trim()
      const definitions = await loadDefinitions()
      const definition = definitions.find((candidate) => candidate.id === definitionId)

      if (!definition) {
        return {
          ok: false,
          steps: [],
          error: {
            code: 'AUTOMATION_DEFINITION_NOT_FOUND',
            message: `Unknown automation definition: ${definitionId || 'unknown'}`,
          },
        }
      }

      const preflightResult = await macAccessibilityRuntime.preflight()
      if (!preflightResult.ok || !preflightResult.trusted) {
        return {
          ok: false,
          steps: [normalizeStep('preflight', 'failed', preflightResult.error ?? 'mac accessibility unavailable')],
          error: {
            code: preflightResult.error ?? 'MAC_ACCESSIBILITY_UNAVAILABLE',
            message: preflightResult.error ?? 'mac accessibility unavailable',
            stepId: 'preflight',
            details: {
              definitionId,
            },
          },
        }
      }

      const input = request.input && typeof request.input === 'object' ? request.input : {}
      const args = definition.inputKeys.map((key) => String(input[key] ?? ''))
      const executionResult = await macAccessibilityRuntime.runFile(definition.scriptPath, args)

      if (!executionResult.ok) {
        return {
          ok: false,
          steps: [
            normalizeStep('preflight', 'succeeded'),
            normalizeStep('execute', 'failed', executionResult.error?.message ?? 'automation execution failed'),
          ],
          error: {
            code: executionResult.error?.code ?? 'AUTOMATION_EXECUTION_FAILED',
            message: executionResult.error?.message ?? 'automation execution failed',
            stepId: 'execute',
            details: {
              definitionId,
            },
          },
        }
      }

      return {
        ok: true,
        steps: [normalizeStep('preflight', 'succeeded'), normalizeStep('execute', 'succeeded')],
        ...(parseOutput(executionResult.stdout) ? { output: parseOutput(executionResult.stdout) } : {}),
      }
    },
  }
}
