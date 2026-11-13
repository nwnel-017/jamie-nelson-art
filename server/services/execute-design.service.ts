import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { getRequestWithDraft } from "@server/services/design-drafts.service";
import { HandoffError } from "@server/utils/agent/errors";
import {
  resolvePlanningCommit,
  dispatchPlanningWorkflow,
  type PlanningConfig,
} from "@server/utils/agent/planning/github-planning";
import {
  getTechnicalDesignJobForDraft,
  reserveTechnicalDesignJob,
  markTechnicalJobDispatched,
  markTechnicalJobDispatchFailed,
  type TechnicalDesignJob,
} from "@server/services/technical-design-jobs.service";

function planningResponse(job: TechnicalDesignJob, draftVersion: number) {
  if (job.status === "dispatching") {
    throw new HandoffError(
      503,
      "Planning dispatch is not confirmed. The existing job has been kept; no duplicate job will be started.",
      "DISPATCH_UNCONFIRMED",
    );
  }
  if (job.status === "failed") {
    throw new HandoffError(
      409,
      "The technical planning job failed. No automatic retry will run.",
      "PLANNING_FAILED",
    );
  }
  return {
    success: true,
    requestId: job.design_request_id,
    draft_version: draftVersion,
    jobId: job.id,
    status: job.status,
  };
}

export async function executeDesignRequest(
  supabase: SupabaseClient<Database>,
  id: string,
  userId: string,
  config: PlanningConfig,
) {
  const request = await getRequestWithDraft(supabase, id, userId);
  if (
    request.analysis_status !== "completed" ||
    !request.ready ||
    !request.draft?.ready
  ) {
    throw new HandoffError(
      409,
      "Requirements must be understood before approval.",
      "PLAN_NOT_READY",
    );
  }
  // A repeat approval must reuse the job even when GitHub is temporarily unavailable.
  const existing = await getTechnicalDesignJobForDraft(
    supabase,
    request.draft.id,
  );
  // returns success when a job is running
  if (existing) return planningResponse(existing, request.draft.version);

  // git the latest commit
  const repositorySha = await resolvePlanningCommit(config);
  const { created, job } = await reserveTechnicalDesignJob(supabase, {
    requestId: id,
    userId,
    repositorySha,
    promptVersion: config.promptVersion,
    model: config.model,
  });
  if (!created) return planningResponse(job, request.draft.version);
  let runId: string;
  try {
    // begin code execution
    ({ runId } = await dispatchPlanningWorkflow(config, job.id, id));
  } catch (error) {
    // A network error may mean GitHub accepted the workflow. Keep dispatching
    // and let its worker claim the same job; never automatically dispatch again.
    if (error instanceof HandoffError && error.code === "DISPATCH_FAILED") {
      await markTechnicalJobDispatchFailed(supabase, job.id);
    }
    throw error;
  }
  await markTechnicalJobDispatched(supabase, job.id, runId);
  // The worker may have claimed or finished before the dispatch response arrived.
  const dispatched = await getTechnicalDesignJobForDraft(
    supabase,
    job.design_analysis_id,
  );
  if (!dispatched)
    throw new HandoffError(500, "The planning job is unavailable.");
  return planningResponse(dispatched, request.draft.version);
}
