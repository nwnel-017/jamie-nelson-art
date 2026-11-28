import { defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  resolve: config.resolve,
  test: {
    include: [
      "tests/integration/design-budget.test.ts",
      "tests/integration/design-drafts.test.ts",
      "tests/integration/design-workflow.test.ts",
      "tests/integration/technical-design-jobs.integration.test.ts",
    ],
    setupFiles: ["tests/helpers/setup.ts"],
    testTimeout: 15000,
  },
});
