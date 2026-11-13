import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3010", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/helpers/browse-server.mjs",
      url: "http://127.0.0.1:54399/health",
    },
    {
      command: "npm run build && node .output/server/index.mjs",
      url: "http://127.0.0.1:3010/artworks/gallery",
      timeout: 120000,
      env: {
        SUPABASE_URL: "http://127.0.0.1:54399",
        SUPABASE_KEY: "test-only",
        HOST: "127.0.0.1",
        PORT: "3010",
        SUPABASE_DOMAIN: "127.0.0.1",
        STRIPE_SECRET_KEY: "sk_test_fake",
      },
    },
  ],
});
