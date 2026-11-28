import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase/database";
import {
  budgetAction,
  createBudgetModel,
} from "../../server/services/design-budget.service";
import {
  getRequestWithDraft,
  reserveAnalysis,
  finishAnalysis,
} from "../../server/services/design-drafts.service";
import { createTestModel } from "../../server/utils/agent/test-model";
import { VerificationAgent } from "../../server/utils/agent/verification-agent";
import { initialDraftAnalysis } from "../../server/utils/agent/draft-analysis";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp, createRouter, toNodeListener } from "h3";
import clarify from "../../server/api/agent/clarify-requirements/[id].post";
import { serverSupabaseServiceRole } from "#supabase/server";
import { getCanvaVerifiers } from "../../server/utils/agent/canva";

vi.mock("#supabase/server", () => ({ serverSupabaseServiceRole: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const config = {
  aiProvider: "responses",
  aiModel: "gpt-4.1-2025-04-14",
  aiApiKey: "fake",
  aiBaseUrl: "https://api.openai.com/v1",
};
const input = {
  systemPrompt: "Return JSON",
  instructions: "Update gallery",
  changeOptions: [],
};
function client() {
  const url = process.env.BUDGET_POSTGREST_URL ?? process.env.SUPABASE_URL!;
  expect(["127.0.0.1", "localhost"]).toContain(new URL(url).hostname);
  const transport = fetch;
  return createClient<Database>(
    url,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fake",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) => {
          if (!process.env.BUDGET_POSTGREST_URL) return transport(url, init);
          const headers = new Headers(init?.headers);
          headers.delete("authorization");
          return transport(String(url).replace("/rest/v1/", "/"), {
            ...init,
            headers,
          });
        },
      },
    },
  );
}
async function update(db: ReturnType<typeof client>) {
  const id = randomUUID();
  const { error } = await db
    .from("design_requests")
    .insert({
      id,
      canva_user_id: "budget-owner",
      instructions: "Update gallery",
      design_image: "https://example.com/image.png",
      requirements: [],
      ambiguities: [],
      clarifying_questions: [],
    });
  expect(error).toBeNull();
  return id;
}
function provider(
  text = "{}",
  usage: unknown = {
    input_tokens: 1000,
    output_tokens: 100,
    total_tokens: 1100,
    input_tokens_details: { cached_tokens: 500 },
  },
) {
  return new Response(
    JSON.stringify({
      id: "resp_fake",
      model: config.aiModel,
      service_tier: "default",
      status: "completed",
      usage,
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
    }),
  );
}

it("bounds sequential calls, rejects overlap and foreign owners, and retains unknown holds across clients", async () => {
  vi.stubEnv("AI_DESIGN_BUDGET_USD", "2.1");
  const db = client();
  const id = await update(db);
  const other = await update(db);
  const caps: number[] = [];
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const fake: typeof fetch = async (_url, init) => {
    caps.push(JSON.parse(String(init?.body)).max_output_tokens);
    entered();
    await gate;
    return provider();
  };
  try {
    const pending = createBudgetModel(
      config,
      db,
      id,
      "budget-owner",
      "analysis",
      fake,
    ).generate(input);
    await started;
    await expect(
      createBudgetModel(
        config,
        client(),
        id,
        "budget-owner",
        "analysis",
        fake,
      ).generate(input),
    ).rejects.toMatchObject({ code: "BUDGET_IN_PROGRESS" });
    await expect(
      createBudgetModel(
        config,
        client(),
        id,
        "foreign-owner",
        "analysis",
        fake,
      ).generate(input),
    ).rejects.toMatchObject({ statusCode: 404 });
    await createBudgetModel(
      config,
      client(),
      other,
      "budget-owner",
      "analysis",
      async () => provider(),
    ).generate(input);
    release();
    await pending;
    expect(caps).toEqual([606]);
    const saved = await budgetAction(client(), id, "budget-owner", "inspect");
    expect(saved).toMatchObject({
      status: "running",
      spent_nano: 2050000,
      reservation: null,
      stages: {
        analysis: {
          input_tokens: 1000,
          cached_tokens: 500,
          output_tokens: 100,
          spent_nano: 2050000,
        },
      },
    });
    expect(
      await budgetAction(db, id, "budget-owner", "settle", {
        request_id: "stale",
        input_tokens: 1,
        cached_tokens: 0,
        output_tokens: 1,
      }),
    ).toMatchObject({ state: "stale" });
    await expect(
      createBudgetModel(
        config,
        client(),
        id,
        "budget-owner",
        "clarification",
        async (_url, init) => {
          caps.push(JSON.parse(String(init?.body)).max_output_tokens);
          return provider("{}", null);
        },
      ).generate(input),
    ).rejects.toMatchObject({ code: "BUDGET_STOP" });
    expect(caps).toEqual([606, 349]);
    const stopped = await budgetAction(client(), id, "budget-owner", "inspect");
    expect(stopped).toMatchObject({
      status: "stopped",
      stop_reason: "unknown_usage",
      spent_nano: 2050000,
      reservation: { stage: "clarification", amount_nano: 2097944000 },
    });
    const noCall = vi.fn();
    await expect(
      createBudgetModel(
        config,
        client(),
        id,
        "budget-owner",
        "analysis",
        noCall,
      ).generate(input),
    ).rejects.toMatchObject({ code: "BUDGET_STOP" });
    expect(noCall).not.toHaveBeenCalled();
  } finally {
    release();
    await db.from("design_requests").delete().in("id", [id, other]);
  }
});

it.each(["success", "stop"])(
  "authenticated clarification %s keeps the same analysis budget and draft history",
  async (outcome) => {
    vi.stubEnv("AI_DESIGN_BUDGET_USD", "5");
    const db = client();
    const id = await update(db);
    const submissionId = randomUUID();
    await reserveAnalysis(db, {
      requestId: id,
      userId: "budget-owner",
      submissionId,
      baseVersion: 0,
      payloadHash: "seed",
      limit: 4,
    });
    const initialText = await createTestModel().generate(input);
    const result = await new VerificationAgent(
      createBudgetModel(config, db, id, "budget-owner", "analysis", async () =>
        provider(initialText.text),
      ),
    ).run(input);
    const saved = await finishAnalysis(db, {
      requestId: id,
      userId: "budget-owner",
      submissionId,
      analysis: initialDraftAnalysis(result),
      answers: [],
      limit: 4,
    });
    vi.mocked(serverSupabaseServiceRole).mockReturnValue(db);
    vi.spyOn(getCanvaVerifiers("budget-app").user, "verify").mockResolvedValue({
      appId: "budget-app",
      userId: "budget-owner",
      brandId: "test",
    });
    vi.stubGlobal("setHeader", () => {});
    vi.stubGlobal("useRuntimeConfig", () => ({
      ...config,
      canvaAppId: "budget-app",
      canvaAllowedUserIds: "budget-owner",
      maxAnalyzeAttempts: 4,
    }));
    vi.stubEnv("AI_DESIGN_BUDGET_USD", outcome === "stop" ? "0.01" : "5");
    const transport = fetch;
    vi.stubGlobal(
      "fetch",
      async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        if (String(url) !== "https://api.openai.com/v1/responses")
          return transport(url, init);
        const payload = JSON.parse(String(init?.body));
        const data = JSON.parse(payload.input[0].content[0].text);
        const text = await createTestModel().generate({
          ...input,
          draft: data.design_draft,
          answers: data.user_answers,
        });
        return provider(text.text);
      },
    );
    const app = createApp();
    app.use(createRouter().post("/clarify/:id", clarify));
    const server = createServer(toNodeListener(app));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test server");
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/clarify/${id}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer fake.user.token",
          },
          body: JSON.stringify({
            submission_id: randomUUID(),
            draft_version: 1,
            answers: saved.draft!.clarifying_questions.map((q) => ({
              question_id: q.id,
              answer: "/gallery",
            })),
          }),
        },
      );
      const reloaded = await getRequestWithDraft(client(), id, "budget-owner");
      if (outcome === "stop") {
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
          statusMessage: expect.stringContaining("Contact the developer"),
          data: { code: "BUDGET_STOP" },
        });
        expect(reloaded.budget_status).toBe("stopped");
        expect(reloaded.draft).toEqual(saved.draft);
      } else {
        expect(response.status).toBe(200);
        expect(reloaded.draft_version).toBe(2);
        expect(
          await budgetAction(client(), id, "budget-owner", "inspect"),
        ).toMatchObject({
          spent_nano: 4100000,
          reservation: null,
          stages: {
            analysis: { spent_nano: 2050000 },
            clarification: { spent_nano: 2050000 },
          },
        });
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.from("design_requests").delete().eq("id", id);
    }
  },
);

it("settles exact exhaustion and authoritative incomplete output without another inference", async () => {
  vi.stubEnv("AI_DESIGN_BUDGET_USD", "2.1");
  const db = client();
  const id = await update(db);
  try {
    await expect(
      createBudgetModel(
        config,
        db,
        id,
        "budget-owner",
        "analysis",
        async () => {
          const result = await provider("{}", {
            input_tokens: 1047576,
            output_tokens: 606,
            total_tokens: 1048182,
            input_tokens_details: { cached_tokens: 0 },
          }).json();
          return new Response(
            JSON.stringify({ ...result, status: "incomplete" }),
          );
        },
      ).generate(input),
    ).rejects.toMatchObject({ code: "ANALYSIS_FAILED" });
    expect(
      await budgetAction(client(), id, "budget-owner", "inspect"),
    ).toMatchObject({ spent_nano: 2100000000, reservation: null });
    const fake = vi.fn();
    await expect(
      createBudgetModel(
        config,
        client(),
        id,
        "budget-owner",
        "clarification",
        fake,
      ).generate(input),
    ).rejects.toMatchObject({ code: "BUDGET_STOP" });
    expect(fake).not.toHaveBeenCalled();
    expect(
      await budgetAction(client(), id, "budget-owner", "inspect"),
    ).toMatchObject({ status: "stopped", stop_reason: "insufficient_funds" });
  } finally {
    await db.from("design_requests").delete().eq("id", id);
  }
});

it.each([
  ["5xx", async () => new Response("upstream failed", { status: 503 })],
  [
    "redirect",
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://untrusted.test" },
      }),
  ],
  [
    "disconnect",
    async () => {
      throw new TypeError("connection lost");
    },
  ],
  ["malformed usage", async () => provider("{}", { input_tokens: -1 })],
  [
    "out-of-bound usage",
    async () =>
      provider("{}", {
        input_tokens: 1047577,
        output_tokens: 1,
        total_tokens: 1047578,
        input_tokens_details: { cached_tokens: 0 },
      }),
  ],
] as const)(
  "retains the full hold after %s and never retries inference",
  async (_name, fake) => {
    vi.stubEnv("AI_DESIGN_BUDGET_USD", "5");
    const db = client();
    const id = await update(db);
    const inference = vi.fn(fake);
    try {
      await expect(
        createBudgetModel(
          config,
          db,
          id,
          "budget-owner",
          "analysis",
          inference,
        ).generate(input),
      ).rejects.toMatchObject({ code: "BUDGET_STOP" });
      expect(inference).toHaveBeenCalledTimes(1);
      expect(
        await budgetAction(client(), id, "budget-owner", "inspect"),
      ).toMatchObject({
        status: "stopped",
        spent_nano: 0,
        reservation: { amount_nano: 2160688000 },
      });
    } finally {
      await db.from("design_requests").delete().eq("id", id);
    }
  },
);

it.each(["", "0", "-1", "NaN", "0.0000000001"])(
  "invalid allowance %s stops before inference",
  async (value) => {
    vi.stubEnv("AI_DESIGN_BUDGET_USD", value);
    const db = client();
    const id = await update(db);
    const fake = vi.fn();
    try {
      await expect(
        createBudgetModel(
          config,
          db,
          id,
          "budget-owner",
          "analysis",
          fake,
        ).generate(input),
      ).rejects.toMatchObject({ code: "BUDGET_STOP" });
      expect(fake).not.toHaveBeenCalled();
      expect(
        await budgetAction(client(), id, "budget-owner", "inspect"),
      ).toMatchObject({
        status: "stopped",
        stop_reason: "invalid_configuration",
        reservation: null,
      });
    } finally {
      await db.from("design_requests").delete().eq("id", id);
    }
  },
);

it("unknown model pricing stops the owned update before inference", async () => {
  vi.stubEnv("AI_DESIGN_BUDGET_USD", "5");
  const db = client();
  const id = await update(db);
  const fake = vi.fn();
  try {
    await expect(
      createBudgetModel(
        { ...config, aiModel: "unknown" },
        db,
        id,
        "budget-owner",
        "analysis",
        fake,
      ).generate(input),
    ).rejects.toMatchObject({ code: "BUDGET_STOP" });
    expect(fake).not.toHaveBeenCalled();
    expect(
      await budgetAction(client(), id, "budget-owner", "inspect"),
    ).toMatchObject({
      status: "stopped",
      stop_reason: "unsupported_provider",
      reservation: null,
    });
  } finally {
    await db.from("design_requests").delete().eq("id", id);
  }
});
