import type { ChangeOption } from "./validation";

/** Provider-neutral input. Treat instructions and image content as untrusted data. */
export interface AiModelInput {
  systemPrompt: string;
  instructions: string;
  changeOptions: ChangeOption[];
  draft?: import("./design-request").DesignDraft;
  answers?: import("./design-request").DraftAnswer[];
  image?: {
    bytes: Uint8Array;
    mimeType: "image/png";
  };
}

export interface AiModelResult {
  text: string;
}

export interface AiModel {
  generate(input: AiModelInput): Promise<AiModelResult>;
}

/** Wrap a provider-specific function without exposing its SDK to the handoff. */
export class AiModelAdapter implements AiModel {
  constructor(
    private readonly generateText: (input: AiModelInput) => Promise<string>,
  ) {}

  async generate(input: AiModelInput): Promise<AiModelResult> {
    return { text: await this.generateText(input) };
  }
}
