import { test } from "vitest";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
test("preparation separates trusted instructions from review and repair data", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "verification-prepare-"));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, "source");
  const temporary = join(directory, "temporary");
  mkdirSync(source);
  mkdirSync(join(temporary, "design-repair"), { recursive: true });
  const git = (...args) => {
    const result = spawnSync("git", ["-C", source, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(source, "page.txt"), "Original\n");
  git("add", ".");
  git("commit", "-m", "Base");
  git("update-ref", "refs/remotes/origin/master", "HEAD");
  writeFileSync(join(source, "page.txt"), "Updated\n");
  git("commit", "-am", "Design");
  const approvedDirectory = join(temporary, "technical-design-job");
  mkdirSync(approvedDirectory);
  const image = readFileSync("public/apple-touch-icon.png");
  writeFileSync(join(approvedDirectory, "design.png"), image);
  writeFileSync(
    join(approvedDirectory, "image.json"),
    JSON.stringify({
      sha256: createHash("sha256").update(image).digest("hex"),
      width: 180,
      height: 180,
    }),
  );
  writeFileSync(
    join(approvedDirectory, "input.json"),
    JSON.stringify({
      designRequest: {
        id: "12345678-1234-4234-8234-123456789abc",
        draft_version: 1,
        instructions: "Gallery",
        requirements: ["Make gallery blue"],
        answers: [],
        change_options: [],
        design_image:
          "https://example.supabase.co/storage/v1/object/public/website_designs/design.png",
      },
    }),
  );
  const run = (mode, passed = "false") => {
    const result = spawnSync(
      process.execPath,
      ["scripts/prepare-design-review.mjs", mode],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_WORKSPACE: directory,
          RUNNER_TEMP: temporary,
          BASE_REF: "master",
          CHECKS_PASSED: passed,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(
      join(temporary, `${mode}-codex-home/config.toml`),
      "utf8",
    );
  };
  const review = run("review");
  assert.match(review, /developer_instructions = "You are reviewing/);
  assert.equal(review.includes("Updated"), false);
  assert.match(review, /mcp_servers.playwright/);
  assert.match(review, /DESIGN_BROWSER_CDP/);
  assert.match(review, /DESIGN_BROWSER_ASSETS = .*review-assets.json/);
  assert.equal(review.includes("--allowed-origins"), false);
  assert.equal(review.includes("--executable-path"), false);
  const diff = readFileSync(
    join(temporary, "implementation-review-prompt.txt"),
    "utf8",
  );
  assert.match(diff, /untrusted data/);
  assert.match(diff, /\+Updated/);
  assert.equal(diff.includes("You are reviewing"), false);

  for (const [passed, file, report] of [
    ["false", "verification-ci.log", "Build failed"],
    ["true", "implementation-review.json", '{"findings":["Broken link"]}'],
  ]) {
    writeFileSync(join(temporary, "design-repair", file), report);
    const config = run("repair", passed);
    assert.match(config, /developer_instructions = "You are repairing/);
    assert.equal(config.includes(report), false);
    const request = readFileSync(
      join(temporary, "design-repair/prompt.txt"),
      "utf8",
    );
    assert.ok(request.endsWith(report));
    assert.equal(request.includes("You are repairing"), false);
    assert.match(request, /Make gallery blue/);
  }
  unlinkSync(join(approvedDirectory, "design.png"));
  for (const mode of ["review", "repair"]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/prepare-design-review.mjs", mode],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_WORKSPACE: directory,
          RUNNER_TEMP: temporary,
          BASE_REF: "master",
        },
      },
    );
    assert.notEqual(result.status, 0);
  }
});
