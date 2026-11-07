import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import type { ValidatedHandoff } from "@server/utils/agent/handoff/submission-validation";
import type { AiModel } from "@server/utils/agent/ai-model";
import { VerificationAgent } from "@server/utils/agent/verification-agent";
import { HandoffError } from "@server/utils/agent/errors";
import {
  reserveAnalysis,
  finishAnalysis,
  failAnalysis,
  getRequestWithDraft,
} from "@server/services/design-drafts.service";

import { submissionHash } from "@server/utils/agent/submission-hash";
import { initialDraftAnalysis } from "@server/utils/agent/draft-analysis";
import { ensureDesignRequest } from "@server/services/design-requests.service";

export async function gatherRequirements(
  supabase: SupabaseClient<Database>,
  userId: string,
  handoff: ValidatedHandoff & { submissionId: string },
  { model, limit }: { model: AiModel; limit: number },
) {
  const hash = submissionHash({
    instructions: handoff.instructions,
    changeOptions: handoff.changeOptions,
    image: Buffer.from(handoff.bytes).toString("base64"),
  });
  const id = await ensureDesignRequest(supabase, userId, handoff, hash);
  const reservation = await reserveAnalysis(supabase, {
    requestId: id,
    userId,
    submissionId: handoff.submissionId,
    baseVersion: 0,
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
    const result = await new VerificationAgent(model).run({
      instructions: handoff.instructions,
      changeOptions: handoff.changeOptions,
      image: { bytes: handoff.bytes, mimeType: "image/png" },
    });
    return await finishAnalysis(supabase, {
      requestId: id,
      userId,
      submissionId: handoff.submissionId,
      analysis: initialDraftAnalysis(result),
      answers: [],
      limit,
    });
  } catch (error) {
    try {
      await failAnalysis(supabase, {
        requestId: id,
        userId,
        submissionId: handoff.submissionId,
      });
    } catch {
      console.error("Failed to record initial analysis failure.");
    }
    throw new HandoffError(
      error instanceof HandoffError ? error.statusCode : 502,
      error instanceof HandoffError
        ? error.message
        : "Could not analyze the design. Please submit again.",
      "ANALYSIS_FAILED",
    );
  }
}
