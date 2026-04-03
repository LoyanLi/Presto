import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outDir = path.join(repoRoot, 'build', 'tauri', 'renderer')
const prestoFontStylesheet =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap'
const startupThemeScript = String.raw`(() => {
  const storageKey = 'presto.ui.theme.mode'
  const systemDarkQuery = '(prefers-color-scheme: dark)'
  let preference = 'system'
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      preference = stored
    }
  } catch {}
  const mode = preference === 'system'
    ? (window.matchMedia && window.matchMedia(systemDarkQuery).matches ? 'dark' : 'light')
    : preference
  document.documentElement.setAttribute('data-presto-theme', mode)
})()`

await mkdir(outDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(repoRoot, 'frontend', 'tauri', 'renderer.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  outfile: path.join(outDir, 'renderer.js'),
  external: [
    'node:child_process',
    'node:fs/promises',
    'node:path',
    'node:url',
  ],
  loader: {
    '.css': 'css',
    '.png': 'dataurl',
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
})

await writeFile(
  path.join(outDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Presto</title>
    <script>${startupThemeScript}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${prestoFontStylesheet}" media="print" onload="this.media='all'" />
    <noscript><link rel="stylesheet" href="${prestoFontStylesheet}" /></noscript>
    <style>
      :root {
        color-scheme: light;
      }

      :root[data-presto-theme='dark'] {
        color-scheme: dark;
      }

      html,
      body,
      #root {
        margin: 0;
        width: 100%;
        min-height: 100%;
        height: 100%;
      }

      body {
        background: #f7f8fc;
        color: #171a24;
        font-family: 'Inter', 'Segoe UI', sans-serif;
      }

      :root[data-presto-theme='dark'] body {
        background: #0c0e17;
        color: #e2e6f3;
      }

      .presto-startup-shell {
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 32px;
        box-sizing: border-box;
      }

      .presto-startup-shell__content {
        display: grid;
        gap: 10px;
        justify-items: center;
        text-align: center;
      }

      .presto-startup-shell__eyebrow {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.72;
      }

      .presto-startup-shell__detail {
        font-size: 13px;
        line-height: 1.5;
        color: #525b71;
      }

      :root[data-presto-theme='dark'] .presto-startup-shell__detail {
        color: #c2c7d9;
      }
    </style>
    <link rel="stylesheet" href="./renderer.css" />
  </head>
  <body>
    <div id="root">
      <div class="presto-startup-shell" aria-label="Presto startup shell">
        <div class="presto-startup-shell__content">
          <div class="presto-startup-shell__eyebrow">Launching Presto</div>
          <div class="presto-startup-shell__detail">Preparing desktop runtime…</div>
        </div>
      </div>
    </div>
    <script type="module" src="./renderer.js"></script>
  </body>
</html>
`,
)

await writeFile(
  path.join(outDir, 'splashscreen.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Presto</title>
    <script>${startupThemeScript}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${prestoFontStylesheet}" media="print" onload="this.media='all'" />
    <noscript><link rel="stylesheet" href="${prestoFontStylesheet}" /></noscript>
    <style>
      :root {
        color-scheme: light;
      }

      :root[data-presto-theme='dark'] {
        color-scheme: dark;
      }

      html,
      body {
        margin: 0;
        width: 100%;
        min-height: 100%;
        height: 100%;
      }

      body {
        display: grid;
        place-items: center;
        overflow: hidden;
        background: #f7f8fc;
        color: #171a24;
        font-family: 'Inter', 'Segoe UI', sans-serif;
      }

      :root[data-presto-theme='dark'] body {
        background: #0c0e17;
        color: #e2e6f3;
      }

      .presto-splash {
        display: grid;
        gap: 14px;
        justify-items: center;
        text-align: center;
        padding: 32px;
      }

      .presto-splash__mark {
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #171a24;
      }

      .presto-splash__title {
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.03em;
        color: #171a24;
      }

      .presto-splash__detail {
        font-size: 13px;
        line-height: 1.6;
        color: #525b71;
      }

      :root[data-presto-theme='dark'] .presto-splash__mark,
      :root[data-presto-theme='dark'] .presto-splash__title {
        color: #e2e6f3;
      }

      :root[data-presto-theme='dark'] .presto-splash__detail {
        color: #c2c7d9;
      }
    </style>
  </head>
  <body>
    <main class="presto-splash" aria-label="Presto splash screen">
      <div class="presto-splash__mark">Presto</div>
      <div class="presto-splash__title">Presto is loading</div>
      <div class="presto-splash__detail">Preparing the desktop host and runtime.</div>
    </main>
  </body>
</html>
`,
)
