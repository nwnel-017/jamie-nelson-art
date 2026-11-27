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
    include: ["tests/unit/**/*.test.{ts,mjs}", "tests/integration/**/*.test.{ts,mjs}"],
    exclude: ["tests/integration/design/supabase/**"],
    setupFiles: ["tests/helpers/setup.ts"],
  },
});
