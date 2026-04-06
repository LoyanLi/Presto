import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let updateCheckModulePromise = null

async function loadUpdateCheckModule() {
  if (!updateCheckModulePromise) {
    updateCheckModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-sidecar-update-check-test-'))
      const outfile = path.join(tempDir, 'update-check.mjs')
      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
        await esbuild.build({
          entryPoints: [path.join(repoRoot, 'frontend/sidecar/updateCheck.ts')],
          bundle: true,
          format: 'esm',
          platform: 'node',
          target: 'node20',
          outfile,
          loader: {
            '.ts': 'ts',
            '.tsx': 'tsx',
          },
        })

        return await import(pathToFileURL(outfile).href)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })()
  }

  return updateCheckModulePromise
}

test('sidecar update check ignores drafts and keeps the latest stable release by default', async () => {
  const { selectLatestRelease, createUpdateCheckResult } = await loadUpdateCheckModule()
  const releases = [
    {
      tagName: 'v0.3.3-beta.1',
      name: '0.3.3 beta 1',
      htmlUrl: 'https://example.test/beta',
      publishedAt: '2026-04-05T10:00:00Z',
      prerelease: true,
      draft: false,
    },
    {
      tagName: 'v0.3.2',
      name: '0.3.2',
      htmlUrl: 'https://example.test/stable',
      publishedAt: '2026-04-04T10:00:00Z',
      prerelease: false,
      draft: false,
    },
    {
      tagName: 'v0.3.9',
      name: 'draft',
      htmlUrl: 'https://example.test/draft',
      publishedAt: '2026-04-06T10:00:00Z',
      prerelease: false,
      draft: true,
    },
  ]

  const latestRelease = selectLatestRelease(releases, {
    includePrerelease: false,
  })

  assert.equal(latestRelease?.tagName, 'v0.3.2')
  assert.deepEqual(
    createUpdateCheckResult({
      currentVersion: '0.3.3-alpha.1',
      repo: 'LoyanLi/Presto',
      releases,
      includePrerelease: false,
    }),
    {
      currentVersion: '0.3.3-alpha.1',
      hasUpdate: false,
      latestRelease: {
        repo: 'LoyanLi/Presto',
        tagName: 'v0.3.2',
        name: '0.3.2',
        htmlUrl: 'https://example.test/stable',
        publishedAt: '2026-04-04T10:00:00Z',
        prerelease: false,
        draft: false,
      },
    },
  )
})

test('sidecar update check includes prereleases when requested and compares semver prerelease correctly', async () => {
  const { createUpdateCheckResult } = await loadUpdateCheckModule()

  assert.deepEqual(
    createUpdateCheckResult({
      currentVersion: '0.3.3-alpha.1',
      repo: 'LoyanLi/Presto',
      releases: [
        {
          tagName: 'v0.3.2',
          name: '0.3.2',
          htmlUrl: 'https://example.test/stable',
          publishedAt: '2026-04-04T10:00:00Z',
          prerelease: false,
          draft: false,
        },
        {
          tagName: 'v0.3.3-beta.1',
          name: '0.3.3 beta 1',
          htmlUrl: 'https://example.test/beta',
          publishedAt: '2026-04-05T10:00:00Z',
          prerelease: true,
          draft: false,
        },
      ],
      includePrerelease: true,
    }),
    {
      currentVersion: '0.3.3-alpha.1',
      hasUpdate: true,
      latestRelease: {
        repo: 'LoyanLi/Presto',
        tagName: 'v0.3.3-beta.1',
        name: '0.3.3 beta 1',
        htmlUrl: 'https://example.test/beta',
        publishedAt: '2026-04-05T10:00:00Z',
        prerelease: true,
        draft: false,
      },
    },
  )
})

test('sidecar update check reports no update when the current version already matches the latest filtered release', async () => {
  const { createUpdateCheckResult } = await loadUpdateCheckModule()

  assert.deepEqual(
    createUpdateCheckResult({
      currentVersion: 'v0.3.3-beta.1',
      repo: 'LoyanLi/Presto',
      releases: [
        {
          tagName: 'v0.3.3-beta.1',
          name: '0.3.3 beta 1',
          htmlUrl: 'https://example.test/beta',
          publishedAt: '2026-04-05T10:00:00Z',
          prerelease: true,
          draft: false,
        },
      ],
      includePrerelease: true,
    }),
    {
      currentVersion: 'v0.3.3-beta.1',
      hasUpdate: false,
      latestRelease: {
        repo: 'LoyanLi/Presto',
        tagName: 'v0.3.3-beta.1',
        name: '0.3.3 beta 1',
        htmlUrl: 'https://example.test/beta',
        publishedAt: '2026-04-05T10:00:00Z',
        prerelease: true,
        draft: false,
      },
    },
  )
})
