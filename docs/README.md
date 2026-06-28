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

## GitHub Pages

Docs are deployed from `.github/workflows/docs.yml` on pushes to `main` that change `docs/**` or the workflow itself. The default public URL is:

```text
https://ccrdesk.top/
```

The Astro build reads `ASTRO_SITE` and `ASTRO_BASE`, defaulting to `https://ccrdesk.top` and `/`.

## Content

Docs pages are authored in Markdown:

- Chinese: `src/content/docs/zh/index.md`
- English: `src/content/docs/en/index.md`

Frontmatter provides the page title, eyebrow, and lead text. Markdown headings generate the right-side table of contents, and fenced code blocks are compiled with Shiki highlighting.
