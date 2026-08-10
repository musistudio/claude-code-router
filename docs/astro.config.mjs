import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The reused UI package imports images as `import url from "@/assets/x.png"`
 * and expects a URL STRING (as esbuild produces). Under Astro, `astro:assets`
 * intercepts those and returns an `{ src, ... }` metadata object, which then
 * renders as `<img src="[object Object]">`. This plugin forces every image
 * imported from the UI package's assets dir to Vite's plain `?url` string,
 * WITHOUT modifying the UI source.
 */
function uiAssetsAsUrlPlugin() {
  const uiAssetsPath = new URL("./../packages/ui/src/assets", import.meta.url).pathname;
  const imageExt = /\.(png|jpe?g|svg|webp|gif|ico|avif)$/i;
  return {
    name: "ui-assets-as-url",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const id = resolved.id.split("?")[0];
      if (id.startsWith(uiAssetsPath) && imageExt.test(id)) {
        return `${id}?url`;
      }
      return null;
    },
  };
}

const site = process.env.ASTRO_SITE ?? "https://ccrdesk.top";
const base = process.env.ASTRO_BASE ?? "/";

const agentClawPlatforms = [
  "slack",
  "discord",
  "telegram",
  "line",
  "weixin-ilink",
  "wecom",
  "feishu",
  "dingtalk",
];

/** Legacy URLs served as redirect stubs; excluded from the sitemap. */
const redirectPaths = new Set([
  "/configuration/",
  "/configuration/bot-relay/",
  "/configuration/bot-setup/",
  "/configuration/extensions/",
  "/configuration/fusion/",
  "/configuration/fusion-mcp-tool/",
  "/configuration/fusion-vision/",
  "/configuration/fusion-web-search/",
  "/configuration/provider-deeplink/",
  "/configuration/routing/",
  "/configuration/toolhub/",
  "/configuration/provider/",
  "/configuration/profile/",
  "/configuration/config-file/",
  "/en/configuration/",
  "/en/configuration/bot-setup/",
  "/en/configuration/bots/",
  "/en/configuration/extensions/",
  "/en/configuration/fusion-models/",
  "/en/configuration/fusion-mcp-tool/",
  "/en/configuration/fusion-vision/",
  "/en/configuration/fusion-web-search/",
  "/en/configuration/provider-deeplink/",
  "/en/configuration/routing/",
  "/en/configuration/toolhub/",
  ...agentClawPlatforms.map((platform) => `/bot-与-im-接力-agent/${platform}/`),
  ...agentClawPlatforms.map((platform) => `/en/relay-agents-in-im-with-bots/${platform}/`),
]);

const basePath = base.endsWith("/") ? base : `${base}/`;
const isRedirectPage = (page) => {
  let pathname = new URL(page).pathname;
  if (basePath !== "/" && pathname.startsWith(basePath)) {
    pathname = `/${pathname.slice(basePath.length)}`;
  }
  if (!pathname.endsWith("/")) pathname = `${pathname}/`;
  return redirectPaths.has(pathname);
};

export default defineConfig({
  site,
  base,
  output: "static",
  integrations: [
    react(),
    sitemap({ filter: (page) => !isRedirectPage(page) }),
  ],
  vite: {
    plugins: [tailwindcss(), uiAssetsAsUrlPlugin()],
    resolve: {
      alias: {
        "@": new URL("./../packages/ui/src", import.meta.url).pathname,
        "@ccr/core": new URL("./../packages/core/src", import.meta.url).pathname,
      },
    },
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      defaultColor: false,
    },
  },
});
