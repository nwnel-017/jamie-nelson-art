import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { agentRequestError } from "@server/utils/agent/errors";
import { readPlanningConfig } from "@server/utils/agent/planning/github-planning";
import { executeDesignRequest } from "@server/services/execute-design.service";

export default defineEventHandler(async (event) => {
  try {
    setHeader(event, "cache-control", "no-store");
    const user = await requireCanvaUser(event);
    const id = requireDesignRequestId(event);
    const supabase = serverSupabaseServiceRole<Database>(event);

    const config = readPlanningConfig(useRuntimeConfig(event));
    const result = await executeDesignRequest(
      supabase,
      id,
      user.userId,
      config,
    );
    setResponseStatus(event, 202);
    return result;
  } catch (error) {
    throw agentRequestError(error);
  }
});
