import type { AiModel } from "./ai-model";
import { createChatCompletionModel } from "./chat-completion-model";
import { HandoffError } from "./errors";
import { createTestModel } from "./test-model";

export interface VerificationModelConfig {
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl: string;
}

export function createVerificationModel(
  config: VerificationModelConfig,
): AiModel {
  switch (config.aiProvider) {
    case "test":
      return createTestModel();
    case "chat-completions":
      return createChatCompletionModel({
        apiKey: config.aiApiKey,
        model: config.aiModel,
        baseUrl: config.aiBaseUrl,
      });
    default:
      throw new HandoffError(
        503,
        "Configure a supported AI provider: test or chat-completions.",
      );
  }
}
