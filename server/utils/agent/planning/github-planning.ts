import { z } from "zod";
import { HandoffError } from "../errors";

export const PLANNING_WORKFLOW = "generate-technical-instructions.yml";
export const TECHNICAL_PROMPT_VERSION = "technical-instructions-v1";

export interface PlanningConfig {
  token: string;
  repository: string;
  repositoryId: string;
  workflowRef: string;
  sourceRef: string;
  backendUrl: string;
  model: string;
  promptVersion: string;
}

interface RuntimePlanningConfig {
  planningGithubToken: string;
  planningRepository: string;
  planningRepositoryId: string;
  planningWorkflowRef: string;
  planningSourceRef: string;
  planningBackendUrl: string;
  planningCodexModel: string;
}

export function readPlanningConfig(
  config: RuntimePlanningConfig,
): PlanningConfig {
  const branch = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_./-]+$/);
  const result = z
    .object({
      token: z.string().trim().min(1),
      repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
      repositoryId: z.string().regex(/^[1-9][0-9]*$/),
      workflowRef: branch,
      sourceRef: branch,
      backendUrl: z.string().url(),
      model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
    })
    .safeParse({
      token: config.planningGithubToken,
      repository: config.planningRepository,
      repositoryId: config.planningRepositoryId,
      workflowRef: config.planningWorkflowRef,
      sourceRef: config.planningSourceRef,
      backendUrl: config.planningBackendUrl,
      model: config.planningCodexModel,
    });
  if (!result.success)
    throw new HandoffError(
      503,
      "Configure GitHub technical planning before approving requests.",
      "PLANNING_NOT_CONFIGURED",
    );
  const url = new URL(result.data.backendUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new HandoffError(
      503,
      "The technical planning backend must be a public HTTPS origin.",
    );
  }
  return {
    ...result.data,
    backendUrl: url.origin,
    promptVersion: TECHNICAL_PROMPT_VERSION,
  };
}

function githubHeaders(config: PlanningConfig) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2026-03-10",
    "Content-Type": "application/json",
  };
}

export async function resolvePlanningCommit(
  config: PlanningConfig,
  request: typeof fetch = fetch,
): Promise<string> {
  try {
    const response = await request(
      `https://api.github.com/repos/${config.repository}/commits/${encodeURIComponent(config.sourceRef)}`,
      {
        headers: githubHeaders(config),
        redirect: "error",
      },
    );
    if (!response.ok) throw new Error();
    return z
      .object({ sha: z.string().regex(/^[0-9a-f]{40}$/) })
      .parse(await response.json()).sha;
  } catch {
    throw new HandoffError(
      502,
      "Could not resolve the source repository commit.",
      "SOURCE_UNAVAILABLE",
    );
  }
}

// calls the github action to invoke codex
export async function dispatchPlanningWorkflow(
  config: PlanningConfig,
  jobId: string,
  designId: string,
  request: typeof fetch = fetch,
): Promise<{ runId: string }> {
  let response: Response;
  try {
    response = await request(
      `https://api.github.com/repos/${config.repository}/actions/workflows/${PLANNING_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: githubHeaders(config),
        redirect: "error",
        body: JSON.stringify({
          ref: config.workflowRef,
          inputs: {
            job_id: jobId,
            design_id: designId,
            base_branch: config.sourceRef,
          },
        }),
      },
    );
  } catch {
    // The dispatch may have reached GitHub. Never automatically send it again.
    throw new HandoffError(
      503,
      "GitHub dispatch could not be confirmed. The existing job has been kept for reconciliation.",
      "DISPATCH_UNCONFIRMED",
    );
  }
  if (response.status >= 400 && response.status < 500) {
    throw new HandoffError(
      502,
      "GitHub rejected the technical planning workflow dispatch.",
      "DISPATCH_FAILED",
    );
  }
  try {
    if (response.status !== 200) throw new Error();
    const data = z
      .object({ workflow_run_id: z.number().int().positive().safe() })
      .parse(await response.json());
    return { runId: String(data.workflow_run_id) };
  } catch {
    throw new HandoffError(
      503,
      "GitHub dispatch could not be confirmed. The existing job has been kept for reconciliation.",
      "DISPATCH_UNCONFIRMED",
    );
  }
}
