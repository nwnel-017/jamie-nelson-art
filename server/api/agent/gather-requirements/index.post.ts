import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireCanvaUser } from "@server/utils/auth/requireCanvaUser";
import { readAgentBody } from "@server/utils/agent/read-body";
import { agentRequestError } from "@server/utils/agent/errors";
import { designRequestResponse } from "@server/utils/agent/design-request";
import { createVerificationModel } from "@server/utils/agent/model-factory";
import { validateGatherRequirements } from "@server/utils/agent/submission-validation";
import { gatherRequirements } from "@server/services/gather-requirements.service";
import { analysisLimit } from "@server/utils/agent/analysis-config";

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig(event);
    const user = await requireCanvaUser(event, config);
    const body = await readAgentBody(event);
    const submission = await validateGatherRequirements(body, config);
    const supabase = serverSupabaseServiceRole<Database>(event);

    const result = await gatherRequirements(supabase, user.userId, submission, {
      model: createVerificationModel(config),
      limit: analysisLimit(config.maxAnalyzeAttempts),
    });

    return designRequestResponse(result);
  } catch (error) {
    throw agentRequestError(error, "Could not process the Canva handoff.");
  }
});
