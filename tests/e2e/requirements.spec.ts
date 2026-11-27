import sharp from "sharp";
import { test as base, expect, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DesignRequest,
  DraftAnalysis,
  DesignImage,
} from "../../server/utils/agent/design-request";
import type { RequirementsServer } from "../helpers/requirements-server";
import { buildRequirementsHarness } from "../helpers/requirements-browser.mjs";

const test = base.extend<{ app: RequirementsServer }, { harness: string }>({
  harness: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixtures.
    async ({}, use) => {
      const output = await mkdtemp(join(tmpdir(), "requirements-browser-"));
      try {
        await buildRequirementsHarness(output);
        await use(output);
      } finally {
        await rm(output, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],
  app: async ({ page, harness }, use) => {
    const { startRequirementsServer } = (await import(
      pathToFileURL(join(harness, "server.mjs")).href
    )) as typeof import("../helpers/requirements-server");
    const app = await startRequirementsServer(harness);
    try {
      await page.goto(app.url);
      await use(app);
    } finally {
      await app.close();
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

test("approving the reviewed plan queues its persisted draft for implementation", async ({
  page,
  app,
}) => {
  app.setResponses([initial, ready]);
  const request = await submitDesign(page);
  await answerQuestions(page, {
    "Which page?": "/artworks/gallery",
    "Which color?": "Blue",
  });
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expectReview(page);
  const result = page.waitForResponse((response) =>
    response.url().endsWith(`/api/agent/execute/${request.id}`),
  );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const response = await result;
  expect(response.status()).toBe(202);
  const approval = await response.json();
  await expect(
    page.getByText(/Your agent is working to update your site/),
  ).toBeVisible();
  const draft = await app.client
    .from("design_analyses")
    .select("id")
    .eq("design_request_id", request.id)
    .eq("version", 2)
    .single();
  expect(draft.error).toBeNull();
  const jobs = await app.client
    .from("technical_design_jobs")
    .select("*")
    .eq("design_request_id", request.id);
  expect(jobs.error).toBeNull();
  expect(jobs.data).toHaveLength(1);
  expect(jobs.data![0]).toMatchObject({
    id: approval.jobId,
    design_analysis_id: draft.data!.id,
    repository_sha: "a".repeat(40),
    github_run_id: "123",
    status: "queued",
  });
  expect(app.dispatches).toEqual([
    {
      ref: "master",
      inputs: {
        job_id: approval.jobId,
        design_id: request.id,
        base_branch: "master",
      },
    },
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

const imageInitial: DraftAnalysis = {
  ...initial,
  response: "Please supply the logo for the design.",
  ambiguities: ["The exact logo is required"],
  clarifying_questions: [{ type: "image", question: "Upload the logo" }],
};
async function uploadImage(page: Page, requestId: string, filename: string) {
  const bytes = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "blue" },
  })
    .png()
    .toBuffer();
  const result = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/agent/images/${requestId}`,
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: filename, mimeType: "image/png", buffer: bytes });
  const response = await result;
  expect(response.status()).toBe(200);
  const { image } = (await response.json()) as { image: DesignImage };
  await expect(page.getByText(filename, { exact: true })).toBeVisible();
  return { image, bytes };
}

test("required images can be uploaded and replaced with an optional note", async ({
  page,
  app,
}) => {
  app.setResponses([imageInitial, ready]);
  const request = await submitDesign(page);
  await expect(page.getByText(/publicly accessible/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Optional note" })
    .fill("Use in header");
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeDisabled();
  await uploadImage(page, request.id, "logo.png");
  await expect(page.getByRole("img")).toHaveCount(0);
  const { image, bytes } = await uploadImage(
    page,
    request.id,
    "replacement.png",
  );
  await expect(page.getByText("logo.png", { exact: true })).toHaveCount(0);
  const publicImage = await page.request.get(image.url);
  expect(publicImage.ok()).toBe(true);
  expect(await publicImage.body()).toEqual(bytes);
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expectReview(page);
  expect((await history(app, request.id))[1]).toMatchObject({
    answers: [
      {
        question_id: request.draft!.clarifying_questions[0]!.id,
        answer: "Use in header",
        image: { id: image.id, filename: "replacement.png", url: image.url },
      },
    ],
  });
});

test("a suitability concern lets the user explicitly keep the uploaded image", async ({
  page,
  app,
}) => {
  app.setResponses([imageInitial]);
  const request = await submitDesign(page);
  const { image } = await uploadImage(page, request.id, "portrait.png");
  const concern = "This image needs heavy cropping for the banner.";
  app.setResponses([
    {
      ...initial,
      response: "Please review the supplied image.",
      ambiguities: [concern],
      clarifying_questions: [
        {
          type: "image",
          question: "Keep this image or upload a replacement?",
          image_id: image.id,
          concern,
        },
      ],
    },
    ready,
  ]);
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expect(page.getByText(concern, { exact: true })).toBeVisible();
  await expect(page.getByText("portrait.png", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Keep this image anyway", exact: true })
    .click();
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expectReview(page);
  const saved = await history(app, request.id);
  expect(saved[2]).toMatchObject({
    answers: [
      { image: { id: image.id } },
      {
        question_id: image.question_id,
        image: { id: image.id },
        keep_anyway: true,
        concern,
      },
    ],
  });
});

test("mixed questions keep each uploaded image associated with its answer", async ({
  page,
  app,
}) => {
  app.setResponses([
    {
      ...initial,
      clarifying_questions: [
        { type: "image", question: "Upload the logo" },
        "Which page?",
        { type: "image", question: "Upload the portrait" },
      ],
    },
    ready,
  ]);
  const request = await submitDesign(page);
  const { image: logo } = await uploadImage(page, request.id, "logo.png");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Which page?", exact: true })
    .fill("/artworks/gallery");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submit", exact: true }),
  ).toBeDisabled();
  const { image: portrait } = await uploadImage(
    page,
    request.id,
    "portrait.png",
  );
  expect((await submitAnswers(page, request.id)).status()).toBe(200);
  await expectReview(page);
  const questions = request.draft!.clarifying_questions;
  expect((await history(app, request.id))[1]).toMatchObject({
    answers: [
      {
        question_id: questions[0]!.id,
        image: { id: logo.id, filename: "logo.png" },
      },
      { question_id: questions[1]!.id, answer: "/artworks/gallery" },
      {
        question_id: questions[2]!.id,
        image: { id: portrait.id, filename: "portrait.png" },
      },
    ],
  });
});
