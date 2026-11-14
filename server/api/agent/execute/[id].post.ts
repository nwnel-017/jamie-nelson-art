import { createFlowLog } from "@server/utils/agent/flow-log";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { agentRequestError } from "@server/utils/agent/errors";
import { readPlanningConfig } from "@server/utils/agent/planning/github-planning";
import { executeDesignRequest } from "@server/services/execute-design.service";

export default defineEventHandler(async (event) => {
  const log = createFlowLog("approve");
  setHeader(event, "x-publisher-trace-id", log.traceId);
  try {
    setHeader(event, "cache-control", "no-store");
    const user = await log.step("authenticate", () => requireCanvaUser(event));
    const id = requireDesignRequestId(event);
    const supabase = serverSupabaseServiceRole<Database>(event);

    const config = readPlanningConfig(useRuntimeConfig(event));
    const result = await log.step("queue-technical-planning", () => executeDesignRequest(
      supabase,
      id,
      user.userId,
      config,
    ));
    setResponseStatus(event, 202);
    log.write("completed", { requestId: id, jobId: result.jobId });
    return result;
  } catch (error) {
    log.fail(error);
    throw agentRequestError(error);
  }
});
