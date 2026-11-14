import type { AiModel, AiModelInput } from "./ai-model";
import {
  parseVerificationResult,
  type VerificationResult,
} from "./design-request";
import { HandoffError } from "./errors";
import { VERIFICATION_SYSTEM_PROMPT } from "./prompts/verification";

export type VerificationInput = Omit<AiModelInput, "systemPrompt">;

/** Analyzes a validated request; persistence is handled by the handoff service. */
export class VerificationAgent {
  constructor(private readonly model: AiModel) {}

  async run(input: VerificationInput): Promise<VerificationResult> {
    let text: string;
    try {
      ({ text } = await this.model.generate({
        systemPrompt: VERIFICATION_SYSTEM_PROMPT,
        instructions: input.instructions,
        changeOptions: input.changeOptions,
        image: input.image,
      }));
    } catch (error) {
      if (error instanceof HandoffError) throw error;
      throw new HandoffError(
        502,
        "Could not verify the design. Please try again.",
      );
    }
    return parseVerificationResult(text);
  }
}
