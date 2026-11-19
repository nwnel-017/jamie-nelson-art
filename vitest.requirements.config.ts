import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  resolve: config.resolve,
  test: {
    include: ["tests/integration/requirements-ui.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    silent: "passed-only",
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
