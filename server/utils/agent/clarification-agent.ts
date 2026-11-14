import type { AiModel, AiModelInput } from "./ai-model";
import { draftAnalysisSchema, type DraftAnalysis } from "./design-request";
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
      return draftAnalysisSchema.parse(JSON.parse(text));
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
