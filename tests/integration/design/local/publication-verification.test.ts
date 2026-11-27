import { describe, test, type TestContext } from "vitest";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const workflow = (name: string) =>
  parse(readFileSync(join(root, `.github/workflows/${name}.yml`), "utf8"));
const implementation = workflow("implement-design");
const verification = workflow("verify-design-pr");
const design = "12345678-1234-4234-8234-123456789abc";
const branch = `agent/design-${design}`;
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// GitHub runners use modern Bash; macOS Bash 3.2 ignores errexit for failed [[ guards.
const oldBash =
  Number(
    execFileSync("bash", ["-c", "echo ${BASH_VERSINFO[0]}"], {
      encoding: "utf8",
    }).trim(),
  ) < 4;
type Call = string[];
function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "design-publication-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, "remote.git");
  const source = join(directory, "source");
  const temporary = join(directory, "temporary");
  const bin = join(directory, "bin");
  const log = join(directory, "github.jsonl");
  git(directory, "init", "--bare", "--quiet", remote);
  git(directory, "clone", "--quiet", remote, source);
  git(source, "config", "user.name", "Fixture");
  git(source, "config", "user.email", "fixture@example.test");
  git(source, "switch", "-c", "master");
  mkdirSync(join(source, "app/pages"), { recursive: true });
  writeFileSync(
    join(source, "app/pages/gallery.vue"),
    "<template>Original</template>\n",
  );
  git(source, "add", ".");
  git(source, "commit", "--quiet", "-m", "Original gallery");
  git(source, "push", "--quiet", "origin", "master");
  symlinkSync(root, join(directory, "control"), "dir");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.GH_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'pr' && args[1] === 'list') console.log(process.env.EXISTING_PR || '');
if (args[0] === 'api' && args[1]?.includes('/pulls/')) console.log(JSON.stringify({head:{ref:process.env.HEAD_REF,sha:process.env.PR_SHA},base:{ref:'master'}}));
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  writeFileSync(log, "");
  const output = join(directory, "output");
  const run = (script: string, env: Record<string, string> = {}) =>
    spawnSync(
      "bash",
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        script.replaceAll("${{ github.ref_name }}", "trusted-workflows"),
      ],
      {
        cwd: source,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GH_LOG: log,
          RUNNER_TEMP: temporary,
          DESIGN_ID: design,
          JOB_ID: "job-123",
          HEAD_REF: branch,
          PR_NUMBER: "17",
          BASE_BRANCH: "master",
          WORKFLOW_REF: "trusted-workflows",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "123",
          CONTEXT_RUN_ID: "123",
          REPAIR_COUNT: "0",
          EXISTING_PR: "17",
          GITHUB_OUTPUT: output,
          ...env,
        },
      },
    );
  const patch = (folder: string, contents: string) => {
    writeFileSync(
      join(source, "app/pages/gallery.vue"),
      `<template>${contents}</template>\n`,
    );
    mkdirSync(join(temporary, folder), { recursive: true });
    writeFileSync(
      join(temporary, folder, "changes.patch"),
      execFileSync("git", ["diff", "--binary"], { cwd: source }),
    );
    git(source, "checkout", "--", ".");
  };
  const calls = (): Call[] =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const publish = () => {
    patch("technical-design-job", "Implemented");
    for (const name of [
      "Create feature branch and commit changes",
      "Open pull request",
    ]) {
      const result = run(
        implementation.jobs.publish.steps.find(
          (step: { name: string }) => step.name === name,
        ).run,
      );
      assert.equal(result.status, 0, result.stderr);
    }
    return git(remote, "rev-parse", `refs/heads/${branch}`);
  };
  return { directory, remote, source, output, run, patch, calls, publish };
}

const dispatches = (calls: Call[]) =>
  calls.filter((args) => args[0] === "workflow");
const field = (args: Call, name: string) =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const assertDispatch = (args: Call, sha: string, count: string) => {
  assert.deepEqual(args.slice(0, 5), [
    "workflow",
    "run",
    "verify-design-pr.yml",
    "--ref",
    "trusted-workflows",
  ]);
  for (const [key, value] of Object.entries({
    pr_number: "17",
    design_id: design,
    context_run_id: "123",
    expected_head_sha: sha,
    repair_count: count,
    job_id: "job-123",
  }))
    assert.equal(field(args, key), value, key);
};

describe("design publication and verification handoff", () => {
  test("verification binds the expected commit to the dispatch input", () => {
    const validation = verification.jobs.checks.steps.find(
      (step: { id: string }) => step.id === "pr",
    );
    assert.equal(validation.env.EXPECTED_SHA, "${{ inputs.expected_head_sha }}");
  });

  test("publishes the implementation, records failed verification, and dispatches repair verification for the new commit", (t) => {
    const { remote, source, output, run, patch, calls, publish } = fixture(t);
    const initial = publish();
    assertDispatch(dispatches(calls())[0]!, initial, "0");
    assert.ok(
      calls().some(
        (args) =>
          args.includes(`repos/owner/repo/statuses/${initial}`) &&
          args.includes("state=pending"),
      ),
    );
    const validate = verification.jobs.checks.steps.find(
      (step: { id: string }) => step.id === "pr",
    ).run;
    assert.equal(
      run(validate, { EXPECTED_SHA: initial, PR_SHA: initial }).status,
      0,
    );
    assert.match(
      readFileSync(output, "utf8"),
      new RegExp(`head_sha=${initial}`),
    );
    const status = verification.jobs["verification-status"].steps[0].run;
    assert.equal(
      run(status, {
        HEAD_SHA: initial,
        CHECKS_RESULT: "success",
        CHECKS_PASSED: "true",
        REVIEW_RESULT: "success",
        FINDINGS: "1",
      }).status,
      0,
    );
    assert.ok(
      calls().some(
        (args) =>
          args.includes(`repos/owner/repo/statuses/${initial}`) &&
          args.includes("state=failure"),
      ),
    );
    patch("design-repair", "Repaired");
    const repaired = run(verification.jobs["publish-repair"].steps.at(-1).run, {
      EXPECTED_SHA: initial,
    });
    assert.equal(repaired.status, 0, repaired.stderr);
    const head = git(remote, "rev-parse", `refs/heads/${branch}`);
    assert.notEqual(head, initial);
    assert.equal(git(remote, "rev-parse", `${head}^`), initial);
    assert.equal(
      git(remote, "show", `${head}:app/pages/gallery.vue`),
      "<template>Repaired</template>",
    );
    assertDispatch(dispatches(calls())[1]!, head, "1");
    assert.equal(run(validate, { EXPECTED_SHA: head, PR_SHA: head }).status, 0);
    assert.equal(
      run(status, {
        HEAD_SHA: head,
        CHECKS_RESULT: "success",
        CHECKS_PASSED: "true",
        REVIEW_RESULT: "success",
        FINDINGS: "0",
      }).status,
      0,
    );
    assert.ok(
      calls().some(
        (args) =>
          args.includes(`repos/owner/repo/statuses/${head}`) &&
          args.includes("state=success"),
      ),
    );
    assert.equal(git(source, "status", "--porcelain"), "");
  });

  test.skipIf(oldBash)(
    "rejects verification dispatched for an earlier PR commit",
    (t) => {
      const { run, publish } = fixture(t);
      const head = publish();
      const validate = verification.jobs.checks.steps.find(
        (step: { id: string }) => step.id === "pr",
      ).run;
      assert.notEqual(
        run(validate, { EXPECTED_SHA: "a".repeat(40), PR_SHA: head }).status,
        0,
      );
    },
  );

  test.skipIf(oldBash)(
    "rejects a stale repair without publishing or dispatching another verification",
    (t) => {
      const { directory, remote, source, run, patch, calls, publish } = fixture(t);
      const initial = publish();
      patch("design-repair", "Repaired");
      const human = join(directory, "human");
      git(directory, "clone", "--quiet", "--branch", branch, remote, human);
      git(human, "config", "user.name", "Human");
      git(human, "config", "user.email", "human@example.test");
      writeFileSync(
        join(human, "app/pages/gallery.vue"),
        "<template>Human update</template>\n",
      );
      git(human, "commit", "--quiet", "-am", "Human update");
      git(human, "push", "--quiet", "origin", branch);
      const advanced = git(human, "rev-parse", "HEAD");
      const result = run(verification.jobs["publish-repair"].steps.at(-1).run, {
        EXPECTED_SHA: initial,
      });
      assert.notEqual(result.status, 0);
      assert.equal(git(remote, "rev-parse", `refs/heads/${branch}`), advanced);
      assert.equal(git(source, "rev-parse", "HEAD"), initial);
      assert.equal(git(source, "status", "--porcelain"), "");
      assert.equal(dispatches(calls()).length, 1);
    },
  );
});
