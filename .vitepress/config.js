import fs from 'node:fs'
import { defineConfig } from 'vitepress'

const __dirname = new URL('.', import.meta.url).pathname
const mamlLang = JSON.parse(fs.readFileSync(__dirname + '/maml.json', 'utf8'))

export default defineConfig({
  cleanUrls: true,
  ignoreDeadLinks: true,
  title: 'MAML Examples',
  description: 'MAML example documents',
  markdown: {
    theme: {
      light: 'catppuccin-latte',
      dark: 'plastic',
    },
    shikiSetup(shiki) {
      shiki.loadLanguage(mamlLang)
    },
  },
  themeConfig: {
    nav: [
      { text: 'Examples', link: '/' },
      { text: 'MAML', link: 'https://maml.dev' },
    ],
    sidebar: false,
    search: { provider: 'local' },
  },
})
