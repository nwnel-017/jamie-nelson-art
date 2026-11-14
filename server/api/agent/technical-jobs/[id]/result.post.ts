import { z } from "zod";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireGitHubWorker } from "@server/utils/auth/requireGitHubWorker";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { readPlanningConfig } from "@server/utils/agent/planning/github-planning";
import { readAgentBody } from "@server/utils/agent/read-body";
import { agentRequestError, HandoffError } from "@server/utils/agent/errors";
import {
  finishTechnicalDesignJob,
  failTechnicalDesignJob,
} from "@server/services/technical-design-jobs.service";

const resultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      technical_instructions: z.unknown(),
    })
    .strict(),
  z.object({ status: z.literal("failed") }).strict(),
]);

export default defineEventHandler(async (event) => {
  try {
    setHeader(event, "cache-control", "no-store");
    const config = readPlanningConfig(useRuntimeConfig(event));
    const worker = await requireGitHubWorker(event, config);
    const jobId = requireDesignRequestId(event);
    const result = resultSchema.safeParse(
      await readAgentBody(event, 256 * 1024, "Planning result exceeds 256 KB."),
    );
    if (!result.success)
      throw new HandoffError(
        422,
        "Provide a valid technical planning outcome.",
      );
    const supabase = serverSupabaseServiceRole<Database>(event);
    if (result.data.status === "completed") {
      await finishTechnicalDesignJob(
        supabase,
        jobId,
        worker,
        result.data.technical_instructions,
      );
    } else {
      await failTechnicalDesignJob(supabase, jobId, worker);
    }
    return { success: true };
  } catch (error) {
    throw agentRequestError(
      error,
      "Could not save the technical planning result.",
    );
  }
});
