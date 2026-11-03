import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase/database";
import type {
  DesignRequest,
  DesignRequestInput,
} from "../utils/agent-handoff/design-request";
import { HandoffError } from "../utils/agent-handoff/errors";

export async function insertDesignRequest(
  supabase: SupabaseClient<Database>,
  input: DesignRequestInput,
): Promise<DesignRequest> {
  const { data, error } = await supabase
    .from("design_requests")
    .insert(input)
    .select(
      "id, design_image, instructions, requirements, ambiguities, clarifying_questions, created_at, updated_at",
    )
    .single();
  if (error || !data)
    throw new HandoffError(
      500,
      "Could not save the design request. Please try again.",
    );
  return data as DesignRequest;
}
