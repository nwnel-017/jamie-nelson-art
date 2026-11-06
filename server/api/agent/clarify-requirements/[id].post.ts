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
  try {
    setHeader(event, "cache-control", "no-store");
    const config = useRuntimeConfig(event);
    const user = await requireCanvaUser(event, config);
    const id = requireDesignRequestId(event);
    const body = await readAgentBody(
      event,
      512 * 1024,
      "Request payload exceeds 512 KB.",
    );
    const supabase = serverSupabaseServiceRole<Database>(event);

    const result = await clarifyDesignRequest(
      supabase,
      id,
      user.userId,
      body,
      createVerificationModel(config),
      analysisLimit(config.maxAnalyzeAttempts),
    );

    return designRequestResponse(result);
  } catch (error) {
    throw agentRequestError(error);
  }
});
