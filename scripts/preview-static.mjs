import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReadStream, existsSync, statSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const targetArg = process.argv[2]?.trim()
const portArg = Number.parseInt(process.argv[3] ?? '', 10)
const host = process.env.PRESTO_PREVIEW_HOST?.trim() || '127.0.0.1'
const port = Number.isFinite(portArg) ? portArg : 4173

if (!targetArg) {
  console.error('Usage: node scripts/preview-static.mjs <directory> [port]')
  process.exit(1)
}

const rootDir = path.resolve(repoRoot, targetArg)

if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
  console.error(`Static preview directory not found: ${rootDir}`)
  process.exit(1)
}

const mimeByExtension = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
])

function sendNotFound(response) {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}

function sendServerError(response, error) {
  response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(`Preview server error: ${error.message}`)
}

function resolveRequestPath(urlPathname) {
  const normalizedPath = decodeURIComponent(urlPathname.split('?')[0] || '/')
  const requestedPath = normalizedPath === '/' ? '/index.html' : normalizedPath
  const absolutePath = path.resolve(rootDir, `.${requestedPath}`)

  if (!absolutePath.startsWith(rootDir)) return null
  if (!existsSync(absolutePath)) return null

  const stats = statSync(absolutePath)
  if (stats.isDirectory()) {
    const indexPath = path.join(absolutePath, 'index.html')
    if (!existsSync(indexPath)) return null
    return indexPath
  }

  return absolutePath
}

const server = http.createServer((request, response) => {
  try {
    const method = request.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Method not allowed')
      return
    }

    const filePath = resolveRequestPath(request.url ?? '/')
    if (!filePath) {
      sendNotFound(response)
      return
    }

    const extension = path.extname(filePath).toLowerCase()
    const contentType = mimeByExtension.get(extension) ?? 'application/octet-stream'
    response.writeHead(200, { 'content-type': contentType })

    if (method === 'HEAD') {
      response.end()
      return
    }

    createReadStream(filePath).pipe(response)
  } catch (error) {
    sendServerError(response, error)
  }
})

function listenOnPort(candidatePort) {
  const onError = (error) => {
    server.off('listening', onListening)

    if (error.code === 'EADDRINUSE') {
      listenOnPort(candidatePort + 1)
      return
    }

    console.error(error)
    process.exit(1)
  }

  const onListening = () => {
    server.off('error', onError)
    console.log(`Previewing ${path.relative(repoRoot, rootDir)} at http://${host}:${candidatePort}`)
  }

  server.once('error', onError)
  server.once('listening', onListening)
  server.listen(candidatePort, host)
}

listenOnPort(port)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
