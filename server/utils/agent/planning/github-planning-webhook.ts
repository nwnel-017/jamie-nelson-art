import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HandoffError } from "../errors";
import { PLANNING_WORKFLOW, type PlanningConfig } from "./github-planning";

export function verifyPlanningWebhook(
  raw: Buffer,
  signature: string | undefined,
  secret: string,
): void {
  if (!secret)
    throw new HandoffError(
      503,
      "Configure the GitHub planning webhook secret.",
    );
  if (!signature || !/^sha256=[0-9a-f]{64}$/.test(signature))
    throw new HandoffError(401, "Invalid GitHub webhook signature.");
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
    throw new HandoffError(401, "Invalid GitHub webhook signature.");
}

const completedRun = z.object({
  action: z.literal("completed"),
  repository: z.object({
    id: z.number().int().positive().safe(),
    full_name: z.string(),
  }),
  workflow_run: z.object({
    id: z.number().int().positive().safe(),
    run_attempt: z.literal(1),
    event: z.literal("workflow_dispatch"),
    head_branch: z.string(),
    path: z.string(),
    status: z.literal("completed"),
    display_title: z.string(),
  }),
});

export function planningRunFromWebhook(body: unknown, config: PlanningConfig) {
  const result = completedRun.safeParse(body);
  if (!result.success) return null;
  const { repository, workflow_run: run } = result.data;
  const workflowPath = `.github/workflows/${PLANNING_WORKFLOW}`;
  const expectedPaths = [
    workflowPath,
    `${workflowPath}@${config.workflowRef}`,
    `${workflowPath}@refs/heads/${config.workflowRef}`,
  ];
  if (
    repository.full_name !== config.repository ||
    String(repository.id) !== config.repositoryId ||
    run.head_branch !== config.workflowRef ||
    !expectedPaths.includes(run.path)
  )
    return null;
  const jobId = run.display_title.match(
    /^Technical design job ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  )?.[1];
  if (!jobId) return null;
  return { jobId, runId: String(run.id), runAttempt: run.run_attempt };
}
