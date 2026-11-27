import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
test("inspection reports are retained and incomplete browser runs fail closed", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "inspection-report-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const head = "a".repeat(40);
  writeFileSync(
    join(directory, "browser-audit.jsonl"),
    JSON.stringify({
      commit: head,
      page: "http://127.0.0.1:3010/artworks/gallery",
      tool: "browser_take_screenshot",
      visual: true,
    }) + "\n",
  );
  for (const status of ["complete", "incomplete"]) {
    writeFileSync(
      join(directory, "implementation-review.json"),
      JSON.stringify({
        findings: [],
        inspection: {
          status,
          commit: head,
          pages: ["http://127.0.0.1:3010/artworks/gallery"],
          report:
            status === "complete"
              ? "Compared gallery layout with the reference."
              : "Browser disconnected during inspection.",
        },
      }),
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/design-review-result.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          EXPECTED_SHA: head,
          GITHUB_OUTPUT: join(directory, "output"),
        },
      },
    );
    assert.equal(result.status === 0, status === "complete");
    const report = readFileSync(
      join(directory, "inspection-report.md"),
      "utf8",
    );
    assert.match(report, new RegExp(head));
    assert.match(report, new RegExp(`Status: ${status}`));
  }
});
