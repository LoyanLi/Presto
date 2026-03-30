import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('package.json exposes a dedicated core-io smoke command', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

  assert.equal(
    packageJson.scripts['developer:smoke:core-io'],
    'npm run stage1:build && electron frontend/electron/main.mjs --smoke-target=core-io-write',
  )
  assert.equal(
    packageJson.scripts['stage1:smoke:core-io'],
    'npm run developer:smoke:core-io',
  )
  assert.match(packageJson.scripts['stage1:smoke'], /stage1:smoke:core-io/)
})

test('electron smoke harness exposes the core-io write smoke target', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')

  assert.match(source, /if \(target === 'core-io-write'\)/)
  assert.match(source, /waitForRendererText\(win, 'import\.run\.start :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'export\.range\.set :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'export\.start :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'export\.direct\.start :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'jobs\.create :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'jobs\.update :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'jobs\.list :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'jobs\.get :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'jobs\.cancel :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'jobs\.delete :: success'\)/)
})

test('developer console routes restored core I/O capabilities through public import/export clients', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')

  assert.match(source, /import\.run\.start/)
  assert.match(source, /export\.range\.set/)
  assert.match(source, /export\.start/)
  assert.match(source, /export\.direct\.start/)
  assert.match(source, /\.import\?\.run\?\.start/)
  assert.match(source, /\.export\?\.range\?\.set/)
  assert.match(source, /\.export\?\.start/)
  assert.match(source, /\.export\?\.direct\?\.start/)
  assert.match(source, /jobs\.create/)
  assert.match(source, /jobs\.update/)
  assert.match(source, /as \{ job\?: \{ jobId\?: string \} \}/)
  assert.match(source, /const manualJobId = manualJobAccepted\.job\?\.jobId/)
  assert.match(source, /CORE_IO_PUBLIC_CLIENT_UNAVAILABLE/)
  assert.match(source, /JOBS_PUBLIC_CLIENT_UNAVAILABLE/)
  assert.match(source, /isJobNotRunningError/)
  assert.match(source, /JOB_NOT_RUNNING/)
  assert.match(source, /toleratedError: 'JOB_NOT_RUNNING'/)
  assert.match(source, /const importFolder = smokeImportFolder \|\| '\/private\/tmp\/presto-core-io-import'/)
  assert.match(source, /folderPaths: \[importFolder\]/)
  assert.match(source, /inTime: '00:00:00:00'/)
  assert.match(source, /outTime: '00:00:10:00'/)
  assert.match(source, /outputPath: '\/private\/tmp\/presto-core-io-export'/)
  assert.match(source, /fileType: 'WAV'/)
  assert.match(source, /PTSL-backed core I\/O producer/)
  assert.doesNotMatch(source, /backend\.invokeCapability/)
})

test('developer inventory marks producer and manual job capabilities as live', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/developerCapabilityInventory.ts'), 'utf8')

  assert.match(source, /id: 'import\.run\.start',[\s\S]*Core low-level I\/O import capability/)
  assert.match(source, /id: 'export\.start',[\s\S]*Core low-level I\/O export capability/)
  assert.match(source, /id: 'export\.direct\.start',[\s\S]*Core low-level I\/O direct export capability/)
  assert.match(source, /id: 'jobs\.create',[\s\S]*status: 'live'/)
  assert.match(source, /id: 'jobs\.update',[\s\S]*status: 'live'/)
  assert.match(source, /id: 'jobs\.get',[\s\S]*status: 'live'/)
  assert.match(source, /id: 'jobs\.list',[\s\S]*status: 'live'/)
  assert.match(source, /id: 'jobs\.cancel',[\s\S]*status: 'live'/)
  assert.match(source, /id: 'jobs\.delete',[\s\S]*status: 'live'/)
  assert.doesNotMatch(source, /no public producer in this round/)
})
