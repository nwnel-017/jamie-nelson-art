import { createFlowLog } from "@server/utils/agent/flow-log";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { readAgentBody } from "@server/utils/agent/read-body";
import { agentRequestError } from "@server/utils/agent/errors";
import { designRequestResponse } from "@server/utils/agent/design-request";
import { createVerificationModel } from "@server/utils/agent/model-factory";
import { clarifyDesignRequest } from "@server/services/clarify-requirements.service";
import { analysisLimit } from "@server/utils/agent/analysis-config";

export default defineEventHandler(async (event) => {
  const log = createFlowLog("clarify-requirements");
  setHeader(event, "x-publisher-trace-id", log.traceId);
  try {
    setHeader(event, "cache-control", "no-store");
    const config = useRuntimeConfig(event);
    const user = await log.step("authenticate", () => requireCanvaUser(event, config));
    const id = requireDesignRequestId(event);
    const body = await readAgentBody(
      event,
      512 * 1024,
      "Request payload exceeds 512 KB.",
    );
    const supabase = serverSupabaseServiceRole<Database>(event);

    const result = await log.step("analyze-and-save-answers", () => clarifyDesignRequest(
      supabase,
      id,
      user.userId,
      body,
      createVerificationModel(config),
      analysisLimit(config.maxAnalyzeAttempts),
    ));

    log.write("completed", { requestId: result.id, ready: result.ready, draftVersion: result.draft_version });
    return designRequestResponse(result);
  } catch (error) {
    log.fail(error);
    throw agentRequestError(error);
  }
});
