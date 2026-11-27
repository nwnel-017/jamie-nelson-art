import { test } from "vitest";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    new URL(
      "../../../../.github/workflows/verify-design-pr.yml",
      import.meta.url,
    ),
    "utf8",
  ),
);
const checks = workflow.jobs.checks.steps.find((step) => step.id === "ci").run;

test("verification executes repository and Canva checks and stops when a required check fails", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "design-checks-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, "commands");
  writeFileSync(
    join(directory, "npm"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$*" = "$FAIL_COMMAND" ]; then exit 1; fi\n',
  );
  chmodSync(join(directory, "npm"), 0o755);
  const expected = [
    "ci",
    "test",
    "run build",
    "ci --prefix canva-app",
    "--prefix canva-app test -- --runInBand",
    "--prefix canva-app run lint:check",
    "--prefix canva-app run build",
  ];
  for (const fail of ["", "test", "--prefix canva-app run lint:check"]) {
    writeFileSync(log, "");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", checks], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        RUNNER_TEMP: directory,
        COMMAND_LOG: log,
        FAIL_COMMAND: fail,
      },
    });
    assert.equal(result.status === 0, fail === "", result.stderr);
    const commands = readFileSync(log, "utf8").trim().split("\n");
    assert.deepEqual(
      commands,
      fail ? expected.slice(0, expected.indexOf(fail) + 1) : expected,
    );
  }
});
