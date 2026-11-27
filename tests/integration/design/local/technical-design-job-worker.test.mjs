import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  claimJob,
  reportResult,
  validateClaim,
} from "../../../../scripts/technical-design-job-worker.mjs";

const id = "12345678-1234-4234-8234-123456789abc";
const input = {
  claimed: true,
  job: {
    id,
    repository_sha: "a".repeat(40),
    prompt_version: "image-implementation-v1",
    model: "test-model",
  },
  designRequest: {},
};
async function environment(t) {
  const dir = await mkdtemp(join(tmpdir(), "design-worker-"));
  t.onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return {
    RUNNER_TEMP: dir,
    TECHNICAL_JOB_ID: id,
    TECHNICAL_JOBS_BACKEND_URL: "https://portfolio.example",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_OUTPUT: join(dir, "output"),
    ACTIONS_ID_TOKEN_REQUEST_URL:
      "https://token.actions.githubusercontent.com/identity",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
  };
}
function transport(result) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(
        JSON.stringify(calls.length % 2 ? { value: "identity-token" } : result),
      );
    },
  };
}
test("direct implementation keeps publishing and backend credentials outside the model job", () => {
  const jobs = parse(
    readFileSync(".github/workflows/implement-design.yml", "utf8"),
  ).jobs;
  assert.equal(jobs.plan, undefined);
  assert.deepEqual(jobs.implement.permissions, { contents: "read" });
  assert.deepEqual(jobs.report.permissions, {
    contents: "read",
    "id-token": "write",
  });
  assert.match(
    jobs.implement.steps.find((s) => s.uses?.startsWith("openai/")).with[
      "codex-args"
    ],
    /--image/,
  );
  assert.deepEqual(jobs.publish.needs, ["claim", "implement"]);
  assert.match(
    jobs.publish.steps.find((s) => s.name === "Open pull request").run,
    /context_run_id/,
  );
  assert.deepEqual(jobs.report.needs, ["claim", "implement"]);
});
test("claim authenticates with dedicated audience and saves exactly the approved snapshot", async (t) => {
  const env = await environment(t);
  const io = transport(input);
  await claimJob(env, io.request);
  assert.match(
    io.calls[0].url,
    /audience=https%3A%2F%2Fportfolio.example%2Ftechnical-design-jobs/,
  );
  assert.equal(io.calls[1].options.body, undefined);
  assert.deepEqual(
    JSON.parse(
      await readFile(join(env.RUNNER_TEMP, "technical-design-job/input.json")),
    ),
    input,
  );
});
test("reruns do not claim again and invalid claims cannot unlock implementation", async (t) => {
  const env = await environment(t);
  await claimJob({ ...env, GITHUB_RUN_ATTEMPT: "2" }, () => {
    throw new Error("must not request");
  });
  assert.equal(await readFile(env.GITHUB_OUTPUT, "utf8"), "claimed=false\n");
  assert.throws(() =>
    validateClaim(
      { ...input, job: { ...input.job, prompt_version: "old" } },
      id,
    ),
  );
  assert.equal(validateClaim({ claimed: false }, id), false);
});
test("result reports implementation handoff without generated technical output", async (t) => {
  const env = await environment(t);
  for (const outcome of ["success", "failure"]) {
    const io = transport({ success: true });
    await reportResult(
      { ...env, TECHNICAL_IMPLEMENTATION_RESULT: outcome },
      io.request,
    );
    assert.deepEqual(JSON.parse(io.calls[1].options.body), {
      status: outcome === "success" ? "completed" : "failed",
    });
  }
});
