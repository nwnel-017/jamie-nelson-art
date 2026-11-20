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
  event_name: z.enum(["workflow_dispatch", "workflow_run", "status"]),
  runner_environment: z.literal("github-hosted"),
  run_id: z.string().regex(/^[1-9][0-9]*$/),
  run_attempt: z.string().regex(/^[1-9][0-9]*$/),
});

export type GitHubWorkerIdentity = { runId: string; runAttempt: number };

export async function verifyGitHubWorkerToken(
  token: string,
  config: PlanningConfig,
  keys = githubKeys,
  purpose: "planning" | "notification" = "planning",
): Promise<GitHubWorkerIdentity> {
  try {
    if (token.length > 16384) throw new Error();
    const { payload } = await jwtVerify(token, keys, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: `${config.backendUrl}/${purpose === "planning" ? "technical-design-jobs" : "design-result-email"}`,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      requiredClaims: ["exp", "iat", "sub"],
    });
    const identity = identitySchema.parse(payload);
    const ref = `refs/heads/${config.workflowRef}`;
    const workflow =
      purpose === "planning" ? PLANNING_WORKFLOW : "notify-design-result.yml";
    const validEvent =
      purpose === "planning"
        ? identity.event_name === "workflow_dispatch" &&
          identity.run_attempt === "1"
        : ["workflow_run", "status"].includes(identity.event_name);
    if (
      !validEvent ||
      identity.repository !== config.repository ||
      identity.repository_id !== config.repositoryId ||
      identity.ref !== ref ||
      identity.workflow_ref !==
        `${config.repository}/.github/workflows/${workflow}@${ref}`
    )
      throw new Error();
    return { runId: identity.run_id, runAttempt: Number(identity.run_attempt) };
  } catch {
    throw new HandoffError(401, "Invalid GitHub worker identity.");
  }
}

export async function requireGitHubWorker(
  event: H3Event,
  config: PlanningConfig,
  purpose: "planning" | "notification" = "planning",
): Promise<GitHubWorkerIdentity> {
  const authorization = getHeader(event, "authorization");
  const token = authorization?.match(
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
  )?.[1];
  if (!token)
    throw new HandoffError(
      401,
      "A GitHub worker identity is required.",
    );
  return verifyGitHubWorkerToken(token, config, githubKeys, purpose);
}
