import type { DesignRequest } from "./design_request";
export const designRequest: DesignRequest = {
  response: "Please clarify the gallery and color.",
  ready: false,
  analyze_attempts: 1,
  attempts_remaining: 3,
  draft_version: 1,
  plan: {
    steps: [{ id: "step-1", action: "Update the gallery page.", target: null }],
  },
  draft: {
    response: "Please clarify the gallery and color.",
    id: "12345678-1234-4234-8234-123456789aaa",
    version: 1,
    ready: false,
    plan: {
      steps: [
        { id: "step-1", action: "Update the gallery page.", target: null },
      ],
    },
    clarifying_questions: [
      {
        id: "12345678-1234-4234-8234-123456789ab1",
        question: "Which gallery?",
      },
      { id: "12345678-1234-4234-8234-123456789ab2", question: "Which color?" },
    ],
  },
  analysis_status: "completed",
  id: "12345678-1234-4234-8234-123456789abc",
  design_image: "https://storage.example/design.png",
  instructions: "Update the portfolio.",
  requirements: ["Update the gallery page."],
  ambiguities: ["The gallery and color are unspecified."],
  clarifying_questions: ["Which gallery?", "Which color?"],
  clarifications: [],
  clarified_at: null,
  created_at: "2026-11-03T00:00:00Z",
  updated_at: "2026-11-03T00:00:00Z",
};
