import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "requirements.spec.ts",
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
  projects: [{ name: "chromium" }],
  outputDir: "test-results/requirements",
});
