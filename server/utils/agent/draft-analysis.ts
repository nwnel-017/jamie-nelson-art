import {
  draftAnalysisSchema,
  questionText,
  type DraftAnalysis,
  type VerificationResult,
} from "./design-request";

export function initialDraftAnalysis(
  result: VerificationResult,
): DraftAnalysis {
  const ready = result.ready ?? false;
  const plan = result.plan ?? {
    steps: result.requirements.map((action, index) => ({
      id: `step-${index + 1}`,
      action,
      target: null,
    })),
  };

  let questions = result.clarifying_questions;
  if (!ready) {
    const seen = new Set<string>();
    questions = questions.filter((question) => {
      const text = questionText(question);
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    });
    if (questions.length === 0) {
      questions = [
        "Which exact pages or theme changes should this plan cover?",
      ];
    }
  }

  return draftAnalysisSchema.parse({
    ...result,
    ready,
    plan,
    clarifying_questions: questions,
  });
}
