import assert from "node:assert/strict";
import { test } from "vitest";
import { HandoffError } from "../../../server/utils/agent/errors";
import {
  readPlanningConfig,
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
