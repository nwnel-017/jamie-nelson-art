import { z } from "zod";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { requireGitHubWorker } from "@server/utils/auth/requireGitHubWorker";
import { readPlanningConfig } from "@server/utils/agent/planning/github-planning";
import { requireDesignRequestId } from "@server/utils/agent/request-id";
import { readAgentBody } from "@server/utils/agent/read-body";
import { agentRequestError, HandoffError } from "@server/utils/agent/errors";
import {
  getResultEmail,
  saveResultEmail,
  markResultEmailSent,
  resultEmailSchema,
} from "@server/services/design-result-email.service";

const emailRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }).strict(),
  z.object({ action: z.literal("save"), email: resultEmailSchema }).strict(),
  z.object({ action: z.literal("sent") }).strict(),
]);

export default defineEventHandler(async (event) => {
  try {
    setHeader(event, "cache-control", "no-store");
    const config = readPlanningConfig(useRuntimeConfig(event));
    await requireGitHubWorker(event, config, "notification");
    const jobId = requireDesignRequestId(event);
    const body = emailRequest.safeParse(
      await readAgentBody(event, 40000, "Result email is too large."),
    );
    if (!body.success)
      throw new HandoffError(422, "Provide a valid email state action.");
    const client = serverSupabaseServiceRole<Database>(event);
    if (body.data.action === "save")
      return saveResultEmail(client, jobId, body.data.email);
    if (body.data.action === "sent") return markResultEmailSent(client, jobId);
    return getResultEmail(client, jobId);
  } catch (error) {
    throw agentRequestError(error, "Could not update result email state.");
  }
});
