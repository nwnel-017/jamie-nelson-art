import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireGitHubWorker } from "@server/utils/auth/requireGitHubWorker";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { readPlanningConfig } from "@server/utils/agent/planning/github-planning";
import { agentRequestError } from "@server/utils/agent/errors";
import { claimTechnicalDesignJob } from "@server/services/technical-design-jobs.service";

export default defineEventHandler(async (event) => {
  try {
    setHeader(event, "cache-control", "no-store");
    const config = readPlanningConfig(useRuntimeConfig(event));
    const worker = await requireGitHubWorker(event, config);
    const jobId = requireDesignRequestId(event);
    const supabase = serverSupabaseServiceRole<Database>(event);
    return await claimTechnicalDesignJob(supabase, jobId, worker);
  } catch (error) {
    throw agentRequestError(
      error,
      "Could not claim the technical planning job.",
    );
  }
});
