import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
import { createApp, createRouter, setHeader, toNodeListener } from "h3";
import sharp from "sharp";
import type { Database } from "../types/supabase/database";
import type { DesignRequest } from "../server/utils/agent/design-request";
import { serverSupabaseServiceRole } from "#supabase/server";
import { getCanvaVerifiers } from "../server/utils/agent/canva";
import { downloadImage } from "../server/utils/agent/handoff/image";
import gather from "../server/api/agent/gather-requirements/index.post";
import clarify from "../server/api/agent/clarify-requirements/[id].post";

vi.mock("#supabase/server", () => ({ serverSupabaseServiceRole: vi.fn() }));
vi.mock("../server/utils/agent/handoff/image", async (original) => ({
  ...(await original<typeof import("../server/utils/agent/handoff/image")>()),
  downloadImage: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("submits a design and clarifies it into a persisted ready plan", async () => {
  const url = process.env.SUPABASE_URL!;
  expect(["localhost", "127.0.0.1"]).toContain(new URL(url).hostname);
  const client = createClient<Database>(
    url,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const id = randomUUID();
  const userId = `workflow-${id}`;
  const appId = "workflow-test";
  const png = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  vi.mocked(serverSupabaseServiceRole).mockReturnValue(client);
  vi.mocked(downloadImage).mockResolvedValue(png);
  const verifiers = getCanvaVerifiers(appId);
  vi.spyOn(verifiers.user, "verify").mockResolvedValue({
    appId,
    userId,
    brandId: "test-team",
  });
  vi.spyOn(verifiers.design, "verify").mockResolvedValue({
    appId,
    designId: "test-design",
  });
  vi.stubGlobal("setHeader", setHeader);
  vi.stubGlobal("useRuntimeConfig", () => ({
    canvaAppId: appId,
    canvaAllowedUserIds: userId,
    canvaExportHosts: "export-download.canva.com",
    aiProvider: "test",
    maxAnalyzeAttempts: 4,
  }));
  const app = createApp();
  app.use(
    createRouter()
      .post("/api/agent/gather-requirements", gather)
      .post("/api/agent/clarify-requirements/:id", clarify),
  );
  const server = createServer(toNodeListener(app));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test server address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test.user.token",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    return result as {
      designRequest: DesignRequest;
      ready: boolean;
      draft_version: number;
    };
  };
  try {
    const initial = await post("/api/agent/gather-requirements", {
      submission_id: id,
      source: "canva",
      instructions: "Apply this design to my portfolio.",
      changeOptions: ["existing_pages"],
      outputMedia: [
        {
          mediaSlotId: "media",
          files: [
            {
              format: "png",
              url: "https://export-download.canva.com/test.png",
              widthPx: 2,
              heightPx: 3,
              contentMetadata: {
                type: "design",
                designToken: "test.design.token",
                pages: [{ pageNumber: 1 }],
              },
            },
          ],
        },
      ],
    });
    expect(initial.ready).toBe(false);
    expect(initial.draft_version).toBe(1);
    const questions = initial.designRequest.draft!.clarifying_questions;
    expect(questions.length).toBeGreaterThan(0);
    const image = await fetch(initial.designRequest.design_image);
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png);

    const answers = questions.map((q, index) => ({
      question_id: q.id,
      answer:
        index === 0
          ? "/artworks/gallery"
          : "Keep existing content and apply the design layout.",
    }));
    const final = await post(
      `/api/agent/clarify-requirements/${initial.designRequest.id}`,
      {
        draft_version: initial.draft_version,
        submission_id: randomUUID(),
        answers,
      },
    );
    expect(final.ready).toBe(true);
    expect(final.draft_version).toBe(2);
    expect(final.designRequest.clarifying_questions).toEqual([]);
    expect(final.designRequest.plan!.steps[0]!.target).toBe(
      "/artworks/gallery",
    );
    const history = await client
      .from("design_analyses")
      .select("version, ready, answers, plan")
      .eq("design_request_id", id)
      .order("version");
    expect(history.error).toBeNull();
    expect(history.data).toEqual([
      {
        version: 1,
        ready: false,
        answers: [],
        plan: initial.designRequest.plan,
      },
      {
        version: 2,
        ready: true,
        plan: final.designRequest.plan,
        answers: answers.map((answer, i) => ({
          ...answer,
          question: questions[i]!.question,
        })),
      },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    const saved = await client
      .from("design_requests")
      .select("design_image")
      .eq("id", id)
      .eq("canva_user_id", userId)
      .maybeSingle();
    expect(saved.error).toBeNull();
    const removed = await client
      .from("design_requests")
      .delete()
      .eq("id", id)
      .eq("canva_user_id", userId);
    expect(removed.error).toBeNull();
    if (saved.data) {
      const path = new URL(saved.data.design_image).pathname.split("/").pop()!;
      const image = await client.storage.from("website_designs").remove([path]);
      expect(image.error).toBeNull();
    }
  }
});
