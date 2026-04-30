import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('useDawStatusPolling reads session name from daw.connection.getStatus without calling session.getInfo', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/hooks/useDawStatusPolling.ts'), 'utf8')

  assert.match(source, /await developerPresto\.daw\.connection\.getStatus\(\)/)
  assert.match(source, /status\.sessionName \?\? ''/)
  assert.doesNotMatch(source, /developerPresto\?\.session/)
  assert.doesNotMatch(source, /developerPresto\.session\.getInfo/)
})

test('useDawStatusPolling models DAW status as connected, disconnected, or unknown instead of forcing probe failures into disconnected', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/hooks/useDawStatusPolling.ts'), 'utf8')

  assert.match(source, /export type HostDawConnectionState = 'connected' \| 'disconnected' \| 'unknown'/)
  assert.match(source, /status:\s*'unknown'/)
  assert.match(source, /status:\s*current\.status/)
  assert.doesNotMatch(source, /connected:\s*false,\s*[\s\S]*statusLabel:\s*translateHost\(resolvedLocale, 'general\.disconnected'\)/)
})

test('useDawStatusPolling probes the DAW connection before startup and manual status reads', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/hooks/useDawStatusPolling.ts'), 'utf8')

  assert.match(source, /const DAW_CONNECT_PROBE_TIMEOUT_SECONDS = 5/)
  assert.match(source, /const pendingConnectionProbeRef = useRef\(true\)/)
  assert.match(source, /const shouldProbeConnection = pendingConnectionProbeRef\.current[\s\S]*await refreshDawStatus\(\{ probeConnection: shouldProbeConnection \}\)/)
  assert.match(source, /timeoutId = setTimeout\(\(\) => \{\s*void refreshDawStatus\(\{ probeConnection: false \}\)/)
  assert.match(source, /refresh: \(\) => \{\s*pendingConnectionProbeRef\.current = true/)
  assert.match(source, /DAW connection probing is best-effort/)
})
