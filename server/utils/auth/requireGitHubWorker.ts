import { getHeader, type H3Event } from "h3";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { HandoffError } from "@server/utils/agent/errors";
import {
  PLANNING_WORKFLOW,
  type PlanningConfig,
} from "@server/utils/agent/planning/github-planning";

const githubKeys = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);
const identitySchema = z.object({
  repository: z.string(),
  repository_id: z.string(),
  ref: z.string(),
  workflow_ref: z.string(),
  event_name: z.literal("workflow_dispatch"),
  runner_environment: z.literal("github-hosted"),
  run_id: z.string().regex(/^[1-9][0-9]*$/),
  run_attempt: z.literal("1"),
});

export type GitHubWorkerIdentity = { runId: string; runAttempt: number };

export async function verifyGitHubWorkerToken(
  token: string,
  config: PlanningConfig,
  keys = githubKeys,
): Promise<GitHubWorkerIdentity> {
  try {
    if (token.length > 16384) throw new Error();
    const { payload } = await jwtVerify(token, keys, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: `${config.backendUrl}/technical-design-jobs`,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      requiredClaims: ["exp", "iat", "sub"],
    });
    const identity = identitySchema.parse(payload);
    const ref = `refs/heads/${config.workflowRef}`;
    if (
      identity.repository !== config.repository ||
      identity.repository_id !== config.repositoryId ||
      identity.ref !== ref ||
      identity.workflow_ref !==
        `${config.repository}/.github/workflows/${PLANNING_WORKFLOW}@${ref}`
    )
      throw new Error();
    return { runId: identity.run_id, runAttempt: Number(identity.run_attempt) };
  } catch {
    throw new HandoffError(401, "Invalid GitHub planning worker identity.");
  }
}

export async function requireGitHubWorker(
  event: H3Event,
  config: PlanningConfig,
): Promise<GitHubWorkerIdentity> {
  const authorization = getHeader(event, "authorization");
  const token = authorization?.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
  )?.[1];
  if (!token)
    throw new HandoffError(
      401,
      "A GitHub planning worker identity is required.",
    );
  return verifyGitHubWorkerToken(token, config);
}
