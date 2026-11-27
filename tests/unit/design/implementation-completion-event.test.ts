import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vitest";
import { HandoffError } from "../../../server/utils/agent/errors";
import type { PlanningConfig } from "../../../server/utils/agent/planning/github-planning";
import {
  planningRunFromWebhook,
  verifyPlanningWebhook,
} from "../../../server/utils/agent/planning/github-planning-webhook";

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

const unauthorized = (error: unknown) =>
  error instanceof HandoffError && error.statusCode === 401;

test("signed completion webhooks select only the trusted workflow run and reject tampering", () => {
  const body = {
    action: "completed",
    repository: { id: 123, full_name: config.repository },
    workflow_run: {
      id: 456,
      run_attempt: 1,
      event: "workflow_dispatch",
      head_branch: "master",
      path: ".github/workflows/implement-design.yml",
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
