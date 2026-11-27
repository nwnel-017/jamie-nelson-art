import { test } from "vitest";
import assert from "node:assert/strict";
test("approved context artifacts must come from the trusted original implementation workflow", async () => {
  const { validateContextRun } =
    await import("../../../scripts/fetch-design-context.mjs");
  const run = {
    event: "workflow_dispatch",
    path: ".github/workflows/implement-design.yml",
    head_branch: "trusted",
    run_attempt: 1,
  };
  assert.doesNotThrow(() => validateContextRun(run, "trusted"));
  for (const change of [
    { event: "pull_request" },
    { path: "other.yml" },
    { head_branch: "untrusted" },
    { run_attempt: 2 },
  ]) {
    assert.throws(() => validateContextRun({ ...run, ...change }, "trusted"));
  }
});
