import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  resolve: config.resolve,
  test: {
    include: [
      "tests/integration/design-drafts.test.ts",
      "tests/integration/design-workflow.test.ts",
    ],
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 15000,
  },
});
