import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const packageJsonPath = path.join(repoRoot, 'package.json')
const previewScriptPath = path.join(repoRoot, 'scripts', 'preview-static.mjs')

test('package.json exposes a local preview command for the Presto landing page', () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

  assert.equal(
    packageJson.scripts?.['landing:preview'],
    'node scripts/preview-static.mjs presto-product-landing 4173',
  )
})

test('repository contains the shared static preview script', () => {
  assert.equal(existsSync(previewScriptPath), true)
})

test('preview script falls forward when the requested port is already in use', async () => {
  const occupiedPort = 45173
  const host = '127.0.0.1'
  const blocker = http.createServer((_, response) => response.end('busy'))

  await new Promise((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(occupiedPort, host, resolve)
  })

  const child = spawn(
    process.execPath,
    [previewScriptPath, 'presto-product-landing', String(occupiedPort)],
    {
      cwd: repoRoot,
      env: { ...process.env, PRESTO_PREVIEW_HOST: host },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  try {
    const line = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('preview script did not start in time')), 5000)

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')

      child.stdout.on('data', (chunk) => {
        if (!chunk.includes('Previewing')) return
        clearTimeout(timeout)
        resolve(chunk)
      })

      child.stderr.on('data', (chunk) => {
        clearTimeout(timeout)
        reject(new Error(chunk))
      })

      child.once('exit', (code) => {
        clearTimeout(timeout)
        reject(new Error(`preview script exited early with code ${code}`))
      })
    })

    assert.match(String(line), /http:\/\/127\.0\.0\.1:45174/)
  } finally {
    child.kill('SIGINT')
    await new Promise((resolve) => child.once('exit', resolve))
    await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())))
  }
})
