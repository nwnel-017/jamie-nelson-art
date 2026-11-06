import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import type { AiModel } from "@server/utils/agent/ai-model";
import type { DesignRequest } from "@server/utils/agent/design-request";
import { ClarificationAgent } from "@server/utils/agent/clarification-agent";
import { HandoffError } from "@server/utils/agent/errors";
import {
  parseClarificationSubmission,
  validateClarificationAnswers,
} from "@server/utils/agent/submission-validation";
import { submissionHash } from "@server/utils/agent/submission-hash";
import { getDesignRequest } from "@server/services/design-requests.service";
import {
  getDesignDraft,
  getRequestWithDraft,
  reserveAnalysis,
  finishAnalysis,
  failAnalysis,
} from "@server/services/design-drafts.service";

export async function clarifyDesignRequest(
  supabase: SupabaseClient<Database>,
  id: string,
  userId: string,
  body: unknown,
  model: AiModel,
  limit = 4,
): Promise<DesignRequest> {
  const input = parseClarificationSubmission(body);
  const request = await getDesignRequest(supabase, id, userId);
  const draft = await getDesignDraft(supabase, id, input.draft_version);
  if (!draft)
    throw new HandoffError(
      409,
      "This draft is unavailable. Refresh the analysis.",
      "STALE_DRAFT",
    );
  const answers = validateClarificationAnswers(input.answers, draft);
  const hash = submissionHash({ draft_version: input.draft_version, answers });
  const reservation = await reserveAnalysis(supabase, {
    requestId: id,
    userId,
    submissionId: input.submission_id,
    baseVersion: input.draft_version,
    payloadHash: hash,
    limit,
  });
  if (reservation.state === "completed") {
    return getRequestWithDraft(
      supabase,
      id,
      userId,
      limit,
      reservation.version,
    );
  }
  try {
    const result = await new ClarificationAgent(model).run({
      instructions: request.instructions,
      changeOptions: request.change_options ?? [],
      draft,
      answers,
    });
    return await finishAnalysis(supabase, {
      requestId: id,
      userId,
      submissionId: input.submission_id,
      analysis: result,
      answers,
      limit,
      source: draft,
    });
  } catch (error) {
    try {
      await failAnalysis(supabase, {
        requestId: id,
        userId,
        submissionId: input.submission_id,
      });
    } catch {
      console.error("Failed to record a clarification analysis failure.");
    }
    throw new HandoffError(
      error instanceof HandoffError ? error.statusCode : 502,
      error instanceof HandoffError
        ? error.message
        : "Could not refine the design plan. Your latest draft has been kept.",
      "ANALYSIS_FAILED",
    );
  }
}
