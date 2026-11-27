import assert from "node:assert/strict";
import { test } from "vitest";
import { HandoffError } from "../../../server/utils/agent/errors";
import {
  dispatchPlanningWorkflow,
  resolvePlanningCommit,
  type PlanningConfig,
} from "../../../server/utils/agent/planning/github-planning";

const config: PlanningConfig = {
  token: "test-token",
  repository: "owner/project",
  repositoryId: "123",
  workflowRef: "master",
  sourceRef: "master",
  backendUrl: "https://backend.example",
  promptVersion: "image-implementation-v1",
  model: "configured-model",
};

const code = (expected: string) => (error: unknown) =>
  error instanceof HandoffError && error.code === expected;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
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
      "https://api.github.com/repos/owner/project/actions/workflows/implement-design.yml/dispatches",
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
  assert.deepEqual(
    await dispatchPlanningWorkflow(config, "job-id", "design-id", dispatch),
    {
      runId: "456",
    },
  );
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
    dispatchPlanningWorkflow(config, "job-id", "design-id", async () =>
      json({}, 403),
    ),
    code("DISPATCH_FAILED"),
  );
  await assert.rejects(
    resolvePlanningCommit(config, async () => json({ sha: "branch" })),
    code("SOURCE_UNAVAILABLE"),
  );
});
