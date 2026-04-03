import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const stylesPath = path.join(repoRoot, 'frontend/ui/styles.css')

async function readStyles() {
  return readFile(stylesPath, 'utf8')
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getRuleBlock(styles, selector) {
  const pattern = new RegExp(`${escapeForRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'm')
  const match = styles.match(pattern)
  assert.ok(match, `Expected selector block: ${selector}`)
  return match[1]
}

test('shared styles use Inter-forward fonts and halo shell surfaces', async () => {
  const styles = await readStyles()
  const shellSurfaceBlock = getRuleBlock(styles, '.presto-shell-surface')

  assert.doesNotMatch(styles, /fonts\.googleapis\.com/)
  assert.doesNotMatch(styles, /@import\s+url?\(/)
  assert.match(styles, /--presto-font-body:\s*'Inter'/)
  assert.match(styles, /--presto-font-label:\s*'Inter'/)
  assert.match(shellSurfaceBlock, /(^|\n)\s*background:\s*var\(--md-sys-color-background\)/)
  assert.match(styles, /--md-sys-color-primary:\s*#5b4ed6/)
})

test('shared styles define theme-scoped variables and a dark-mode branch', async () => {
  const styles = await readStyles()
  const rootBlock = getRuleBlock(styles, ':root')

  assert.doesNotMatch(styles, /radial-gradient\(/)
  assert.doesNotMatch(styles, /linear-gradient\(/)
  assert.doesNotMatch(styles, /backdrop-filter:\s*blur\(/)
  assert.match(rootBlock, /(^|\n)\s*color-scheme:\s*light;/)
  assert.match(rootBlock, /(^|\n)\s*--presto-logo-filter:\s*none;/)
  const darkRootBlock = getRuleBlock(styles, ":root[data-presto-theme='dark']")
  assert.match(darkRootBlock, /(^|\n)\s*color-scheme:\s*dark;/)
  assert.match(darkRootBlock, /(^|\n)\s*--md-sys-color-background:\s*#0c0e17;/)
  assert.match(darkRootBlock, /(^|\n)\s*--presto-logo-filter:\s*invert\(1\);/)
  assert.match(darkRootBlock, /(^|\n)\s*--presto-panel-surface:\s*var\(--md-sys-color-surface-container-low\);/)
})

test('workflow stepper styles define a compact frameless row with shorter pills', async () => {
  const styles = await readStyles()

  assert.doesNotMatch(styles, /\.presto-workflow-stepper__track\s*\{/)
  assert.match(styles, /\.presto-workflow-frame__steps\.presto-workflow-stepper\s*\{[\s\S]*padding:\s*var\(--presto-space-sm\) var\(--presto-space-lg\) 0;/)
  assert.match(styles, /\.presto-workflow-stepper__item\s*\{[\s\S]*border-radius:/)
  assert.match(styles, /\.presto-workflow-stepper__item\s*\{[\s\S]*padding:\s*10px 14px;/)
  assert.match(styles, /\.presto-workflow-stepper__index\s*\{[\s\S]*width:\s*28px/)
})

test('workflow stepper keeps a horizontal row on narrow layouts and hides labels instead of stacking vertically', async () => {
  const styles = await readStyles()

  assert.doesNotMatch(styles, /@media \(max-width: 980px\)\s*\{[\s\S]*\.presto-workflow-stepper__row\s*\{[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(styles, /@media \(max-width: 980px\)\s*\{[\s\S]*\.presto-workflow-stepper__label\s*\{[\s\S]*display:\s*none;/)
  assert.match(styles, /@media \(max-width: 980px\)\s*\{[\s\S]*\.presto-workflow-stepper__hint\s*\{[\s\S]*display:\s*none;/)
})

test('developer-facing shared primitives use tighter high-density spacing defaults', async () => {
  const styles = await readStyles()

  assert.match(styles, /\.ui-panel__header\s*\{[\s\S]*padding:\s*12px;/)
  assert.match(styles, /\.ui-panel__body\s*\{[\s\S]*padding:\s*0 12px 12px;/)
  assert.match(styles, /\.ui-badge \.MuiChip-label\s*\{[\s\S]*padding:\s*3px 8px;/)
  assert.match(styles, /\.ui-button--halo\.MuiButton-root\s*\{[\s\S]*min-height:\s*34px;[\s\S]*padding-inline:\s*12px;/)
  assert.match(styles, /\.ui-button--sm\.MuiButton-root\s*\{[\s\S]*min-height:\s*30px;[\s\S]*padding-inline:\s*10px;/)
  assert.match(styles, /\.presto-filter-bar\s*\{[\s\S]*padding:\s*6px 8px;/)
  assert.match(styles, /\.presto-stat-chip\s*\{[\s\S]*padding:\s*6px 8px;[\s\S]*min-width:\s*72px;/)
  assert.match(styles, /\.presto-domain-group__toggle\s*\{[\s\S]*padding:\s*7px 8px;/)
  assert.match(styles, /\.presto-capability-row\s*\{[\s\S]*padding:\s*7px 8px;/)
  assert.match(styles, /\.ui-input \.MuiInputBase-input,\s*[\s\S]*padding:\s*9px 11px;/)
  assert.match(styles, /\.ui-field__helper,\s*[\s\S]*font-size:\s*0\.7rem;/)
})

test('developer console scroll surfaces hide or minimize scrollbar chrome', async () => {
  const styles = await readStyles()

  assert.match(styles, /\.developer-console-scrollless\s*\{[\s\S]*scrollbar-width:\s*none;/)
  assert.match(styles, /\.developer-console-scrollless::-webkit-scrollbar\s*\{[\s\S]*width:\s*0;/)
  assert.match(styles, /\.developer-console-output-surface\s+\.presto-code-block pre::-webkit-scrollbar\s*\{[\s\S]*width:\s*0;/)
})
