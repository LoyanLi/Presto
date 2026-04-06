import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('developer console filters by domain category instead of read/write operation type', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')

  assert.match(source, /capability\.domain === filter/)
  assert.match(source, /type CapabilityFilter = 'all' \| string/)
  assert.doesNotMatch(source, /return capability\.sideEffect === false/)
  assert.doesNotMatch(source, /return capability\.sideEffect === true/)
  assert.doesNotMatch(source, /write side effect/)
})

test('developer console keeps only the registry and inspector workspace surfaces', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')

  assert.match(source, /Command Registry/)
  assert.match(source, /Summary/)
  assert.match(source, /Payload/)
  assert.match(source, /Output/)
  assert.match(source, /Select a command/)
  assert.match(source, /Reset to Default/)
  assert.match(source, /const \[searchQuery, setSearchQuery\] = useState\(''\)/)
  assert.match(source, /placeholder="Search commands"/)
  assert.match(source, /capabilitySearchMatchesQuery/)
  assert.match(source, /developerConsoleShellStyle/)
  assert.match(source, /developerConsoleListStyle/)
  assert.match(source, /developerConsoleInspectorStyle/)
  assert.match(source, /activeCapability\.minimumDawVersion/)
  assert.match(source, /Min DAW/)
  assert.doesNotMatch(source, /Smoke & Validation/)
  assert.doesNotMatch(source, /Capability Console/)
  assert.doesNotMatch(source, /developerConsoleHeaderStyle/)
  assert.doesNotMatch(source, /developerConsoleToolbarStyle/)
  assert.doesNotMatch(source, /showSmokePanel \?/)
  assert.doesNotMatch(source, /footer=\{/)
  assert.doesNotMatch(source, /:: \{state\.phase\}/)
  assert.doesNotMatch(source, /High-density command console for live capability inspection and execution\./)
  assert.doesNotMatch(source, /Tabs items=\{filterItems\}/)
  assert.doesNotMatch(source, />Inspect</)
  assert.doesNotMatch(source, /<CapabilityRow/)
  assert.doesNotMatch(source, /CapabilityRow[\s\S]*?Execute/)
})

test('developer console keeps the inspector fixed and removes leftover filter and collapse controls', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')

  assert.match(source, /const developerConsoleInspectorSummaryCardStyle/)
  assert.match(source, /const developerConsoleInspectorPayloadCardStyle/)
  assert.match(source, /const developerConsoleInspectorOutputCardStyle/)
  assert.doesNotMatch(source, /setShowResultPanel/)
  assert.doesNotMatch(source, /setShowErrorPanel/)
  assert.doesNotMatch(source, /showResultPanel/)
  assert.doesNotMatch(source, /showErrorPanel/)
  assert.doesNotMatch(source, /label="Filter"/)
  assert.doesNotMatch(source, /filterHint\(filter\)/)
})

test('developer console uses a flat command list and a dedicated dark output surface', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')

  assert.doesNotMatch(source, /<DomainGroup/)
  assert.doesNotMatch(source, /import\s*\{[\s\S]*DomainGroup/)
  assert.doesNotMatch(source, /setOpenDomains/)
  assert.doesNotMatch(source, /openDomains\[/)
  assert.match(source, /className="developer-console-output-surface"/)
  assert.doesNotMatch(source, /developerConsoleRegistryRowMetaStyle/)
  assert.match(source, /gridTemplateColumns:\s*'3px minmax\(0, 1fr\)'/)
  assert.match(source, /<span style=\{developerConsoleRegistryRowTitleStyle\}>\{capability\.id\}<\/span>/)
  assert.doesNotMatch(source, /<span style=\{developerConsoleRegistryRowTitleStyle\}>\{formatRegistryTitle\(capability\)\}<\/span>/)
  assert.doesNotMatch(source, /developerConsoleRegistryRowIdStyle/)
})

test('developer console lets the payload panel expand with its content instead of scrolling internally', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')
  const payloadStart = source.indexOf('title="Payload"')
  const payloadEnd = source.indexOf('<Panel title="Output"', payloadStart)
  const payloadPanel = payloadStart >= 0 && payloadEnd > payloadStart ? source.slice(payloadStart, payloadEnd) : null

  assert.ok(payloadPanel)
  assert.doesNotMatch(source, /const developerConsoleInspectorPayloadCardStyle:[\s\S]*maxHeight:\s*252/)
  assert.doesNotMatch(source, /const developerConsoleInspectorPayloadCardStyle:[\s\S]*minHeight:\s*252/)
  assert.doesNotMatch(payloadPanel, /className="developer-console-scrollless" style=\{developerConsoleInspectorCardBodyStyle\}/)
  assert.match(source, /const developerConsoleInspectorPayloadBodyStyle:[\s\S]*overflow:\s*'visible'/)
  assert.match(payloadPanel, /<div style=\{developerConsoleInspectorPayloadBodyStyle\}>[\s\S]*?<Textarea/)
  assert.match(source, /minHeight=\{240\}/)
})

test('developer capability inventory declares minimum DAW versions per command', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/developerCapabilityInventory.ts'), 'utf8')

  assert.match(source, /minimumDawVersion:\s*'/)
  assert.match(source, /id:\s*'track\.color\.apply'[\s\S]*minimumDawVersion:\s*'2025\.10\.0'/)
  assert.match(source, /id:\s*'import\.run\.start'[\s\S]*minimumDawVersion:\s*'2025\.06\.0'/)
  assert.match(source, /id:\s*'jobs\.get'[\s\S]*minimumDawVersion:\s*'Host only'/)
})

test('developer console loads capability facts from runtime backend metadata instead of hardcoded registry facts', async () => {
  const consoleSource = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')
  const hostSurfaceSource = await readFile(path.join(repoRoot, 'frontend/host/HostDeveloperSurface.tsx'), 'utf8')

  assert.match(consoleSource, /listCapabilities\(\)/)
  assert.match(consoleSource, /supportedDaws/)
  assert.match(consoleSource, /canonicalSource/)
  assert.match(consoleSource, /fieldSupport/)
  assert.doesNotMatch(consoleSource, /const definitions = useMemo\(\s*\(\) =>\s*DEVELOPER_CAPABILITIES\.filter/)
  assert.match(hostSurfaceSource, /developerRuntime/)
  assert.match(hostSurfaceSource, /developerRuntime=\{developerRuntime\}/)
})

test('developer console prevalidates payload fields against field support before backend invoke', async () => {
  const consoleSource = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')

  assert.match(consoleSource, /validateCapabilityPayloadForDaw/)
  assert.match(consoleSource, /code:\s*'CAPABILITY_FIELDS_UNSUPPORTED'/)
  assert.match(consoleSource, /validateCapabilityPayloadForDaw\(\s*capability,\s*resolvedPayload,/)
})
