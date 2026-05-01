import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('host home surface renders the dedicated runs surface instead of the placeholder section', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostHomeSurface.tsx'), 'utf8')

  assert.match(source, /from '\.\/HostRunsSurface'/)
  assert.match(source, /if \(surface === 'runs'\) \{\s*return <HostRunsSurface locale=\{locale\} labelOverrides=\{runMetricLabelOverrides\} \/>/)
  assert.doesNotMatch(source, /title=\{translateHost\(locale, 'home\.runs\.title'\)\}\s+locale=\{locale\}/)
})
