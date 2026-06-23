import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  markdown: {
    shikiConfig: {
      theme: "github-light",
    },
  },
});
