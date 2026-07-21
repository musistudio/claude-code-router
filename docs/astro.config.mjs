import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

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
  integrations: [sitemap({ filter: (page) => !isRedirectPage(page) })],
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
