// ---------------------------------------------------------------------------
// Static site renderer
//
// Pages are rendered to plain HTML at generation time and committed, so a
// deploy is a file upload with no build step. All presentation lives in the
// external stylesheet and in Shiki's CSS variables, which means a design
// change needs no re-render; only a change to the page markup below does
// (`node generate.js --all`).
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createHighlighter } from 'shiki'

const ROOT = new URL('.', import.meta.url).pathname
const GRAMMAR = JSON.parse(fs.readFileSync(path.join(ROOT, 'grammar/maml.json'), 'utf8'))
const THEMES = { light: 'catppuccin-latte', dark: 'plastic' }
const REGISTRY_PATH = path.join(ROOT, 'data/token-styles.json')

// Shiki writes a theme variable pair into a style attribute on every token,
// which is ~90 bytes per span. Each distinct declaration list gets a class
// instead, and the registry is persisted so classes stay stable when only new
// pages are rendered. tokens.css is written from the whole registry on every
// run, so it always covers every page in site/.
function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return new Map()
  return new Map(Object.entries(JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))))
}

function saveRegistry(registry) {
  const sorted = [...registry.entries()].sort(([, a], [, b]) => a.localeCompare(b))
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n')
}

function classFor(registry, style) {
  const known = registry.get(style)
  if (known) return known

  const name = 's' + crypto.createHash('sha1').update(style).digest('hex').slice(0, 8)
  for (const [other, taken] of registry) {
    if (taken === name && other !== style) {
      throw new Error(`Token style hash collision on ${name}`)
    }
  }
  registry.set(style, name)
  return name
}

function tokensCss(registry) {
  const rules = [...registry.entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([style, name]) => `.${name} { ${style.replace(/;/g, '; ').trim()} }`)
  return '/* Generated from data/token-styles.json. Do not edit. */\n' + rules.join('\n') + '\n'
}

export const SHAPE_NAMES = [
  'Flat Configs',
  'Nested Objects',
  'Table Arrays',
  'Mixed Structures',
  'Showcases',
]

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ESCAPES[c])
}

function layout({ title, description, base, body, script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="${base}assets/style.css">
<link rel="stylesheet" href="${base}assets/tokens.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="${base}">MAML Examples</a>
  <nav>
    <a href="https://maml.dev">maml.dev</a>
    <a href="https://github.com/maml-dev/examples">GitHub</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  Generated examples for the <a href="https://maml.dev">MAML</a> data format.
</footer>
${script}</body>
</html>
`
}

function examplePage(example, others, codeHtml) {
  const body = `<article class="example">
  <p class="eyebrow">Example ${escapeHtml(example.num)}</p>
  <h1>${escapeHtml(example.title)}</h1>
  <p class="lead">${escapeHtml(example.description)}</p>
  ${codeHtml}
  <h2>See also</h2>
  <ul class="card-list">
${others.map(other => `    <li><a href="./${other.num}"><span class="card-num">${escapeHtml(other.num)}</span><span class="card-title">${escapeHtml(other.title)}</span></a></li>`).join('\n')}
  </ul>
</article>`

  return layout({
    title: `${example.num} — ${example.title} · MAML Examples`,
    description: example.description,
    base: '../',
    body,
  })
}

const FILTER_SCRIPT = `<script>
(function () {
  var input = document.getElementById('filter')
  var empty = document.getElementById('empty')
  var groups = [].slice.call(document.querySelectorAll('[data-group]'))
  input.addEventListener('input', function () {
    var query = input.value.trim().toLowerCase()
    var matches = 0
    groups.forEach(function (group) {
      var shown = 0
      ;[].slice.call(group.querySelectorAll('li')).forEach(function (item) {
        var hit = !query || item.dataset.search.indexOf(query) !== -1
        item.hidden = !hit
        if (hit) shown++
      })
      group.hidden = shown === 0
      matches += shown
    })
    empty.hidden = matches !== 0
  })
})()
</script>
`

export function renderIndex(items, total) {
  const groups = SHAPE_NAMES.map((name, shapeIndex) => ({
    name,
    items: items.filter(item => item.shapeIndex === shapeIndex),
  })).filter(group => group.items.length > 0)

  const body = `<div class="intro">
  <h1>MAML Examples</h1>
  <p class="lead">${total.toLocaleString('en-US')} generated example documents for the
  <a href="https://maml.dev">MAML</a> data format. The newest of each kind:</p>
  <input id="filter" type="search" placeholder="Filter examples…" autocomplete="off" aria-label="Filter examples">
</div>
${groups.map(group => `<section class="group" data-group>
  <h2>${escapeHtml(group.name)}</h2>
  <ul class="card-list">
${group.items.map(item => `    <li data-search="${escapeHtml((item.title + ' ' + item.description).toLowerCase())}"><a href="./doc/${item.num}"><span class="card-title">${escapeHtml(item.title)}</span><span class="card-desc">${escapeHtml(item.description)}</span></a></li>`).join('\n')}
  </ul>
</section>`).join('\n')}
<p class="empty" id="empty" hidden>No examples match that filter.</p>`

  return layout({
    title: 'MAML Examples',
    description: 'Generated example documents for the MAML data format.',
    base: './',
    body,
    script: FILTER_SCRIPT,
  })
}

export async function createRenderer() {
  const highlighter = await createHighlighter({
    langs: [{ ...GRAMMAR, scopeName: GRAMMAR.scopeName ?? 'source.maml' }],
    themes: [THEMES.light, THEMES.dark],
  })
  const registry = loadRegistry()

  return {
    renderExample(example, others) {
      const codeHtml = highlighter
        .codeToHtml(example.mamlText, { lang: 'maml', themes: THEMES, defaultColor: false })
        .replace(/<span style="([^"]*)">/g, (_, style) => `<span class="${classFor(registry, style)}">`)
      return examplePage(example, others, codeHtml)
    },
    renderIndex,
    // Writes the token stylesheet and persists any classes added this run.
    finish(assetsDir) {
      fs.writeFileSync(path.join(assetsDir, 'tokens.css'), tokensCss(registry))
      saveRegistry(registry)
      highlighter.dispose()
    },
  }
}
