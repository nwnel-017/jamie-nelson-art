import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chromium,
  expect as browserExpect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createApp,
  createRouter,
  defineEventHandler,
  setHeader,
  toNodeListener,
} from "h3";
import sharp from "sharp";
import type { Database } from "../../types/supabase/database";
import type {
  DesignRequest,
  DraftAnalysis,
} from "../../server/utils/agent/design-request";
import { serverSupabaseServiceRole } from "#supabase/server";
import { getCanvaVerifiers } from "../../server/utils/agent/canva";
import { downloadImage } from "../../server/utils/agent/handoff/image";
import { buildRequirementsBrowser } from "../helpers/requirements-browser.mjs";
import gather from "../../server/api/agent/gather-requirements/index.post";
import clarify from "../../server/api/agent/clarify-requirements/[id].post";

vi.mock("#supabase/server", () => ({ serverSupabaseServiceRole: vi.fn() }));
vi.mock("../../server/utils/agent/handoff/image", async (original) => ({
  ...(await original<
    typeof import("../../server/utils/agent/handoff/image")
  >()),
  downloadImage: vi.fn(),
}));
vi.mock("../../server/utils/agent/model-factory", () => ({
  createVerificationModel: () => ({
    generate: async () => {
      const response = responses.shift();
      if (!response) throw new Error("Unexpected model call");
      if (response instanceof Error) throw response;
      return { text: JSON.stringify(response) };
    },
  }),
}));

const owner = `requirements-e2e-${randomUUID()}`;
const initial: DraftAnalysis = {
  response: "Please clarify the page and color.",
  requirements: ["Update the portfolio layout"],
  ambiguities: ["The page and color are unspecified"],
  clarifying_questions: ["Which page?", "Which color?"],
  ready: false,
  plan: {
    steps: [
      { id: "step-1", action: "Update the portfolio layout", target: null },
    ],
  },
};
const followup: DraftAnalysis = {
  ...initial,
  response: "Please identify the exact page URL.",
  ambiguities: ["The page URL is unspecified"],
  clarifying_questions: ["Which exact URL?"],
};
const ready: DraftAnalysis = {
  ...initial,
  response: "The plan is ready for review.",
  ambiguities: [],
  clarifying_questions: [],
  ready: true,
  plan: {
    steps: [
      {
        id: "step-1",
        action: "Apply the blue layout to the gallery",
        target: "/artworks/gallery",
      },
    ],
  },
};
let responses: Array<DraftAnalysis | Error>;
let client: SupabaseClient<Database>;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let server: Server;
let output: string;
let baseUrl: string;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  if (
    !url ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Requirements browser tests require local SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  client = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  vi.mocked(serverSupabaseServiceRole).mockReturnValue(client);
  vi.mocked(downloadImage).mockResolvedValue(
    await sharp({
      create: { width: 2, height: 3, channels: 4, background: "blue" },
    })
      .png()
      .toBuffer(),
  );
  const verifiers = getCanvaVerifiers("requirements-e2e");
  vi.spyOn(verifiers.user, "verify").mockResolvedValue({
    appId: "requirements-e2e",
    userId: owner,
    brandId: "test-team",
  });
  vi.spyOn(verifiers.design, "verify").mockResolvedValue({
    appId: "requirements-e2e",
    designId: "test-design",
  });
  vi.stubGlobal("setHeader", setHeader);
  vi.stubGlobal("useRuntimeConfig", () => ({
    canvaAppId: "requirements-e2e",
    canvaAllowedUserIds: owner,
    canvaExportHosts: "export-download.canva.com",
    maxAnalyzeAttempts: 4,
  }));
  output = await mkdtemp(join(tmpdir(), "requirements-browser-"));
  await buildRequirementsBrowser(output);
  const app = createApp();
  const router = createRouter()
    .get(
      "/",
      defineEventHandler(
        () =>
          '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      ),
    )
    .post("/api/agent/gather-requirements", gather)
    .post("/api/agent/clarify-requirements/:id", clarify);
  for (const file of await readdir(output)) {
    if (!/\.(js|css)$/.test(file)) continue;
    router.get(
      `/${file}`,
      defineEventHandler(async (event) => {
        setHeader(
          event,
          "content-type",
          file.endsWith(".js") ? "text/javascript" : "text/css",
        );
        return readFile(join(output, file));
      }),
    );
  }
  app.use(router);
  server = createServer(toNodeListener(app));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
});

beforeEach(async () => {
  responses = [];
  context = await browser.newContext();
  context.setDefaultTimeout(10000);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  page = await context.newPage();
});
afterEach(async ({ task }) => {
  if (!context) return;
  try {
    if (task.result?.state === "fail") {
      await mkdir("test-results", { recursive: true });
      await context.tracing.stop({
        path: `test-results/requirements-${task.id}.zip`,
      });
    } else await context.tracing.stop();
  } finally {
    await context.close();
  }
});
afterAll(async () => {
  try {
    await browser?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (client) {
      const saved = await client
        .from("design_requests")
        .select("design_image")
        .eq("canva_user_id", owner);
      expect(saved.error).toBeNull();
      const removed = await client
        .from("design_requests")
        .delete()
        .eq("canva_user_id", owner);
      expect(removed.error).toBeNull();
      const paths = (saved.data ?? []).map(({ design_image }) =>
        new URL(design_image).pathname.split("/").pop()!,
      );
      if (paths.length)
        expect(
          (await client.storage.from("website_designs").remove(paths)).error,
        ).toBeNull();
    }
  } finally {
    if (output) await rm(output, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

async function submitDesign() {
  await page.goto(baseUrl);
  await page
    .getByText("Changes to one or more existing pages", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "AI agent's instructions" })
    .fill("Apply the exported layout to my portfolio.");
  const result = page.waitForResponse((response) =>
    response.url().endsWith("/api/agent/gather-requirements"),
  );
  await page.getByRole("button", { name: "Publish design" }).click();
  const response = await result;
  expect(response.status()).toBe(200);
  const { designRequest } = (await response.json()) as {
    designRequest: DesignRequest;
  };
  expect(designRequest.instructions).toBe(
    "Apply the exported layout to my portfolio.",
  );
  expect(designRequest.change_options).toEqual(["existing_pages"]);
  return designRequest;
}
async function answerQuestions(answers: Record<string, string>) {
  const questions = Object.entries(answers);
  for (const [index, [question, answer]] of questions.entries()) {
    await page
      .getByRole("textbox", { name: question, exact: true })
      .fill(answer);
    if (index < questions.length - 1)
      await page.getByRole("button", { name: "Next", exact: true }).click();
  }
}
async function submitAnswers(id: string) {
  const result = page.waitForResponse((response) =>
    response.url().endsWith(`/api/agent/clarify-requirements/${id}`),
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  return result;
}
async function expectReview() {
  const action = page.getByText(ready.plan.steps[0]!.action, { exact: true });
  await browserExpect(action).toBeVisible();
  await browserExpect(
    action.locator("..").getByText("/artworks/gallery", { exact: true }),
  ).toBeVisible();
  await browserExpect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeVisible();
}
async function history(id: string) {
  const result = await client
    .from("design_analyses")
    .select(
      "status, version, submission_id, answers, plan, clarifying_questions",
    )
    .eq("design_request_id", id)
    .order("started_at");
  expect(result.error).toBeNull();
  return result.data!;
}
function savedAnswers(request: DesignRequest, answers: Record<string, string>) {
  return request.draft!.clarifying_questions.map((q) => ({
    question_id: q.id,
    question: q.question,
    answer: answers[q.question],
  }));
}

test("gathering and two clarification rounds display the persisted review plan", async () => {
  responses = [initial, followup, ready];
  const request = await submitDesign();
  const answers = { "Which page?": "The gallery", "Which color?": "Blue" };
  const followupAnswers = { "Which exact URL?": "/artworks/gallery" };
  await answerQuestions(answers);
  const response = await submitAnswers(request.id);
  expect(response.status()).toBe(200);
  const { designRequest: next } = (await response.json()) as {
    designRequest: DesignRequest;
  };
  await browserExpect(
    page.getByRole("textbox", { name: "Which exact URL?" }),
  ).toHaveValue("");
  await browserExpect(
    page.getByRole("textbox", { name: "Which page?", exact: true }),
  ).toHaveCount(0);
  await answerQuestions(followupAnswers);
  expect((await submitAnswers(request.id)).status()).toBe(200);
  await expectReview();
  expect(await history(request.id)).toMatchObject([
    { status: "completed", version: 1, answers: [] },
    {
      status: "completed",
      version: 2,
      answers: savedAnswers(request, answers),
    },
    {
      status: "completed",
      version: 3,
      answers: [
        ...savedAnswers(request, answers),
        ...savedAnswers(next, followupAnswers),
      ],
      plan: ready.plan,
    },
  ]);
});

test("an initially ready analysis goes directly to review", async () => {
  responses = [ready];
  const request = await submitDesign();
  await expectReview();
  await browserExpect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toHaveCount(0);
  expect(await history(request.id)).toMatchObject([
    { status: "completed", version: 1, answers: [], plan: ready.plan },
  ]);
});

test("failed clarification preserves answers and the draft, then retries the same request with a new submission", async () => {
  responses = [initial, new Error("Simulated model failure"), ready];
  const request = await submitDesign();
  const answers = {
    "Which page?": "/artworks/gallery",
    "Which color?": "Blue",
  };
  await answerQuestions(answers);
  const failed = await submitAnswers(request.id);
  expect(failed.status()).toBe(502);
  expect((await failed.json()).data.code).toBe("ANALYSIS_FAILED");
  await browserExpect(
    page.getByText(
      "Could not refine the design plan. Your previous draft has been kept.",
      { exact: true },
    ),
  ).toBeVisible();
  await browserExpect(
    page.getByRole("textbox", { name: "Which color?" }),
  ).toHaveValue("Blue");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await browserExpect(
    page.getByRole("textbox", { name: "Which page?" }),
  ).toHaveValue("/artworks/gallery");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const beforeRetry = await history(request.id);
  expect(beforeRetry).toMatchObject([
    { status: "completed", version: 1, plan: initial.plan },
    { status: "failed", version: null },
  ]);
  expect((await submitAnswers(request.id)).status()).toBe(200);
  await expectReview();
  const afterRetry = await history(request.id);
  expect(afterRetry).toMatchObject([
    ...beforeRetry,
    {
      status: "completed",
      version: 2,
      answers: savedAnswers(request, answers),
      plan: ready.plan,
    },
  ]);
  expect(afterRetry[2]!.submission_id).not.toBe(afterRetry[1]!.submission_id);
});
