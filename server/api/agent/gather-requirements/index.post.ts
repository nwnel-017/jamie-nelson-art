import { createFlowLog } from "@server/utils/agent/flow-log";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { readAgentBody } from "@server/utils/agent/read-body";
import { agentRequestError } from "@server/utils/agent/errors";
import { designRequestResponse } from "@server/utils/agent/design-request";
import { createVerificationModel } from "@server/utils/agent/model-factory";
import { validateGatherRequirements } from "@server/utils/agent/handoff/submission-validation";
import { gatherRequirements } from "@server/services/gather-requirements.service";
import { analysisLimit } from "@server/utils/agent/analysis-config";

export default defineEventHandler(async (event) => {
  const log = createFlowLog("gather-requirements");
  setHeader(event, "x-publisher-trace-id", log.traceId);
  try {
    const config = useRuntimeConfig(event);
    const user = await log.step("authenticate", () => requireCanvaUser(event, config));
    const body = await log.step("read-body", () => readAgentBody(event));
    const submission = await log.step("validate-and-download-export", () => validateGatherRequirements(body, config));
    const supabase = serverSupabaseServiceRole<Database>(event);

    log.write("provider.selected", { provider: config.aiProvider });
    const result = await gatherRequirements(supabase, user.userId, submission, {
      log,
      model: createVerificationModel(config),
      limit: analysisLimit(config.maxAnalyzeAttempts),
    });

    log.write("completed", { requestId: result.id, ready: result.ready, draftVersion: result.draft_version });
    return designRequestResponse(result);
  } catch (error) {
    log.fail(error);
    throw agentRequestError(error, "Could not process the Canva handoff.");
  }
});
