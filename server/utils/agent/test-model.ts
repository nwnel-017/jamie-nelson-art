import { AiModelAdapter, type AiModel } from "./ai-model";
import type { VerificationResult } from "./design-request";

const response: VerificationResult = {
  ready: false,
  plan: {
    steps: [
      {
        id: "step-1",
        action:
          "Apply the exported design to the requested website pages or theme.",
        target: null,
      },
    ],
  },
  requirements: [
    "Test analysis: apply the exported design to the requested website pages or theme.",
    "Keep the existing portfolio content unless a replacement is requested.",
  ],
  ambiguities: [
    "The target pages have not been specified.",
    "The desired treatment of existing content is unclear.",
    "The scope of the visual changes needs clarification.",
  ],
  clarifying_questions: [
    "Which pages should be created or updated?",
    "Should the existing text and images be kept or replaced?",
    "Which colors, fonts, or layout details from the design should be used?",
  ],
};

/** Deterministic adapter for testing the full flow without an external model. */
export function createTestModel(): AiModel {
  return new AiModelAdapter(async (input) => {
    if (!input.draft) return JSON.stringify(response);
    const answers = input.answers ?? [];
    const vague =
      answers.length === 0 ||
      answers.some(
        ({ answer }) =>
          answer.trim().length < 4 ||
          /^(whatever|maybe|not sure|i don.t know|some pages)$/i.test(
            answer.trim(),
          ),
      );
    return JSON.stringify({
      requirements: input.draft.requirements,
      ambiguities: vague ? ["The exact target page is still unclear."] : [],
      clarifying_questions: vague
        ? ["What is the exact page name or URL that should be changed?"]
        : [],
      ready: !vague,
      plan: {
        steps: [
          {
            id: input.draft.plan.steps[0]?.id ?? "step-1",
            action: "Apply the requested design changes.",
            target: vague
              ? null
              : (input.draft.plan.steps[0]?.target ??
                answers[0]!.answer.trim()),
            details: [...input.draft.answers, ...answers]
              .map(({ question, answer }) => `${question} ${answer}`)
              .join("\n")
              .slice(0, 4000),
          },
        ],
      },
    });
  });
}
