# Claude Code Router Docs

Astro-powered documentation site for Claude Code Router.

## Commands

```sh
npm install
npm run dev
npm run build
npm run preview
```

The local development server runs from this `docs` directory.

## Content

Docs pages are authored in Markdown:

- Chinese: `src/content/docs/zh/index.md`
- English: `src/content/docs/en/index.md`

Frontmatter provides the page title, eyebrow, and lead text. Markdown headings generate the right-side table of contents, and fenced code blocks are compiled with Shiki highlighting.
