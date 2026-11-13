import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { HandoffError } from "../server/utils/agent/errors";
import {
  readPlanningConfig,
  resolvePlanningCommit,
  dispatchPlanningWorkflow,
  type PlanningConfig,
} from "../server/utils/agent/planning/github-planning";
import { parseTechnicalInstructions } from "../server/utils/agent/planning/technical-instructions";
import { verifyGitHubWorkerToken } from "../server/utils/auth/requireGitHubWorker";
import {
  verifyPlanningWebhook,
  planningRunFromWebhook,
} from "../server/utils/agent/planning/github-planning-webhook";

const config: PlanningConfig = {
  token: "test-token",
  repository: "owner/project",
  repositoryId: "123",
  workflowRef: "master",
  sourceRef: "master",
  backendUrl: "https://backend.example",
  promptVersion: "technical-instructions-v1",
  model: "configured-model",
};
const code = (expected: string) => (error: unknown) =>
  error instanceof HandoffError && error.code === expected;
const unauthorized = (error: unknown) =>
  error instanceof HandoffError && error.statusCode === 401;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const instructions = {
  objective: "Make the gallery blue",
  tasks: [
    {
      id: "task-1",
      description: "Update the gallery styles",
      files: ["app/pages/gallery.vue"],
      acceptance_criteria: ["The gallery is blue"],
    },
  ],
  verification_steps: ["Build the website"],
  constraints: [],
  blockers: [],
};

test("planning config fails closed and requires a dedicated HTTPS backend origin", () => {
  const runtime = {
    planningGithubToken: config.token,
    planningRepository: config.repository,
    planningRepositoryId: config.repositoryId,
    planningWorkflowRef: config.workflowRef,
    planningSourceRef: config.sourceRef,
    planningBackendUrl: config.backendUrl,
    planningCodexModel: config.model,
  };
  assert.deepEqual(readPlanningConfig(runtime), config);
  for (const update of [
    { planningGithubToken: "" },
    { planningRepositoryId: "" },
    { planningCodexModel: "" },
    { planningBackendUrl: "http://backend.example" },
    { planningBackendUrl: "https://backend.example/path" },
    { planningBackendUrl: "https://user:pass@backend.example" },
  ]) {
    assert.throws(
      () => readPlanningConfig({ ...runtime, ...update }),
      (error: unknown) =>
        error instanceof HandoffError && error.statusCode === 503,
    );
  }
});

test("GitHub resolves a pinned commit and dispatches only the configured workflow with a job ID", async () => {
  const sha = "a".repeat(40);
  const resolve: typeof fetch = async (url, options) => {
    assert.equal(
      String(url),
      "https://api.github.com/repos/owner/project/commits/master",
    );
    assert.equal(options?.redirect, "error");
    return json({ sha });
  };
  assert.equal(await resolvePlanningCommit(config, resolve), sha);
  const dispatch: typeof fetch = async (url, options) => {
    assert.equal(
      String(url),
      "https://api.github.com/repos/owner/project/actions/workflows/generate-technical-instructions.yml/dispatches",
    );
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(String(options?.body)), {
      ref: "master",
      inputs: {
        job_id: "job-id",
        design_id: "design-id",
        base_branch: config.sourceRef,
      },
    });
    return json({ workflow_run_id: 456 });
  };
  assert.deepEqual(await dispatchPlanningWorkflow(config, "job-id", "design-id", dispatch), {
    runId: "456",
  });
});

test("uncertain GitHub dispatches never automatically retry and explicit rejections stay distinct", async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    json({}, 200),
    json({}, 503),
  ]) {
    let calls = 0;
    await assert.rejects(
      dispatchPlanningWorkflow(config, "job-id", "design-id", async () => {
        calls++;
        return response;
      }),
      code("DISPATCH_UNCONFIRMED"),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    dispatchPlanningWorkflow(config, "job-id", "design-id", async () => {
      throw new Error("secret transport details");
    }),
    code("DISPATCH_UNCONFIRMED"),
  );
  await assert.rejects(
    dispatchPlanningWorkflow(config, "job-id", "design-id", async () => json({}, 403)),
    code("DISPATCH_FAILED"),
  );
  await assert.rejects(
    resolvePlanningCommit(config, async () => json({ sha: "branch" })),
    code("SOURCE_UNAVAILABLE"),
  );
});

test("technical instructions require actionable tasks or blockers and reject malformed or oversized output", () => {
  assert.deepEqual(parseTechnicalInstructions(instructions), instructions);
  assert.equal(
    parseTechnicalInstructions({
      ...instructions,
      tasks: [],
      blockers: ["Required asset is missing"],
    }).tasks.length,
    0,
  );
  for (const invalid of [
    null,
    { ...instructions, tasks: [] },
    { ...instructions, extra: true },
    { ...instructions, tasks: [instructions.tasks[0], instructions.tasks[0]] },
    {
      ...instructions,
      tasks: [{ ...instructions.tasks[0], files: ["../secret"] }],
    },
    { ...instructions, constraints: Array(100).fill("x".repeat(4000)) },
  ]) {
    assert.throws(
      () => parseTechnicalInstructions(invalid),
      code("INVALID_TECHNICAL_INSTRUCTIONS"),
    );
  }
});

test("worker JWT validation binds the repository, workflow, ref, audience and original run attempt", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test-key",
    alg: "RS256",
  };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const claims = {
    sub: "repo:owner/project:ref:refs/heads/master",
    repository: config.repository,
    repository_id: config.repositoryId,
    ref: "refs/heads/master",
    workflow_ref:
      "owner/project/.github/workflows/generate-technical-instructions.yml@refs/heads/master",
    event_name: "workflow_dispatch",
    runner_environment: "github-hosted",
    run_id: "456",
    run_attempt: "1",
  };
  const sign = (
    overrides: object = {},
    audience = `${config.backendUrl}/technical-design-jobs`,
    expiration = "5m",
  ) =>
    new SignJWT({ ...claims, ...overrides })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuedAt()
      .setIssuer("https://token.actions.githubusercontent.com")
      .setAudience(audience)
      .setExpirationTime(expiration)
      .sign(privateKey);
  // Local JWKS resolves the same signed-key interface without network access.
  const verify = (token: string) =>
    verifyGitHubWorkerToken(
      token,
      config,
      keys as Parameters<typeof verifyGitHubWorkerToken>[2],
    );
  assert.deepEqual(await verify(await sign()), { runId: "456", runAttempt: 1 });
  for (const override of [
    { repository: "other/project" },
    { repository_id: "999" },
    { ref: "refs/heads/untrusted" },
    {
      workflow_ref:
        "owner/project/.github/workflows/other.yml@refs/heads/master",
    },
    { event_name: "pull_request" },
    { run_attempt: "2" },
    { runner_environment: "self-hosted" },
  ]) {
    await assert.rejects(verify(await sign(override)), unauthorized);
  }
  await assert.rejects(verify(await sign({}, "wrong-audience")), unauthorized);
  await assert.rejects(verify(await sign({}, undefined, "-1m")), unauthorized);
  await assert.rejects(verify("bad-token"), unauthorized);
});

test("signed completion webhooks select only the trusted workflow run and reject tampering", () => {
  const body = {
    action: "completed",
    repository: { id: 123, full_name: config.repository },
    workflow_run: {
      id: 456,
      run_attempt: 1,
      event: "workflow_dispatch",
      head_branch: "master",
      path: ".github/workflows/generate-technical-instructions.yml",
      status: "completed",
      display_title:
        "Technical design job 12345678-1234-4234-8234-123456789abc",
    },
  };
  const raw = Buffer.from(JSON.stringify(body));
  const signature =
    "sha256=" +
    createHmac("sha256", "webhook-secret").update(raw).digest("hex");
  verifyPlanningWebhook(raw, signature, "webhook-secret");
  assert.throws(
    () => verifyPlanningWebhook(Buffer.from("{}"), signature, "webhook-secret"),
    unauthorized,
  );
  assert.throws(
    () => verifyPlanningWebhook(raw, undefined, "webhook-secret"),
    unauthorized,
  );
  assert.deepEqual(planningRunFromWebhook(body, config), {
    jobId: "12345678-1234-4234-8234-123456789abc",
    runId: "456",
    runAttempt: 1,
  });
  assert.deepEqual(
    planningRunFromWebhook(
      {
        ...body,
        workflow_run: {
          ...body.workflow_run,
          path: body.workflow_run.path + "@master",
        },
      },
      config,
    ),
    {
      jobId: "12345678-1234-4234-8234-123456789abc",
      runId: "456",
      runAttempt: 1,
    },
  );
  for (const override of [
    { event: "pull_request" },
    { head_branch: "untrusted" },
    { path: ".github/workflows/other.yml" },
    { run_attempt: 2 },
    { display_title: "Technical design job invalid" },
  ]) {
    assert.equal(
      planningRunFromWebhook(
        { ...body, workflow_run: { ...body.workflow_run, ...override } },
        config,
      ),
      null,
    );
  }
  assert.equal(
    planningRunFromWebhook(
      { ...body, repository: { ...body.repository, id: 999 } },
      config,
    ),
    null,
  );
});
