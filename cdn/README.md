# CCR CDN

This directory contains the static assets for the embeddable CCR provider import button.

Default Cloudflare Pages project:

```text
claude-code-router-cdn
```

Default CDN URLs:

```text
https://cdn.ccrdesk.top/ccr-provider-buttons.js
https://cdn.ccrdesk.top/ccr-icon.png
```

Cloudflare Pages custom domain:

```text
cdn.ccrdesk.top
```

The Pages custom domain must have a CNAME record pointing to the Pages project:

```text
cdn.ccrdesk.top CNAME claude-code-router-cdn.pages.dev
```

The documentation site uses `ccrdesk.top` through GitHub Pages. Configure DNS like this:

```text
ccrdesk.top A 185.199.108.153
ccrdesk.top A 185.199.109.153
ccrdesk.top A 185.199.110.153
ccrdesk.top A 185.199.111.153
ccrdesk.top AAAA 2606:50c0:8000::153
ccrdesk.top AAAA 2606:50c0:8001::153
ccrdesk.top AAAA 2606:50c0:8002::153
ccrdesk.top AAAA 2606:50c0:8003::153
cdn.ccrdesk.top CNAME claude-code-router-cdn.pages.dev
```

If `ccrdesk.top` is delegated to Cloudflare, use these Cloudflare nameservers at the registrar:

```text
benedict.ns.cloudflare.com
evangeline.ns.cloudflare.com
```

Deploy manually:

```sh
cd cdn
npx wrangler pages deploy public --project-name=claude-code-router-cdn
```

The GitHub Actions workflow requires these repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```
