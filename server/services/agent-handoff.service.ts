import { VERIFICATION_SYSTEM_PROMPT } from "../utils/agent-handoff/prompts/verification";
import { HandoffError } from "../utils/agent-handoff/errors";
import {
  parseVerificationResult,
  type DesignRequest,
  type SaveDesignRequest,
} from "../utils/agent-handoff/design-request";
import type { AiModel } from "../utils/agent-handoff/ai-model";
import { parseHandoff } from "../utils/agent-handoff/validation";
import {
  verifyDesign,
  type CanvaVerifiers,
} from "../utils/agent-handoff/canva";
import { downloadImage, validatePng } from "../utils/agent-handoff/image";

export async function validateAgentHandoff(
  body: unknown,
  appId: string,
  exportHosts: string[],
  dependencies: {
    verifiers?: CanvaVerifiers;
    download?: typeof downloadImage;
  } = {},
) {
  const handoff = parseHandoff(body); // validates instructions
  const { file } = handoff;
  await verifyDesign(
    file.contentMetadata.designToken,
    appId,
    dependencies.verifiers,
  );
  const bytes = await (dependencies.download ?? downloadImage)(
    file.url,
    exportHosts,
  );
  await validatePng(bytes, file);
  return { instructions: handoff.instructions, file, bytes };
}

export type ValidatedHandoff = Awaited<ReturnType<typeof validateAgentHandoff>>;

export async function generateDesignRequest(
  handoff: ValidatedHandoff,
  dependencies: { model?: AiModel; save?: SaveDesignRequest } = {},
): Promise<DesignRequest> {
  if (!dependencies.model)
    throw new HandoffError(503, "Design verification is not configured yet.");
  if (!dependencies.save)
    throw new HandoffError(503, "Design request storage is not configured.");
  let text: string;
  try {
    ({ text } = await dependencies.model.generate({
      systemPrompt: VERIFICATION_SYSTEM_PROMPT,
      instructions: handoff.instructions,
      image: { bytes: handoff.bytes, mimeType: "image/png" },
    }));
  } catch {
    throw new HandoffError(
      502,
      "Could not verify the design. Please try again.",
    );
  }
  const verification = parseVerificationResult(text);
  return dependencies.save({
    design_image: handoff.file.url,
    instructions: handoff.instructions,
    ...verification,
  });
}
