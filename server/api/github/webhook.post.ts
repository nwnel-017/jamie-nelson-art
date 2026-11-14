// TO DO --> put this route in api/github/webhook/
import { getHeader } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "#types/supabase/database";
import { readPlanningConfig } from "@server/utils/agent/planning/github-planning";
import {
  verifyPlanningWebhook,
  planningRunFromWebhook,
} from "@server/utils/agent/planning/github-planning-webhook";
import { agentRequestError, HandoffError } from "@server/utils/agent/errors";
import { reconcileTechnicalDesignRun } from "@server/services/technical-design-jobs.service";

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig(event);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of event.node.req.iterator({
      destroyOnReturn: false,
    })) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 256 * 1024) {
        setHeader(event, "connection", "close");
        event.node.req.resume();
        throw new HandoffError(413, "GitHub webhook exceeds 256 KB.");
      }
      chunks.push(bytes);
    }
    const raw = Buffer.concat(chunks);
    verifyPlanningWebhook(
      raw,
      getHeader(event, "x-hub-signature-256"),
      config.planningGithubWebhookSecret,
    );
    if (getHeader(event, "x-github-event") !== "workflow_run")
      return { success: true };
    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new HandoffError(400, "Invalid GitHub webhook JSON.");
    }
    const run = planningRunFromWebhook(body, readPlanningConfig(config));
    if (run) {
      // Successful callbacks are already terminal. Any remaining active job has
      // lost its result or was cancelled and must not stay running indefinitely.
      const supabase = serverSupabaseServiceRole<Database>(event);
      await reconcileTechnicalDesignRun(
        supabase,
        run.jobId,
        run.runId,
        run.runAttempt,
      );
    }
    return { success: true };
  } catch (error) {
    throw agentRequestError(
      error,
      "Could not reconcile the GitHub planning run.",
    );
  }
});
