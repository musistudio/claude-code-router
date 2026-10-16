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

## Model catalog on Cloudflare R2

The model catalog is hosted separately from the Pages assets. Builds and releases
still generate and bundle `models.json` as the offline baseline. CDN downloads
provide updates without requiring a new app release. CLI and Electron download it at startup
from `https://models.ccrdesk.top/models.json`, then check for updates at most hourly
when model metadata is used. A failed download preserves the last local cache at
`<runtime data directory>/cache/models.json`; without a cache the bundled catalog
is used, including on a fresh offline install. Existing explicit file overrides
(`CCR_MODEL_CATALOG_PATH` / `CCR_MODELS_JSON_PATH`) disable CDN downloads.

Create an R2 bucket and connect `models.ccrdesk.top` as its public custom domain
in the Cloudflare dashboard. This domain is independent of `cdn.ccrdesk.top`, which
remains connected to Pages. A different public R2 domain is supported by setting
`CCR_MODEL_CATALOG_URL` to its complete `models.json` URL in the app environment.

From the repository root:

```sh
# Generate the local catalog only (does not upload).
npm run models:build

# Configure the target bucket and authenticate Wrangler.
export CLOUDFLARE_R2_BUCKET=claude-code-router-models
npx wrangler@4 login

# Generate fresh data and update the remote R2 object.
npm run models:update

# Upload the existing catalog or validate without uploading.
npm run models:update -- --upload-only
npm run models:update -- --dry-run
```

The update command also loads the root `.env`. For CI, configure
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (with R2 write permission), and
`CLOUDFLARE_R2_BUCKET`. No upload credentials are needed by the app.
`CCR_MODEL_CATALOG_R2_KEY` optionally changes the object key (default `models.json`);
set the runtime URL to match it. Generation failures abort the update so stale data
is not published. Uploaded objects use `application/json` and a five-minute cache
TTL; do not configure Cloudflare cache rules that override this TTL.

R2 setup and upload reference: [public custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
and [Wrangler R2 commands](https://developers.cloudflare.com/workers/wrangler/commands/r2/).
