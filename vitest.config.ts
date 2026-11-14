import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@server": root("./server"),
      "@utils": root("./utils"),
      "~~": root("."),
      "#supabase/server": root("./tests/helpers/supabase.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: [
      "tests/integration/design-drafts.test.ts",
      "tests/integration/design-workflow.test.ts",
    ],
    setupFiles: ["tests/helpers/setup.ts"],
  },
});
