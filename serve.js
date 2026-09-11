// Local preview server. Resolves extensionless paths to `.html` the same way
// GitHub Pages does, so links match what the deployed site serves.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(fileURLToPath(new URL('.', import.meta.url)), 'site')
const PORT = Number(process.env.PORT ?? 5173)

// The site is published under a path prefix, and 404.html links are absolute,
// so serve the same prefix locally.
const BASE = '/examples'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function resolve(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null // malformed percent-encoding
  }

  const target = path.join(ROOT, decoded)
  if (!target.startsWith(ROOT)) return null

  for (const candidate of [target, target + '.html', path.join(target, 'index.html')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname !== BASE && !url.pathname.startsWith(BASE + '/')) {
    res.writeHead(302, { location: BASE + '/' }).end()
    return
  }

  const file = resolve(url.pathname.slice(BASE.length))
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    fs.createReadStream(path.join(ROOT, '404.html')).pipe(res)
    return
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => {
  console.log(`Serving site/ on http://localhost:${PORT}${BASE}/`)
})
