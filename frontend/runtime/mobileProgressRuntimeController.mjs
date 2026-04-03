import { createServer as createHttpServer } from 'node:http'
import { networkInterfaces } from 'node:os'

import QRCode from 'qrcode'
import { buildMobileProgressPage } from './mobileProgressPage.mjs'
import { createMobileProgressServer } from './mobileProgressServer.mjs'

function resolveMobileProgressHost() {
  const interfaces = networkInterfaces()
  const candidates = []
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal || !entry.address) {
        continue
      }
      if (entry.address.startsWith('169.254.')) {
        continue
      }
      if (name.startsWith('utun') || name.startsWith('bridge') || name === 'awdl0' || name === 'llw0') {
        continue
      }
      if (entry.address === '198.18.0.1') {
        continue
      }
      candidates.push({ name, address: entry.address })
    }
  }

  const preferred =
    candidates.find((item) => item.name === 'en0') ??
    candidates.find((item) => item.name.startsWith('en')) ??
    candidates.find((item) => item.address.startsWith('192.168.')) ??
    candidates.find((item) => item.address.startsWith('10.')) ??
    candidates.find((item) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(item.address)) ??
    candidates[0]

  return preferred?.address || '127.0.0.1'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function deriveMobileProgressJobView(job) {
  const progress = job?.progress ?? {}
  const metadata = job?.metadata ?? {}
  const result = job?.result ?? {}
  const terminalStatus =
    typeof result.status === 'string'
      ? result.status
      : job?.state === 'succeeded'
        ? 'completed'
        : String(job?.state ?? 'queued')

  return {
    jobId: String(job?.jobId ?? ''),
    state: String(job?.state ?? 'queued'),
    terminalStatus,
    progressPercent: Number(progress.percent ?? 0),
    message: String(progress.message ?? ''),
    currentSnapshot: Number(metadata.currentSnapshot ?? progress.current ?? 0),
    totalSnapshots: Number(metadata.totalSnapshots ?? progress.total ?? 0),
    currentSnapshotName: String(metadata.currentSnapshotName ?? ''),
    etaSeconds:
      metadata.etaSeconds === null || metadata.etaSeconds === undefined
        ? null
        : Number(metadata.etaSeconds),
    exportedCount: Number(
      metadata.exportedCount ?? (Array.isArray(result.exportedFiles) ? result.exportedFiles.length : 0),
    ),
    exportedFiles: Array.isArray(result.exportedFiles)
      ? result.exportedFiles.map((value) => String(value))
      : [],
    failedSnapshots: Array.isArray(result.failedSnapshots)
      ? result.failedSnapshots.map((value) => String(value))
      : [],
    failedSnapshotDetails: Array.isArray(result.failedSnapshotDetails)
      ? result.failedSnapshotDetails
          .filter((value) => value && typeof value === 'object')
          .map((value) => ({
            snapshotName: String(value.snapshotName ?? ''),
            error: String(value.error ?? ''),
          }))
          .filter((value) => value.snapshotName)
      : [],
    isTerminal: ['succeeded', 'failed', 'cancelled'].includes(String(job?.state ?? '')),
  }
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function html(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

export function createMobileProgressRuntimeController({ loadJobForMobileProgress }) {
  let mobileProgressHttpServer = null
  let mobileProgressRuntime = null
  let mobileProgressOrigin = ''

  async function ensureRuntime() {
    if (mobileProgressRuntime && mobileProgressHttpServer && mobileProgressOrigin) {
      return {
        origin: mobileProgressOrigin,
        runtime: mobileProgressRuntime,
      }
    }

    const host = resolveMobileProgressHost()
    mobileProgressHttpServer = createHttpServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', mobileProgressOrigin || 'http://127.0.0.1')
        const pageMatch = requestUrl.pathname.match(/^\/mobile-progress\/([^/]+)$/)
        const apiMatch = requestUrl.pathname.match(/^\/mobile-progress-api\/([^/]+)$/)

        if (!pageMatch && !apiMatch) {
          html(response, 404, '<h1>Not Found</h1>')
          return
        }

        const sessionId = decodeURIComponent((pageMatch || apiMatch)?.[1] ?? '')
        const token = String(requestUrl.searchParams.get('token') ?? '')
        const session = mobileProgressRuntime?.getSession(sessionId) ?? null
        if (!session || token !== session.token) {
          if (apiMatch) {
            json(response, 403, { ok: false, error: 'Session not found.' })
            return
          }
          html(response, 403, '<h1>Session not found.</h1>')
          return
        }

        if (pageMatch) {
          html(response, 200, buildMobileProgressPage(sessionId, token))
          return
        }

        const jobView = session.latestJobView
          ? session.latestJobView
          : deriveMobileProgressJobView(await loadJobForMobileProgress(session.taskId))
        json(response, 200, {
          ok: true,
          session,
          jobView,
        })
      } catch (error) {
        json(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    await new Promise((resolve, reject) => {
      mobileProgressHttpServer.once('error', reject)
      mobileProgressHttpServer.listen(0, '0.0.0.0', () => {
        mobileProgressHttpServer.off('error', reject)
        resolve()
      })
    })

    const address = mobileProgressHttpServer.address()
    const port = typeof address === 'object' && address ? address.port : 0
    mobileProgressOrigin = `http://${host}:${port}`
    mobileProgressRuntime = createMobileProgressServer({
      buildViewUrl(sessionId, token) {
        return `${mobileProgressOrigin}/mobile-progress/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`
      },
    })

    return {
      origin: mobileProgressOrigin,
      runtime: mobileProgressRuntime,
    }
  }

  async function decorateResult(result) {
    if (!result?.ok || !result.url) {
      return result
    }

    return {
      ...result,
      qrSvg: await QRCode.toString(result.url, {
        type: 'svg',
        width: 220,
        margin: 1,
        color: {
          dark: '#181a20',
          light: '#ffffff',
        },
      }),
    }
  }

  async function closeRuntime() {
    mobileProgressRuntime?.clearSessions?.()
    mobileProgressRuntime = null
    mobileProgressOrigin = ''
    if (!mobileProgressHttpServer) {
      return
    }
    const server = mobileProgressHttpServer
    mobileProgressHttpServer = null
    await new Promise((resolve) => {
      server.close(() => resolve())
    })
  }

  return {
    closeRuntime,
    decorateResult,
    ensureRuntime,
    escapeHtml,
  }
}
