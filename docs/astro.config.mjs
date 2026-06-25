import { defineConfig } from "astro/config";

const site = process.env.ASTRO_SITE ?? "https://musistudio.github.io";
const base = process.env.ASTRO_BASE ?? "/claude-code-router";

export default defineConfig({
  site,
  base,
  output: "static",
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
});
