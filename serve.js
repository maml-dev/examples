// Local preview server. Resolves extensionless paths to `.html` the same way
// GitHub Pages does, so links match what the deployed site serves.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const ROOT = path.join(new URL('.', import.meta.url).pathname, 'site')
const PORT = Number(process.env.PORT ?? 5173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

function resolve(urlPath) {
  const target = path.join(ROOT, decodeURIComponent(urlPath))
  if (!target.startsWith(ROOT)) return null

  for (const candidate of [target, target + '.html', path.join(target, 'index.html')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

http.createServer((req, res) => {
  const file = resolve(new URL(req.url, 'http://localhost').pathname)
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => {
  console.log(`Serving site/ on http://localhost:${PORT}`)
})
