import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  resolve: config.resolve,
  test: {
    include: ["tests/design-workflow.integration.test.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 15000,
  },
});
