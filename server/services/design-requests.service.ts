import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import type { DesignRequest } from "@server/utils/agent/design-request";
import type { ValidatedHandoff } from "@server/utils/agent/submission-validation";
import {
  uploadDesignImage,
  deleteDesignImage,
} from "@server/services/website-designs-storage.service";
import { HandoffError } from "@server/utils/agent/errors";

export async function getDesignRequest(
  supabase: SupabaseClient<Database>,
  id: string,
  canvaUserId: string,
): Promise<DesignRequest> {
  const { data, error } = await supabase
    .from("design_requests")
    .select(
      "id, design_image, instructions, requirements, ambiguities, clarifying_questions, created_at, updated_at, clarifications, clarified_at, analysis_status, analyze_attempts, change_options",
    )
    .eq("id", id)
    .eq("canva_user_id", canvaUserId)
    .maybeSingle();
  if (error) throw new HandoffError(500, "Could not load the design request.");
  if (!data) throw new HandoffError(404, "Design request not found.");
  return data as DesignRequest;
}

async function findSubmission(
  supabase: SupabaseClient<Database>,
  requestId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("design_requests")
    .select("id, initial_payload_hash")
    .eq("id", requestId)
    .eq("canva_user_id", userId)
    .maybeSingle();
  if (error) throw new HandoffError(500, "Could not load the submission.");
  return data;
}

export async function ensureDesignRequest(
  supabase: SupabaseClient<Database>,
  userId: string,
  handoff: ValidatedHandoff & { submissionId: string },
  payloadHash: string,
): Promise<string> {
  // The initial submission ID is also the request ID. A concurrent retry must
  // reuse the existing row without changing its owner, instructions or image.
  const requestId = handoff.submissionId;
  let existing = await findSubmission(supabase, requestId, userId);
  if (!existing) {
    const image = await uploadDesignImage(supabase, handoff.bytes);
    const { data, error } = await supabase
      .from("design_requests")
      .upsert(
        {
          id: requestId,
          canva_user_id: userId,
          initial_payload_hash: payloadHash,
          design_image: image.url,
          instructions: handoff.instructions,
          change_options: handoff.changeOptions,
          requirements: [],
          ambiguities: [],
          clarifying_questions: [],
          analysis_status: "pending",
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error || !data) {
      await deleteDesignImage(supabase, image.path);
      if (error)
        throw new HandoffError(500, "Could not save the design request.");
    }
    existing = await findSubmission(supabase, requestId, userId);
  }
  if (!existing) throw new HandoffError(404, "Design request not found.");
  if (existing.initial_payload_hash !== payloadHash) {
    throw new HandoffError(
      409,
      "This submission ID was already used for a different request.",
      "SUBMISSION_CONFLICT",
    );
  }
  return requestId;
}
