import { z } from "zod";
import { HandoffError } from "./errors";

export const items = z.array(z.string().trim().min(1).max(4000)).max(100);
export const planSchema = z
  .object({
    steps: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            action: z.string().trim().min(1).max(4000),
            target: z.string().trim().min(1).max(500).nullable(),
            details: z.string().max(4000).optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .refine(
    (plan) =>
      new Set(plan.steps.map((step) => step.id)).size === plan.steps.length,
  );
export type DesignPlan = z.infer<typeof planSchema>;
export interface DraftQuestion {
  id: string;
  question: string;
}
export interface DraftAnswer {
  question_id: string;
  question: string;
  answer: string;
}
export interface DesignDraft {
  id: string;
  design_request_id: string;
  version: number;
  plan: DesignPlan;
  response: string;
  requirements: string[];
  ambiguities: string[];
  clarifying_questions: DraftQuestion[];
  answers: DraftAnswer[];
  ready: boolean;
  submission_id: string;
  created_at: string;
}

export const verificationResultSchema = z
  .object({
    response: z.string().trim().min(1).max(1000),
    requirements: items,
    ambiguities: items,
    clarifying_questions: items,
    ready: z.boolean().optional(),
    plan: planSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.ready ||
      (!!value.plan?.steps.length &&
        value.plan.steps.every((step) => step.target !== null) &&
        value.ambiguities.length === 0 &&
        value.clarifying_questions.length === 0),
    "A ready plan must contain concrete steps and no unresolved questions",
  );

export const draftAnalysisSchema = z
  .object({
    response: z.string().trim().min(1).max(1000),
    requirements: items,
    ambiguities: items,
    clarifying_questions: items,
    plan: planSchema,
    ready: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      value.ready
        ? value.plan.steps.length > 0 &&
          value.plan.steps.every((step) => step.target !== null) &&
          value.requirements.length > 0 &&
          value.ambiguities.length === 0 &&
          value.clarifying_questions.length === 0
        : value.clarifying_questions.length > 0,
    "Return concrete steps when ready, or blocking clarification questions when not ready",
  )
  .refine(
    (value) =>
      new Set(value.clarifying_questions).size ===
      value.clarifying_questions.length,
    "Do not return duplicate questions",
  );
export type DraftAnalysis = z.infer<typeof draftAnalysisSchema>;

export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type DesignRequestInput = VerificationResult & {
  design_image: string;
  instructions: string;
};
export type DesignRequest = DesignRequestInput & {
  id: string;
  analyze_attempts?: number;
  change_options?: import("./handoff/validation").ChangeOption[];
  draft?: DesignDraft | null;
  draft_version?: number;
  attempts_remaining?: number;
  analysis_status: "pending" | "completed" | "failed";
  clarifications?: { question: string; answer: string }[];
  clarified_at?: string | null;
  created_at: string;
  updated_at: string;
};
export function parseVerificationResult(text: string): VerificationResult {
  try {
    if (text.length > 64 * 1024) throw new Error();
    return verificationResultSchema.parse(JSON.parse(text));
  } catch {
    throw new HandoffError(
      502,
      "The model returned an invalid design verification.",
    );
  }
}

export function designRequestResponse(request: DesignRequest) {
  return {
    designRequest: request,
    ...(request.draft !== undefined
      ? {
          ready: request.ready ?? false,
          plan: request.plan ?? { steps: [] },
          draft_version: request.draft_version ?? 0,
          attempts_remaining: request.attempts_remaining ?? 0,
        }
      : {}),
  };
}
