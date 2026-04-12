import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const htmlPath = path.join(__dirname, 'index.html')

test('landing page contains the core Presto product sections', () => {
  const html = readFileSync(htmlPath, 'utf8')

  assert.match(html, /Presto/)
  assert.match(html, /Fast workflows for Pro Tools\./)
  assert.match(html, /Why Presto/)
  assert.match(html, /What You Get/)
  assert.match(html, /Made for Real Session Work/)
  assert.match(html, /Request Early Access/)
})

test('landing page loads its local stylesheet and script', () => {
  const html = readFileSync(htmlPath, 'utf8')

  assert.match(html, /href="\.\/styles\.css"/)
  assert.match(html, /src="\.\/main\.js"/)
})

test('landing page is self-contained inside its own folder assets', () => {
  const html = readFileSync(htmlPath, 'utf8')

  assert.doesNotMatch(html, /\.\.\/assets\//)
  assert.match(html, /src="\.\/assets\/PrestoLogoPng\.png"/)
  assert.match(html, /src="\.\/assets\/workflow-library\.png"/)
  assert.match(html, /src="\.\/assets\/import-analyze-edit\.png"/)
  assert.match(html, /src="\.\/assets\/import-run-complete\.png"/)
})

test('landing page copy stays user-facing instead of technical', () => {
  const html = readFileSync(htmlPath, 'utf8')

  assert.doesNotMatch(html, /PTSL/)
  assert.doesNotMatch(html, /Semantic/)
  assert.doesNotMatch(html, /capabilit/i)
  assert.doesNotMatch(html, /DAW/)
  assert.doesNotMatch(html, /0\.3\.x/)
  assert.doesNotMatch(html, /adapter/i)
})

test('landing page images use square corners', () => {
  const cssPath = path.join(__dirname, 'styles.css')
  const css = readFileSync(cssPath, 'utf8')

  assert.match(css, /\.brand img\s*\{[^}]*border-radius:\s*0;/s)
  assert.match(css, /\.shot\s*\{[^}]*border-radius:\s*0;/s)
})

test('landing page latest release action does not pin an old version tag', () => {
  const html = readFileSync(htmlPath, 'utf8')

  assert.match(html, /href="https:\/\/github\.com\/LoyanLi\/Presto\/releases\/latest"/)
  assert.doesNotMatch(html, /releases\/tag\/v0\.3\.6/)
})
