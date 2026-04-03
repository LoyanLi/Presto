import path from 'node:path'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`missing_env:${name}`)
  }
  return value
}

export function resolveSidecarAppDataDir(): string {
  return path.resolve(requireEnv('PRESTO_APP_DATA_DIR'))
}

export function resolveSidecarResourcesDir(): string {
  return path.resolve(requireEnv('PRESTO_RESOURCES_DIR'))
}

export function resolveManagedPluginsRoot(): string {
  return path.join(resolveSidecarAppDataDir(), 'extensions')
}

export function resolveLogsDir(): string {
  return path.join(resolveSidecarAppDataDir(), 'logs')
}

export function resolveOfficialPluginsRoot(): string {
  return path.join(resolveSidecarResourcesDir(), 'plugins', 'official')
}

export function resolveAutomationDefinitionsDir(): string {
  return path.join(resolveSidecarResourcesDir(), 'frontend', 'runtime', 'automation', 'definitions')
}

export function resolveAutomationScriptsDir(): string {
  return path.join(resolveSidecarResourcesDir(), 'frontend', 'runtime', 'automation', 'scripts')
}

export function resolveBackendRoot(): string {
  return path.join(resolveSidecarResourcesDir(), 'backend', 'presto')
}
