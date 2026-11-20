import { test as base, expect, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DesignRequest,
  DraftAnalysis,
} from "../../server/utils/agent/design-request";
import type { RequirementsServer } from "../helpers/requirements-server";
import { buildRequirementsHarness } from "../helpers/requirements-browser.mjs";

const test = base.extend<{ app: RequirementsServer }>({
  app: async ({ page }, use) => {
    const output = await mkdtemp(join(tmpdir(), "requirements-browser-"));
    let app: RequirementsServer | undefined;
    try {
      await buildRequirementsHarness(output);
      const { startRequirementsServer } = (await import(
        pathToFileURL(join(output, "server.mjs")).href
      )) as typeof import("../helpers/requirements-server");
      app = await startRequirementsServer(output);
      await page.goto(app.url);
      await use(app);
    } finally {
      try {
        await app?.close();
      } finally {
        await rm(output, { recursive: true, force: true });
      }
    }
  },
});

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
async function submitDesign(page: Page) {
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
async function answerQuestions(page: Page, answers: Record<string, string>) {
  const questions = Object.entries(answers);
  for (const [index, [question, answer]] of questions.entries()) {
    await page
      .getByRole("textbox", { name: question, exact: true })
      .fill(answer);
    if (index < questions.length - 1)
      await page.getByRole("button", { name: "Next", exact: true }).click();
  }
}
async function submitAnswers(page: Page, id: string) {
  const result = page.waitForResponse((response) =>
    response.url().endsWith(`/api/agent/clarify-requirements/${id}`),
  );
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  return result;
}
async function expectReview(page: Page) {
  const action = page.getByText(ready.plan.steps[0]!.action, { exact: true });
  await expect(action).toBeVisible();
  await expect(
    action.locator("..").getByText("/artworks/gallery", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeVisible();
}
async function history(app: RequirementsServer, id: string) {
  const result = await app.client
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

test("gathering and two clarification rounds display the persisted review plan", async ({
  page,
  app,
}) => {
  app.setResponses([initial, followup, ready]);
  const request = await submitDesign(page);
  const answers = { "Which page?": "The gallery", "Which color?": "Blue" };
  const followupAnswers = { "Which exact URL?": "/artworks/gallery" };
  await answerQuestions(page, answers);
  const response = await submitAnswers(page, request.id);
  expect(response.status()).toBe(200);
  const { designRequest: next } = (await response.json()) as {
    designRequest: DesignRequest;
  };
  await expect(
    page.getByRole("textbox", { name: "Which exact URL?" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("textbox", { name: "Which page?", exact: true }),
  ).toHaveCount(0);
  await answerQuestions(page, followupAnswers);
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expectReview(page);
  expect(await history(app, request.id)).toMatchObject([
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

test("an initially ready analysis goes directly to review", async ({
  page,
  app,
}) => {
  app.setResponses([ready]);
  const request = await submitDesign(page);
  await expectReview(page);
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toHaveCount(0);
  expect(await history(app, request.id)).toMatchObject([
    { status: "completed", version: 1, answers: [], plan: ready.plan },
  ]);
});

test("failed clarification preserves answers and the draft, then retries the same request with a new submission", async ({
  page,
  app,
}) => {
  app.setResponses([initial, new Error("Simulated model failure"), ready]);
  const request = await submitDesign(page);
  const answers = {
    "Which page?": "/artworks/gallery",
    "Which color?": "Blue",
  };
  await answerQuestions(page, answers);
  const failed = await submitAnswers(page, request.id);
  expect(failed.status()).toBe(502);
  expect((await failed.json()).data.code).toBe("ANALYSIS_FAILED");
  await expect(
    page.getByText(
      "Could not refine the design plan. Your previous draft has been kept.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Which color?" })).toHaveValue(
    "Blue",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Which page?" })).toHaveValue(
    "/artworks/gallery",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const beforeRetry = await history(app, request.id);
  expect(beforeRetry).toMatchObject([
    { status: "completed", version: 1, plan: initial.plan },
    { status: "failed", version: null },
  ]);
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expectReview(page);
  const afterRetry = await history(app, request.id);
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
