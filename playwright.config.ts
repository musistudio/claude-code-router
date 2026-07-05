import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000
  },
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure"
  },
  workers: 1
});
