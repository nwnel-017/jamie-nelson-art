import type { AiModel, AiModelInput } from "./ai-model";
import {
  draftAnalysisSchema,
  latestImageAnswers,
  type DraftAnalysis,
} from "./design-request";
import { HandoffError } from "./errors";
import { CLARIFICATION_SYSTEM_PROMPT } from "./prompts/clarification";

export class ClarificationAgent {
  constructor(private readonly model: AiModel) {}
  async run(
    input: Omit<AiModelInput, "systemPrompt" | "image">,
  ): Promise<DraftAnalysis> {
    try {
      const { text } = await this.model.generate({
        ...input,
        systemPrompt: CLARIFICATION_SYSTEM_PROMPT,
      });
      if (text.length > 64 * 1024) throw new Error();
      const result = draftAnalysisSchema.parse(JSON.parse(text));
      const accepted = new Set(
        latestImageAnswers([
          ...(input.draft?.answers ?? []),
          ...(input.answers ?? []),
        ])
          .filter((a) => a.keep_anyway)
          .map((a) => a.image.id),
      );
      const dismissed = result.clarifying_questions.filter(
        (q) => typeof q !== "string" && q.image_id && accepted.has(q.image_id),
      );
      if (!dismissed.length) return result;
      const concerns = new Set(
        dismissed.map((q) => (typeof q === "string" ? q : q.concern)),
      );
      const questions = result.clarifying_questions.filter(
        (q) => !dismissed.includes(q),
      );
      const ambiguities = result.ambiguities.filter((a) => !concerns.has(a));
      return draftAnalysisSchema.parse({
        ...result,
        clarifying_questions: questions,
        ambiguities,
        ready: questions.length === 0 && ambiguities.length === 0,
      });
    } catch (error) {
      if (error instanceof HandoffError) throw error;
      throw new HandoffError(
        502,
        "Could not refine the design plan. Your previous draft has been kept.",
        "ANALYSIS_FAILED",
      );
    }
  }
}
