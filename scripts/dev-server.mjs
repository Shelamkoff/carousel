import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const realRoot = await realpath(root)
const host = process.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '4173', 10)
const requestedEntry = process.argv[2] ?? '/index.html'
const entryPath = requestedEntry.startsWith('/') ? requestedEntry : `/${requestedEntry}`

if (!entryPath.endsWith('.html')) {
  throw new TypeError('Demo entry must point to an HTML file')
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
])

function send(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(message)
}

async function resolveRequestPath(requestUrl) {
  let pathname
  try {
    const url = new URL(requestUrl ?? '/', `http://${host}:${port}`)
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }

  if (pathname === '/') pathname = entryPath
  if (pathname.split('/').some(segment => segment.startsWith('.'))) return null
  const candidate = resolve(root, `.${pathname}`)
  const fromRoot = relative(root, candidate)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) return null

  try {
    const info = await stat(candidate)
    const file = await realpath(info.isDirectory() ? join(candidate, 'index.html') : candidate)
    const resolvedPath = relative(realRoot, file)
    if (resolvedPath.startsWith('..') || isAbsolute(resolvedPath)
      || resolvedPath.split(/[\\/]/).some(segment => segment.startsWith('.'))) return null
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed')
    return
  }

  const filePath = await resolveRequestPath(request.url)
  if (!filePath) {
    send(response, 404, 'Not found')
    return
  }

  const headers = {
    'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (request.method === 'HEAD') {
    response.writeHead(200, headers)
    response.end()
    return
  }
  const stream = createReadStream(filePath)
  stream.once('error', () => {
    if (!response.headersSent) send(response, 404, 'Not found')
    else response.destroy()
  })
  response.once('close', () => stream.destroy())
  stream.once('open', () => {
    response.writeHead(200, headers)
    stream.pipe(response)
  })
})

server.on('error', error => {
  console.error(error.message)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`Carousel demo: http://${host}:${server.address().port}${entryPath}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit()))
}
