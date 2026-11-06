import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import { getRequestWithDraft } from "@server/services/design-drafts.service";
import { HandoffError } from "@server/utils/agent/errors";

export async function executeDesignRequest(
  supabase: SupabaseClient<Database>,
  id: string,
  userId: string,
) {
  const request = await getRequestWithDraft(supabase, id, userId);
  if (
    request.analysis_status !== "completed" ||
    !request.ready ||
    !request.draft?.ready
  )
    throw new HandoffError(
      409,
      "Requirements must be understood before approval.",
      "PLAN_NOT_READY",
    );
  // Placeholder only: no website changes are executed yet.
  return {
    success: true,
    requestId: request.id,
    draft_version: request.draft.version,
  };
}
