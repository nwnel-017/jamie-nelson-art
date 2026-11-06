import { z } from "zod";
import { AiModelAdapter, type AiModel } from "./ai-model";
import { HandoffError } from "./errors";

interface ChatCompletionConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

const completion = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({
          content: z
            .string()
            .min(1)
            .max(64 * 1024),
          refusal: z.null().optional(),
        }),
      }),
    )
    .min(1),
});

/** OpenAI-compatible transport; the verification agent remains provider-neutral. */
export function createChatCompletionModel(
  config: ChatCompletionConfig,
  request: typeof fetch = fetch,
): AiModel {
  if (!config.apiKey.trim() || !config.model.trim())
    throw new HandoffError(
      503,
      "Configure the AI API key and model before verifying designs.",
    );
  let endpoint: URL;
  try {
    endpoint = new URL(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error();
  } catch {
    throw new HandoffError(503, "The AI API URL is not configured correctly.");
  }
  return new AiModelAdapter(async (input) => {
    const signal = AbortSignal.timeout(45_000);
    try {
      const response = await request(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          response_format: { type: "json_object" },
          max_completion_tokens: 8192,
          messages: [
            { role: "system", content: input.systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    instructions: input.instructions,
                    changeOptions: input.changeOptions,
                    ...(input.draft
                      ? {
                          design_draft: input.draft,
                          user_answers: input.answers ?? [],
                        }
                      : {}),
                  }),
                },
                ...(input.image
                  ? [
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:${input.image.mimeType};base64,${Buffer.from(input.image.bytes).toString("base64")}`,
                        },
                      },
                    ]
                  : []),
              ],
            },
          ],
        }),
        signal,
      });
      if (!response.ok) throw new Error();
      const result = completion.parse(await response.json());
      return result.choices[0]!.message.content;
    } catch {
      if (signal.aborted)
        throw new HandoffError(
          504,
          "Design verification timed out. Please try again.",
        );
      throw new HandoffError(
        502,
        "Could not verify the design. Please try again.",
      );
    }
  });
}
