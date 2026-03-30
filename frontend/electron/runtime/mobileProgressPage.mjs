export function buildMobileProgressPage(sessionId, token) {
  const apiUrl = `/mobile-progress-api/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
    <title>Presto Export Progress</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f3ef;
        --surface: #ffffff;
        --surface-muted: #f1ede5;
        --line: rgba(24, 26, 32, 0.08);
        --text: #181a20;
        --muted: #676c78;
        --accent: #b65c2d;
        --accent-soft: rgba(182, 92, 45, 0.14);
        --success: #2f7d4f;
        --danger: #b24242;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
        background:
          radial-gradient(circle at top, rgba(182, 92, 45, 0.12), transparent 32%),
          linear-gradient(180deg, #f8f5ee 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        width: min(100%, 42rem);
        margin: 0 auto;
        padding: 24px 16px 40px;
      }
      .hero {
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.2;
      }
      .subtitle {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .card {
        background: color-mix(in srgb, var(--surface) 92%, white);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 16px;
        box-shadow: 0 12px 32px rgba(24, 26, 32, 0.06);
      }
      .card + .card {
        margin-top: 12px;
      }
      .status-row, .stats {
        display: grid;
        gap: 10px;
      }
      .status-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .stats {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .metric {
        padding: 12px;
        border-radius: 14px;
        background: var(--surface-muted);
      }
      .metric label {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        margin-bottom: 6px;
      }
      .metric strong {
        display: block;
        font-size: 0.95rem;
      }
      .progress-shell {
        margin-top: 14px;
        height: 10px;
        border-radius: 999px;
        background: rgba(24, 26, 32, 0.08);
        overflow: hidden;
      }
      .progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #c9743a 0%, var(--accent) 100%);
        transition: width 200ms ease;
      }
      .message {
        margin-top: 14px;
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.85rem;
        font-weight: 600;
      }
      .pill.is-done {
        background: rgba(47, 125, 79, 0.12);
        color: var(--success);
      }
      .pill.is-error {
        background: rgba(178, 66, 66, 0.12);
        color: var(--danger);
      }
      ul {
        margin: 12px 0 0;
        padding-left: 18px;
        color: var(--muted);
      }
      li + li {
        margin-top: 6px;
      }
      .empty {
        color: var(--muted);
      }
      @media (max-width: 520px) {
        .status-row,
        .stats {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Presto Export Progress</h1>
        <p class="subtitle">Live export status from your current desktop session.</p>
      </section>
      <section class="card">
        <div id="status-pill" class="pill">Connecting…</div>
        <div class="status-row" style="margin-top: 14px;">
          <div class="metric"><label>Task ID</label><strong id="task-id">-</strong></div>
          <div class="metric"><label>Session</label><strong id="session-state">Active</strong></div>
        </div>
        <div class="progress-shell"><div id="progress-bar" class="progress-bar" style="width: 0%;"></div></div>
        <p id="message" class="message">Waiting for export updates…</p>
      </section>
      <section class="card">
        <div class="stats">
          <div class="metric"><label>Progress</label><strong id="progress-text">0%</strong></div>
          <div class="metric"><label>Current</label><strong id="current-text">0 / 0</strong></div>
          <div class="metric"><label>Phase</label><strong id="phase-text">-</strong></div>
        </div>
      </section>
      <section class="card">
        <h2 style="margin: 0; font-size: 1rem;">Recent files</h2>
        <ul id="files-list"><li class="empty">No exported files yet.</li></ul>
      </section>
      <section class="card">
        <h2 style="margin: 0; font-size: 1rem;">Errors</h2>
        <ul id="errors-list"><li class="empty">No errors.</li></ul>
      </section>
    </main>
    <script>
      const apiUrl = ${JSON.stringify(apiUrl)}

      function setList(id, items, emptyText) {
        const list = document.getElementById(id)
        if (!Array.isArray(items) || items.length === 0) {
          list.innerHTML = '<li class="empty">' + emptyText + '</li>'
          return
        }
        list.innerHTML = items.map((item) => '<li>' + String(item) + '</li>').join('')
      }

      function render(data) {
        const session = data.session || {}
        const job = data.jobView || {}
        const state = String(job.terminalStatus || job.state || 'pending')
        const percent = Math.max(0, Math.min(100, Number(job.progressPercent || 0)))
        const current = Number(job.currentSnapshot || 0)
        const total = Number(job.totalSnapshots || 0)
        const pill = document.getElementById('status-pill')
        pill.textContent = state
        pill.className = 'pill' + (state === 'completed' ? ' is-done' : state === 'failed' || state === 'cancelled' ? ' is-error' : '')
        document.getElementById('task-id').textContent = String(job.jobId || session.taskId || '-')
        document.getElementById('session-state').textContent = session.active ? 'Active' : 'Closed'
        document.getElementById('progress-bar').style.width = percent + '%'
        document.getElementById('progress-text').textContent = Math.round(percent) + '%'
        document.getElementById('current-text').textContent = current + ' / ' + total
        document.getElementById('phase-text').textContent = String(job.state || '-')
        document.getElementById('message').textContent = String(job.message || 'Waiting for export updates…')
        setList('files-list', Array.isArray(job.exportedFiles) ? job.exportedFiles : [], 'No exported files yet.')
        setList(
          'errors-list',
          Array.isArray(job.failedSnapshotDetails) && job.failedSnapshotDetails.length > 0
            ? job.failedSnapshotDetails.map((item) => (item.error ? item.snapshotName + ': ' + item.error : item.snapshotName))
            : (Array.isArray(job.failedSnapshots) ? job.failedSnapshots : []),
          'No errors.',
        )
      }

      async function refresh() {
        try {
          const response = await fetch(apiUrl, { cache: 'no-store' })
          const data = await response.json()
          if (!response.ok || !data.ok) {
            throw new Error(data.error || 'Failed to load progress.')
          }
          render(data)
        } catch (error) {
          document.getElementById('status-pill').textContent = 'offline'
          document.getElementById('status-pill').className = 'pill is-error'
          document.getElementById('message').textContent = error instanceof Error ? error.message : String(error)
        }
      }

      refresh()
      window.setInterval(refresh, 1000)
    </script>
  </body>
</html>`
}
