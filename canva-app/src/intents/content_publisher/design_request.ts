import { auth } from "@canva/user";

export interface DesignPlan {
  steps: {
    id: string;
    action: string;
    target: string | null;
    details?: string;
  }[];
}
export interface DesignDraft {
  id: string;
  version: number;
  ready: boolean;
  plan: DesignPlan;
  clarifying_questions: { id: string; question: string }[];
}
export interface ClarificationSubmission {
  draft_version: number;
  submission_id: string;
  answers: { question_id: string; answer: string }[];
}
export class DesignAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export interface DesignRequest {
  id: string;
  ready?: boolean;
  plan?: DesignPlan;
  draft?: DesignDraft | null;
  draft_version?: number;
  analyze_attempts?: number;
  attempts_remaining?: number;
  analysis_status: "pending" | "completed" | "failed";
  design_image: string;
  instructions: string;
  requirements: string[];
  ambiguities: string[];
  clarifying_questions: string[];
  clarifications: { question: string; answer: string }[];
  clarified_at: string | null;
  created_at: string;
  updated_at: string;
}

export const isRequestId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every((item) => typeof item === "string" && item.length <= 4000);

function isDesignImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.pathname.startsWith("/storage/v1/object/public/website_designs/"))
    );
  } catch {
    return false;
  }
}

export function parseDesignRequestResponse(value: unknown): DesignRequest {
  if (typeof value !== "object" || !value || !("designRequest" in value))
    throw new Error("The portfolio did not return a design analysis.");
  const data = value.designRequest;
  if (
    typeof data !== "object" ||
    !data ||
    !("id" in data) ||
    !isRequestId(data.id) ||
    !("design_image" in data) ||
    !isDesignImageUrl(data.design_image) ||
    !("instructions" in data) ||
    typeof data.instructions !== "string" ||
    !("requirements" in data) ||
    !isStringList(data.requirements) ||
    !("ambiguities" in data) ||
    !isStringList(data.ambiguities) ||
    !("clarifying_questions" in data) ||
    !isStringList(data.clarifying_questions) ||
    !("created_at" in data) ||
    typeof data.created_at !== "string" ||
    !("updated_at" in data) ||
    typeof data.updated_at !== "string"
  )
    throw new Error("The portfolio returned an invalid design analysis.");
  const analysisStatus =
    "analysis_status" in data ? data.analysis_status : "completed";
  if (
    analysisStatus !== "pending" &&
    analysisStatus !== "completed" &&
    analysisStatus !== "failed"
  )
    throw new Error("The portfolio returned an invalid analysis status.");
  if ("ready" in data && typeof data.ready !== "boolean")
    throw new Error("Invalid readiness response.");
  if ("draft" in data && data.draft != null) {
    const draft = data.draft;
    if (
      typeof draft !== "object" ||
      !draft ||
      !("id" in draft) ||
      !isRequestId(draft.id) ||
      !("version" in draft) ||
      !Number.isInteger(draft.version) ||
      Number(draft.version) < 1 ||
      !("ready" in draft) ||
      typeof draft.ready !== "boolean" ||
      !("plan" in draft) ||
      typeof draft.plan !== "object" ||
      !draft.plan ||
      !("steps" in draft.plan) ||
      !Array.isArray(draft.plan.steps) ||
      !draft.plan.steps.every(
        (step: unknown) =>
          typeof step === "object" &&
          step &&
          "id" in step &&
          typeof step.id === "string" &&
          "action" in step &&
          typeof step.action === "string" &&
          "target" in step &&
          (step.target == null || typeof step.target === "string"),
      ) ||
      !("clarifying_questions" in draft) ||
      !Array.isArray(draft.clarifying_questions) ||
      !draft.clarifying_questions.every(
        (q: unknown) =>
          typeof q === "object" &&
          q &&
          "id" in q &&
          isRequestId(q.id) &&
          "question" in q &&
          typeof q.question === "string",
      )
    )
      throw new Error("The portfolio returned an invalid draft.");
  }
  const clarifications = "clarifications" in data ? data.clarifications : [];
  const clarifiedAt = "clarified_at" in data ? data.clarified_at : null;
  if (
    (clarifiedAt != null && typeof clarifiedAt !== "string") ||
    !Array.isArray(clarifications) ||
    clarifications.length > 100 ||
    !clarifications.every(
      (item: unknown) =>
        typeof item === "object" &&
        item &&
        "question" in item &&
        typeof item.question === "string" &&
        "answer" in item &&
        typeof item.answer === "string",
    )
  )
    throw new Error("The portfolio returned invalid clarification answers.");
  return {
    ...data,
    clarifications,
    clarified_at: clarifiedAt,
    analysis_status: analysisStatus,
  } as DesignRequest;
}

export async function requestDesignAnalysis(
  id: string,
  backendHost: string,
  submission: ClarificationSubmission,
): Promise<DesignRequest> {
  if (!isRequestId(id)) throw new Error("Invalid design request ID.");
  const token = await auth.getCanvaUserToken();
  const response = await fetch(
    `${backendHost.replace(/\/$/, "")}/api/agent/clarify-requirements/${id}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(90000),
    },
  );
  if (!response.ok) {
    let message = "Could not analyze your answers. Please try again.";
    let code: string | undefined;
    try {
      const error = await response.json();
      if (
        typeof error.statusMessage === "string" &&
        error.statusMessage.length <= 500
      )
        message = error.statusMessage;
      if (typeof error.data?.code === "string") code = error.data.code;
    } catch {
      /* A network/proxy error may not have a JSON response. */
    }
    throw new DesignAnalysisError(message, code);
  }
  return parseDesignRequestResponse(await response.json());
}

export async function approveDesignRequest(
  id: string,
  backendHost: string,
): Promise<void> {
  if (!isRequestId(id)) throw new Error("Invalid design request ID.");
  const token = await auth.getCanvaUserToken();
  const response = await fetch(
    `${backendHost.replace(/\/$/, "")}/api/agent/execute/${id}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    let message = "Could not approve this request. Please try again.";
    try {
      const error = await response.json();
      if (typeof error.statusMessage === "string")
        message = error.statusMessage;
    } catch {
      /* Use fallback. */
    }
    throw new Error(message);
  }
  const result = await response.json();
  if (
    !result ||
    result.success !== true ||
    result.requestId !== id ||
    !isRequestId(result.jobId) ||
    !Number.isInteger(result.draft_version) ||
    result.draft_version < 1 ||
    !["queued", "running", "completed"].includes(result.status)
  )
    throw new Error(
      "The portfolio did not confirm that technical planning was queued.",
    );
}
