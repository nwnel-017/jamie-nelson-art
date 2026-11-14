import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "#types/supabase/database";
import { HandoffError } from "@server/utils/agent/errors";
import { parseTechnicalInstructions } from "@server/utils/agent/planning/technical-instructions";

type Client = SupabaseClient<Database>;
export type TechnicalDesignJob =
  Database["public"]["Tables"]["technical_design_jobs"]["Row"];
export type PlanningRun = { runId: string; runAttempt: number };

export async function getTechnicalDesignJobForDraft(
  supabase: Client,
  analysisId: string,
): Promise<TechnicalDesignJob | null> {
  const { data, error } = await supabase
    .from("technical_design_jobs")
    .select("*")
    .eq("design_analysis_id", analysisId)
    .maybeSingle();
  if (error)
    throw new HandoffError(500, "Could not load the technical planning job.");
  return data;
}

export async function reserveTechnicalDesignJob(
  supabase: Client,
  input: {
    requestId: string;
    userId: string;
    repositorySha: string;
    promptVersion: string;
    model: string;
  },
): Promise<{ created: boolean; job: TechnicalDesignJob }> {
  const { data, error } = await supabase.rpc("reserve_technical_design_job", {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_repository_sha: input.repositorySha,
    p_prompt_version: input.promptVersion,
    p_model: input.model,
  });
  if (error)
    throw new HandoffError(500, "Could not reserve a technical planning job.");
  const result = data as { state: string; job?: TechnicalDesignJob };
  if (result?.state === "not_found")
    throw new HandoffError(404, "Design request not found.");
  if (result?.state === "not_ready")
    throw new HandoffError(
      409,
      "Requirements must be understood before approval.",
      "PLAN_NOT_READY",
    );
  if (!result?.job || !["created", "existing"].includes(result.state))
    throw new HandoffError(500, "Invalid technical planning reservation.");
  return { created: result.state === "created", job: result.job };
}

async function recordDispatch(
  supabase: Client,
  jobId: string,
  failed: boolean,
  runId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("record_technical_design_job_dispatch", {
    p_job_id: jobId,
    p_run_id: runId,
    p_failed: failed,
  });
  if (error)
    throw new HandoffError(
      500,
      "Could not record the planning workflow dispatch.",
    );
}

export function markTechnicalJobDispatched(
  supabase: Client,
  jobId: string,
  runId: string,
) {
  return recordDispatch(supabase, jobId, false, runId);
}

export function markTechnicalJobDispatchFailed(
  supabase: Client,
  jobId: string,
) {
  return recordDispatch(supabase, jobId, true, null);
}

export async function claimTechnicalDesignJob(
  supabase: Client,
  jobId: string,
  run: PlanningRun,
) {
  const { data, error } = await supabase.rpc("claim_technical_design_job", {
    p_job_id: jobId,
    p_run_id: run.runId,
    p_run_attempt: run.runAttempt,
  });
  if (error)
    throw new HandoffError(500, "Could not claim the technical planning job.");
  return data as {
    claimed: boolean;
    job?: TechnicalDesignJob;
    designRequest?: {
      id: string;
      instructions: string;
      design_image: string;
      change_options: string[];
      draft_version: number;
      requirements: string[];
      plan: Json;
      answers: Json;
    };
  };
}

export async function finishTechnicalDesignJob(
  supabase: Client,
  jobId: string,
  run: PlanningRun,
  instructions: unknown,
) {
  const validated = parseTechnicalInstructions(instructions);
  const { data, error } = await supabase.rpc("finish_technical_design_job", {
    p_job_id: jobId,
    p_run_id: run.runId,
    p_run_attempt: run.runAttempt,
    p_instructions: validated as unknown as Json,
  });
  if (error)
    throw new HandoffError(500, "Could not save the technical instructions.");
  if (!data)
    throw new HandoffError(
      409,
      "This workflow does not own an active planning job.",
      "PLANNING_JOB_CONFLICT",
    );
  return { success: true };
}

export async function failTechnicalDesignJob(
  supabase: Client,
  jobId: string,
  run: PlanningRun,
) {
  const { data, error } = await supabase.rpc("fail_technical_design_job", {
    p_job_id: jobId,
    p_run_id: run.runId,
    p_run_attempt: run.runAttempt,
    p_error:
      "Technical instruction generation failed. No automatic retry will run.",
  });
  if (error)
    throw new HandoffError(
      500,
      "Could not record the technical planning failure.",
    );
  if (!data)
    throw new HandoffError(
      409,
      "This workflow does not own an active planning job.",
      "PLANNING_JOB_CONFLICT",
    );
  return { success: true };
}

export async function reconcileTechnicalDesignRun(
  supabase: Client,
  jobId: string,
  runId: string,
  runAttempt: number,
): Promise<void> {
  const { error } = await supabase.rpc("reconcile_technical_design_run", {
    p_job_id: jobId,
    p_run_id: runId,
    p_run_attempt: runAttempt,
  });
  if (error)
    throw new HandoffError(
      500,
      "Could not reconcile the technical planning workflow.",
    );
}
