import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('host shell delegates home rendering to a dedicated surface component', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostShellApp.tsx'), 'utf8')

  assert.match(source, /HostHomeSurface/)
  assert.doesNotMatch(source, /renderHome =/)
  assert.doesNotMatch(source, /Host shell launchpad/)
})

test('host surfaces opt into desktop edge-to-edge shell framing', async () => {
  const [homeSource, settingsSource, developerSource] = await Promise.all([
    readFile(path.join(repoRoot, 'frontend/host/HostHomeSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostDeveloperSurface.tsx'), 'utf8'),
  ])

  assert.match(homeSource, /<ShellSurface[^>]*edgeToEdge/)
  assert.match(settingsSource, /<ShellSurface[^>]*edgeToEdge/)
  assert.match(developerSource, /<ShellSurface[^>]*edgeToEdge/)
})

test('developer surface scrolls within its own content column instead of relying on browser scrolling', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostDeveloperSurface.tsx'), 'utf8')

  assert.match(source, /const developerShellStyle:[\s\S]*height:\s*'100vh'/)
  assert.match(source, /const developerShellStyle:[\s\S]*overflow:\s*'hidden'/)
  assert.match(source, /const developerShellStyle:[\s\S]*gridTemplateRows:\s*'auto minmax\(0, 1fr\)'/)
  assert.match(source, /const developerToolbarStyle:[\s\S]*justifyContent:\s*'space-between'/)
  assert.match(source, /const developerMainPaneStyle:[\s\S]*display:\s*'grid'/)
  assert.match(source, /const developerMainPaneStyle:[\s\S]*minHeight:\s*0/)
  assert.match(source, /const developerMainPaneStyle:[\s\S]*overflow:\s*'hidden'/)
  assert.match(source, /<Button variant="secondary" size="sm" onClick=\{onGoHome\}>/)
  assert.match(source, /<Button variant="secondary" size="sm" onClick=\{onGoHome\}>[\s\S]*Home[\s\S]*<\/Button>/)
  assert.match(source, /<DeveloperCapabilityConsole/)
  assert.doesNotMatch(source, /developerViewportStyle/)
  assert.doesNotMatch(source, /developerRailStyle/)
  assert.doesNotMatch(source, /const developerShellStyle:[\s\S]*minHeight:\s*'100vh'/)
})

test('desktop host screens drop browser-style outer frame chrome', async () => {
  const [homeSource, settingsSource] = await Promise.all([
    readFile(path.join(repoRoot, 'frontend/host/HostHomeSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8'),
  ])

  const homeScreenFrame = homeSource.match(/const screenFrameStyle = \(sidebarCollapsed: boolean\): CSSProperties => \(\{[\s\S]*?\n\}\)/)
  const settingsScreenFrame = settingsSource.match(/const screenFrameStyle: CSSProperties = \{[\s\S]*?\n\}/)

  assert.ok(homeScreenFrame)
  assert.ok(settingsScreenFrame)

  assert.doesNotMatch(homeScreenFrame[0], /border:\s*'1px solid #c5c5cb'/)
  assert.doesNotMatch(homeScreenFrame[0], /borderRadius:\s*28/)
  assert.doesNotMatch(homeScreenFrame[0], /minHeight:\s*'calc\(100vh - 8rem\)'/)

  assert.doesNotMatch(settingsScreenFrame[0], /border:\s*'1px solid #c5c5cb'/)
  assert.doesNotMatch(settingsScreenFrame[0], /borderRadius:\s*28/)
  assert.doesNotMatch(settingsScreenFrame[0], /minHeight:\s*'calc\(100vh - 8rem\)'/)
})

test('desktop host surfaces use narrow responsive sidebars and auto-fit content grids', async () => {
  const [homeSource, settingsSource, sidebarSource] = await Promise.all([
    readFile(path.join(repoRoot, 'frontend/host/HostHomeSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostSettingsSurface.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'frontend/host/HostPrimarySidebar.tsx'), 'utf8'),
  ])

  assert.match(homeSource, /gridTemplateColumns:\s*`\$\{sidebarCollapsed \? 72 : 272\}px minmax\(0, 1fr\)`/)
  assert.match(homeSource, /summaryGridStyle:[\s\S]*repeat\(auto-fit, minmax\(260px, 1fr\)\)/)
  assert.match(homeSource, /workflowGridStyle:[\s\S]*repeat\(auto-fit, minmax\(260px, 1fr\)\)/)
  assert.match(settingsSource, /gridTemplateColumns:\s*`\$\{sidebarCollapsed \? 72 : 272\}px minmax\(0, 1fr\)`/)
  assert.match(settingsSource, /gridTemplateColumns:\s*'minmax\(220px, 304px\) minmax\(0, 1fr\)'/)
  assert.match(homeSource, /scrollbarGutter:\s*'stable'/)
  assert.match(settingsSource, /scrollbarGutter:\s*'stable'/)
  assert.doesNotMatch(sidebarSource, /Navigate/)
})

test('edge-to-edge host shell skips page-entry animation to avoid settings flash', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/ui/composites/ShellSurface.tsx'), 'utf8')

  assert.match(source, /className=\{edgeToEdge \? 'presto-shell-surface__inner' : 'presto-shell-surface__inner presto-animate-in'\}/)
})

test('desktop host root layout consumes the viewport and blocks browser-level scrolling', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/ui/styles.css'), 'utf8')
  const rootRule = source.match(/html,\s*body,\s*#root\s*\{[\s\S]*?\n\}/)

  assert.ok(rootRule)
  assert.match(rootRule[0], /height:\s*100%/)
  assert.match(rootRule[0], /overflow:\s*hidden/)
})

test('edge-to-edge shell keeps zero outer padding at narrow widths', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/ui/styles.css'), 'utf8')

  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.presto-shell-surface--edge-to-edge\s*\{[\s\S]*padding:\s*0;/)
  assert.match(source, /@media \(max-width: 720px\) \{[\s\S]*\.presto-shell-surface--edge-to-edge\s*\{[\s\S]*padding:\s*0;/)
})
