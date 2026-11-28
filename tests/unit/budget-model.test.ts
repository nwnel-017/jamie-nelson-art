import { expect, it, vi } from "vitest";
import { createBudgetModel } from "../../server/services/design-budget.service";

it("unavailable budget storage prevents contacting the provider", async () => {
  vi.stubEnv("AI_DESIGN_BUDGET_USD", "5");
  const request = vi.fn();
  const model = createBudgetModel(
    {
      aiProvider: "responses",
      aiModel: "gpt-4.1-2025-04-14",
      aiApiKey: "fake",
      aiBaseUrl: "https://api.openai.com/v1",
    },
    { rpc: async () => ({ error: new Error("unavailable") }) } as never,
    "update",
    "owner",
    "analysis",
    request,
  );
  await expect(
    model.generate({
      systemPrompt: "JSON",
      instructions: "test",
      changeOptions: [],
    }),
  ).rejects.toMatchObject({ code: "BUDGET_STOP" });
  expect(request).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});
