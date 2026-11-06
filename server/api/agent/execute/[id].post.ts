import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { agentRequestError } from "@server/utils/agent/errors";
import { executeDesignRequest } from "@server/services/execute-design.service";

export default defineEventHandler(async (event) => {
  try {
    setHeader(event, "cache-control", "no-store");
    const user = await requireCanvaUser(event);
    const id = requireDesignRequestId(event);
    const supabase = serverSupabaseServiceRole<Database>(event);

    return await executeDesignRequest(supabase, id, user.userId);
  } catch (error) {
    throw agentRequestError(error);
  }
});
