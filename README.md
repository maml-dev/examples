# maml-examples

[MAML](https://maml.dev) examples showcasing language features. Built
with [maml-ast](https://github.com/maml-dev/maml-ast).

## Development

```
npm install
npm run generate   # add 100 new examples and render their pages
npm run serve      # preview site/ at http://localhost:5173
```

## Layout

- `generate.js` — generates examples and writes pages
- `site.js` — page markup and Shiki highlighting
- `assets/style.css` — the only stylesheet; copied into `site/` on each run
- `data/*.maml` — stored examples, 1000 per chunk
- `site/` — generated HTML, committed and deployed as-is

Pages are rendered to HTML when an example is created, so a deploy uploads
files with no build step. Editing `assets/style.css` needs no re-render;
changing the markup in `site.js` does — run `npm run render`.

## License

[MIT](LICENSE)
