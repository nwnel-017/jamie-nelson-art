import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "#types/supabase/database";
import { HandoffError } from "@server/utils/agent/errors";
import {
  type DesignRequest,
  type DesignDraft,
  type DraftAnalysis,
  type DraftAnswer,
} from "@server/utils/agent/design-request";
import { getDesignRequest } from "@server/services/design-requests.service";

type Client = SupabaseClient<Database>;
export async function getDesignDraft(
  supabase: Client,
  id: string,
  version?: number,
): Promise<DesignDraft | null> {
  let query = supabase
    .from("design_analyses")
    .select(
      "id, design_request_id, version, plan, response, requirements, ambiguities, clarifying_questions, answers, ready, submission_id, created_at",
    )
    .eq("status", "completed")
    .eq("design_request_id", id);
  if (version !== undefined) query = query.eq("version", version);
  const { data, error } = await query
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[canva-publisher] draft.load.failed", {
      requestId: id,
      version,
      databaseCode: error.code,
    });
    throw new HandoffError(500, "Could not load the design draft.");
  }
  return data as unknown as DesignDraft | null;
}
export async function getRequestWithDraft(
  supabase: Client,
  id: string,
  userId: string,
  limit = 4,
  version?: number,
): Promise<DesignRequest> {
  const request = await getDesignRequest(supabase, id, userId);
  const draft = await getDesignDraft(supabase, id, version);
  return {
    ...request,
    draft,
    draft_version: draft?.version ?? 0,
    ready: draft?.ready ?? false,
    plan: draft?.plan ?? { steps: [] },
    attempts_remaining: Math.max(0, limit - (request.analyze_attempts ?? 0)),
    ...(draft
      ? {
          response: draft.response,
          requirements: draft.requirements,
          ambiguities: draft.ambiguities,
          clarifying_questions: draft.clarifying_questions.map(
            (q) => q.question,
          ),
        }
      : {}),
  };
}
const reservationSchema = z.object({
  state: z.enum([
    "reserved",
    "completed",
    "failed",
    "processing",
    "conflict",
    "stale",
    "ready",
    "limit",
    "not_found",
  ]),
  version: z.number().int().positive().optional(),
});
type AnalysisSubmission = {
  requestId: string;
  userId: string;
  submissionId: string;
};

type ReserveAnalysisInput = AnalysisSubmission & {
  baseVersion: number;
  payloadHash: string;
  limit: number;
};

type AnalysisReservation =
  { state: "reserved" } | { state: "completed"; version: number };

export async function reserveAnalysis(
  supabase: Client,
  input: ReserveAnalysisInput,
): Promise<AnalysisReservation> {
  const { requestId, userId, submissionId, baseVersion, payloadHash, limit } =
    input;
  const { data, error } = await supabase.rpc("reserve_design_analysis", {
    p_request_id: requestId,
    p_user_id: userId,
    p_submission_id: submissionId,
    p_base_version: baseVersion,
    p_payload_hash: payloadHash,
    p_limit: limit,
  });
  if (error)
    throw new HandoffError(
      500,
      "Could not reserve a design analysis. Retry the same submission.",
    );
  const result = reservationSchema.safeParse(data);
  if (!result.success)
    throw new HandoffError(500, "Invalid analysis reservation response.");
  switch (result.data.state) {
    case "reserved":
      return { state: "reserved" };
    case "completed":
      if (!result.data.version)
        throw new HandoffError(500, "Missing analysis result version.");
      return { state: "completed", version: result.data.version };
    case "limit":
      throw new HandoffError(
        422,
        `The analysis limit of ${limit} attempts has been reached. Your latest draft has been kept.`,
        "ANALYSIS_LIMIT_REACHED",
      );
    case "stale":
      throw new HandoffError(
        409,
        "This draft has changed. Refresh the analysis before answering.",
        "STALE_DRAFT",
      );
    case "processing":
      throw new HandoffError(
        409,
        "Analysis is already running. Retry the same submission shortly.",
        "ANALYSIS_IN_PROGRESS",
      );
    case "conflict":
      throw new HandoffError(
        409,
        "This submission ID was already used with different answers.",
        "SUBMISSION_CONFLICT",
      );
    case "failed":
      throw new HandoffError(
        409,
        "That analysis attempt failed. Submit again to retry.",
        "ANALYSIS_FAILED",
      );
    case "ready":
      throw new HandoffError(
        409,
        "The plan is already ready. Refresh the analysis.",
        "PLAN_READY",
      );
    default:
      throw new HandoffError(404, "Design request not found.");
  }
}
export async function failAnalysis(
  supabase: Client,
  { requestId, userId, submissionId }: AnalysisSubmission,
): Promise<void> {
  const { error } = await supabase.rpc("fail_design_analysis", {
    p_request_id: requestId,
    p_user_id: userId,
    p_submission_id: submissionId,
  });
  if (error)
    throw new HandoffError(500, "Could not record the analysis failure.");
}
type FinishAnalysisInput = AnalysisSubmission & {
  analysis: DraftAnalysis;
  answers: DraftAnswer[];
  limit: number;
  source?: DesignDraft;
};

export async function finishAnalysis(
  supabase: Client,
  input: FinishAnalysisInput,
): Promise<DesignRequest> {
  const { requestId, userId, submissionId, analysis, answers, limit, source } =
    input;
  const priorIds = new Map(
    source?.clarifying_questions.map((q) => [q.question, q.id]) ?? [],
  );
  const payload = {
    ...analysis,
    clarifying_questions: analysis.clarifying_questions.map((question) => ({
      id: priorIds.get(question) ?? randomUUID(),
      question,
    })),
  };
  const { data, error } = await supabase.rpc("finish_design_analysis", {
    p_request_id: requestId,
    p_user_id: userId,
    p_submission_id: submissionId,
    p_analysis: payload as unknown as Json,
    p_answers: answers as unknown as Json,
  });
  if (error || !data)
    throw new HandoffError(500, "Could not save the updated design draft.");
  return getRequestWithDraft(supabase, requestId, userId, limit, data);
}
