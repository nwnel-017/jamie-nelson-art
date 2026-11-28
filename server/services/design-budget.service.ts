import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "#types/supabase/database";
import type { AiModel } from "@server/utils/agent/ai-model";
import type { VerificationModelConfig } from "@server/utils/agent/model-factory";
import { HandoffError } from "@server/utils/agent/errors";

export const budgetStopMessage =
  "Design update stopped because its spending allowance is exhausted or uncertain. Your progress has been kept. Contact the developer.";
export function budgetStop() {
  return new HandoffError(422, budgetStopMessage, "BUDGET_STOP");
}

export async function budgetAction(
  client: SupabaseClient<Database>,
  id: string,
  owner: string,
  action: string,
  payload: Json = {},
) {
  let result;
  try {
    result = await client.rpc("design_budget_action", {
      p_id: id,
      p_owner: owner,
      p_action: action,
      p_payload: payload,
    });
  } catch {
    throw budgetStop();
  }
  const { data, error } = result;
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw budgetStop();
  if (data.state === "not_found")
    throw new HandoffError(404, "Design request not found.");
  if (data.state === "busy")
    throw new HandoffError(
      409,
      "A budgeted call is unresolved. Contact the developer if it does not finish.",
      "BUDGET_IN_PROGRESS",
    );
  return data;
}

function allowance() {
  const value = process.env.AI_DESIGN_BUDGET_USD ?? "";
  if (!/^\d+(\.\d{1,9})?$/.test(value)) return 0;
  const [whole, fraction = ""] = value.split(".");
  const units = Number(whole) * 1e9 + Number(fraction.padEnd(9, "0"));
  return Number.isSafeInteger(units) && units > 0 ? units : 0;
}

export function createBudgetModel(
  config: VerificationModelConfig,
  client: SupabaseClient<Database>,
  id: string,
  owner: string,
  stage: "analysis" | "clarification",
  request: typeof fetch = fetch,
): AiModel {
  return {
    generate: async (input) => {
      // Only this closed request shape has reviewed prices and a context bound.
      const supported =
        config.aiProvider === "responses" &&
        config.aiModel === "gpt-4.1-2025-04-14" &&
        config.aiBaseUrl.replace(/\/$/, "") === "https://api.openai.com/v1" &&
        !!config.aiApiKey.trim();
      const limit = allowance();
      if (!supported || !limit) {
        await budgetAction(client, id, owner, "stop", {
          reason: !limit ? "invalid_configuration" : "unsupported_provider",
        });
        throw budgetStop();
      }
      const requestId = randomUUID();
      const admitted = await budgetAction(client, id, owner, "reserve", {
        allowance: limit,
        request_id: requestId,
        stage,
      });
      if (admitted.state !== "reserved") throw budgetStop();
      const cap = Number(admitted.max_output_tokens);
      try {
        const content = [
          {
            type: "input_text",
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
          ...(input.images ?? []).flatMap((image) => [
            {
              type: "input_text",
              text: JSON.stringify({
                image_id: image.id,
                question_id: image.question_id,
                filename: image.filename,
              }),
            },
            { type: "input_image", image_url: image.url, detail: "high" },
          ]),
          ...(input.image
            ? [
                {
                  type: "input_image",
                  image_url: `data:${input.image.mimeType};base64,${Buffer.from(input.image.bytes).toString("base64")}`,
                  detail: "high",
                },
              ]
            : []),
        ];
        const response = await request("https://api.openai.com/v1/responses", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(45_000),
          headers: {
            Authorization: `Bearer ${config.aiApiKey}`,
            "Content-Type": "application/json",
            "X-Client-Request-Id": requestId,
          },
          body: JSON.stringify({
            model: config.aiModel,
            instructions: input.systemPrompt,
            input: [{ role: "user", content }],
            service_tier: "default",
            max_output_tokens: cap,
            store: false,
            stream: false,
            tools: [],
            truncation: "disabled",
            text: { format: { type: "json_object" } },
          }),
        });
        if (!response.ok) throw new Error("Unknown upstream usage");
        const result = await response.json();
        const usage = result.usage;
        const valid =
          result.model === config.aiModel &&
          result.service_tier === "default" &&
          typeof result.id === "string" &&
          ["completed", "incomplete", "failed"].includes(result.status) &&
          usage &&
          [
            usage.input_tokens,
            usage.output_tokens,
            usage.total_tokens,
            usage.input_tokens_details?.cached_tokens,
          ].every((n) => Number.isSafeInteger(n) && n >= 0) &&
          usage.total_tokens === usage.input_tokens + usage.output_tokens &&
          (usage.output_tokens_details?.reasoning_tokens === undefined ||
            (Number.isSafeInteger(
              usage.output_tokens_details.reasoning_tokens,
            ) &&
              usage.output_tokens_details.reasoning_tokens >= 0 &&
              usage.output_tokens_details.reasoning_tokens <=
                usage.output_tokens));
        if (!valid) throw new Error("Unknown upstream usage");
        const settled = await budgetAction(client, id, owner, "settle", {
          request_id: requestId,
          input_tokens: usage.input_tokens,
          cached_tokens: usage.input_tokens_details.cached_tokens,
          output_tokens: usage.output_tokens,
        });
        if (settled.state !== "settled") throw new Error("Unsettled usage");
        if (result.status !== "completed")
          throw new HandoffError(
            502,
            "The analysis did not finish. Your draft has been kept.",
            "ANALYSIS_FAILED",
          );
        const output = z
          .array(
            z.object({
              type: z.string(),
              content: z
                .array(
                  z.object({ type: z.string(), text: z.string().optional() }),
                )
                .optional(),
            }),
          )
          .safeParse(result.output);
        const text = output.success
          ? output.data
              .filter((item) => item.type === "message")
              .flatMap((item) => item.content ?? [])
              .filter((item) => item.type === "output_text")
              .map((item) => item.text ?? "")
              .join("")
          : "";
        if (!text)
          throw new HandoffError(
            502,
            "The analysis returned no text.",
            "ANALYSIS_FAILED",
          );
        return { text };
      } catch (error) {
        if (error instanceof HandoffError && error.code === "ANALYSIS_FAILED")
          throw error;
        await budgetAction(client, id, owner, "uncertain", {
          request_id: requestId,
        });
        throw budgetStop();
      }
    },
  };
}
