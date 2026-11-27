import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import assert from "node:assert/strict";
import { test } from "vitest";
import { HandoffError } from "../../../server/utils/agent/errors";
import type { PlanningConfig } from "../../../server/utils/agent/planning/github-planning";
import { verifyGitHubWorkerToken } from "../../../server/utils/auth/requireGitHubWorker";

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
      "owner/project/.github/workflows/implement-design.yml@refs/heads/master",
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
  const notificationClaims = {
    workflow_ref:
      "owner/project/.github/workflows/notify-design-result.yml@refs/heads/master",
    event_name: "workflow_run",
    run_attempt: "2",
  };
  const notificationToken = await sign(
    notificationClaims,
    `${config.backendUrl}/design-result-email`,
  );
  assert.deepEqual(
    await verifyGitHubWorkerToken(
      notificationToken,
      config,
      keys as Parameters<typeof verifyGitHubWorkerToken>[2],
      "notification",
    ),
    { runId: "456", runAttempt: 2 },
  );
  await assert.rejects(verify(notificationToken), unauthorized);
  const statusToken = await sign(
    { ...notificationClaims, event_name: "status" },
    `${config.backendUrl}/design-result-email`,
  );
  assert.deepEqual(
    await verifyGitHubWorkerToken(
      statusToken,
      config,
      keys as Parameters<typeof verifyGitHubWorkerToken>[2],
      "notification",
    ),
    { runId: "456", runAttempt: 2 },
  );
  for (const overrides of [
    { event_name: "pull_request" },
    { repository_id: "999" },
    { workflow_ref: claims.workflow_ref },
  ]) {
    const token = await sign(
      { ...notificationClaims, ...overrides },
      `${config.backendUrl}/design-result-email`,
    );
    await assert.rejects(
      verifyGitHubWorkerToken(
        token,
        config,
        keys as Parameters<typeof verifyGitHubWorkerToken>[2],
        "notification",
      ),
      unauthorized,
    );
  }
});
