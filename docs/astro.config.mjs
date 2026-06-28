import { defineConfig } from "astro/config";

const site = process.env.ASTRO_SITE ?? "https://ccrdesk.top";
const base = process.env.ASTRO_BASE ?? "/";

export default defineConfig({
  site,
  base,
  output: "static",
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
