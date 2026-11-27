import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import sharp from "sharp";
import { beforeAll, test } from "vitest";
import { gatherRequirements } from "../../../../server/services/gather-requirements.service";
import { HandoffError } from "../../../../server/utils/agent/errors";
import { parseHandoff } from "../../../../server/utils/agent/handoff/validation";
import { createVerificationModel } from "../../../../server/utils/agent/model-factory";
import type { Database } from "../../../../types/supabase/database";

const designToken = "signed-design-token";

let png: Buffer;

beforeAll(async () => {
  png = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
});

function payload() {
  return {
    source: "canva",
    changeOptions: ["existing_pages", "website_theme"],
    instructions: "Add this artwork to the portfolio gallery.",
    outputMedia: [
      {
        mediaSlotId: "media",
        files: [
          {
            format: "png",
            url: "https://export-download.canva.com/image.png?signature=test",
            widthPx: 2,
            heightPx: 3,
            contentMetadata: {
              type: "design",
              designToken,
              title: "Artwork",
              pages: [{ pageId: "page", pageNumber: 1 }],
            },
          },
        ],
      },
    ],
  };
}

function status(code: number) {
  return (error: unknown) =>
    error instanceof HandoffError && error.statusCode === code;
}

const verification = {
  response: "The requirements have been analyzed.",
  requirements: ["Add the artwork to the portfolio."],
  ambiguities: ["The destination collection is unspecified."],
  clarifying_questions: ["Which collection should contain the artwork?"],
};

const timestamps = {
  id: "request-id",
  created_at: "2026-11-03T00:00:00Z",
  updated_at: "2026-11-03T00:00:00Z",
};

function gatherDatabase(
  options: {
    insertError?: boolean;
    uploadError?: boolean;
    finishError?: boolean;
    reservationState?: string;
  } = {},
) {
  const calls: string[] = [];
  let record: Record<string, unknown> | undefined;
  let draft: Record<string, unknown> | undefined;
  const client = createClient<Database>("https://storage.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const parsed = new URL(String(url));
        const path = parsed.pathname;
        const json = (value: unknown, status = 200) =>
          new Response(JSON.stringify(value), {
            status,
            headers: { "content-type": "application/json" },
          });
        if (path.startsWith("/storage/")) {
          if (init?.method === "POST") {
            calls.push("upload");
            if (options.uploadError)
              return json({ message: "Upload failed" }, 500);
            return json({ Key: `website_designs/${path.split("/").at(-1)}` });
          }
          assert.equal(init?.method, "DELETE");
          calls.push("remove");
          return json([]);
        }
        if (path.endsWith("/design_requests")) {
          if (init?.method === "POST") {
            calls.push("create");
            if (options.insertError)
              return json({ message: "Insert failed" }, 500);
            record = {
              ...timestamps,
              ...JSON.parse(String(init.body)),
              analyze_attempts: 0,
            };
            return json([{ id: record.id }]);
          }
          if (
            !record ||
            parsed.searchParams.get("canva_user_id") !== "eq.owner"
          )
            return json([]);
          return json([record]);
        }
        if (path.endsWith("/design_analyses"))
          return json(draft ? [draft] : []);
        const name = path.split("/").at(-1)!;
        const body = JSON.parse(String(init?.body));
        if (name === "reserve_design_analysis") {
          calls.push("reserve");
          if (options.reservationState)
            return json({ state: options.reservationState });
          if (draft) return json({ state: "completed", version: 1 });
          record!.analyze_attempts = 1;
          return json({ state: "reserved" });
        }
        if (name === "finish_design_analysis") {
          calls.push("complete");
          if (options.finishError) return json({ message: "Save failed" }, 500);
          draft = {
            ...body.p_analysis,
            id: "draft-id",
            design_request_id: record!.id,
            version: 1,
            submission_id: body.p_submission_id,
            answers: body.p_answers,
            created_at: timestamps.created_at,
          };
          record!.analysis_status = "completed";
          return json(1);
        }
        if (name === "fail_design_analysis") {
          calls.push("fail");
          record!.analysis_status = "failed";
          return json(null);
        }
        assert.fail(`Unexpected database request: ${path}`);
      },
    },
  });
  return { client, calls };
}

function gatherInput() {
  return {
    ...parseHandoff(payload()),
    bytes: png,
    submissionId: "12345678-1234-4234-8234-123456789abc",
  };
}

test("gathering uploads and reserves before analysis, saves a draft, and replays without another model call", async () => {
  const { VERIFICATION_SYSTEM_PROMPT } =
    await import("../../../../server/utils/agent/prompts/verification");
  const { client, calls } = gatherDatabase();
  const handoff = gatherInput();
  const options = {
    limit: 4,
    model: {
      generate: async (
        input: Parameters<
          import("../../../../server/utils/agent/ai-model").AiModel["generate"]
        >[0],
      ) => {
        calls.push("generate");
        assert.equal(input.systemPrompt, VERIFICATION_SYSTEM_PROMPT);
        assert.equal(input.instructions, handoff.instructions);
        assert.deepEqual(input.changeOptions, handoff.changeOptions);
        assert.equal(input.image!.bytes, png);
        return { text: JSON.stringify(verification) };
      },
    },
  };
  const saved = await gatherRequirements(client, "owner", handoff, options);
  assert.deepEqual(calls, [
    "upload",
    "create",
    "reserve",
    "generate",
    "complete",
  ]);
  assert.equal(saved.id, handoff.submissionId);
  assert.equal(saved.draft_version, 1);
  assert.deepEqual(
    saved.clarifying_questions,
    verification.clarifying_questions,
  );
  const replay = await gatherRequirements(client, "owner", handoff, options);
  assert.equal(replay.draft_version, 1);
  assert.equal(calls.filter((call) => call === "generate").length, 1);
  assert.equal(calls.filter((call) => call === "upload").length, 1);
  await assert.rejects(
    gatherRequirements(
      client,
      "owner",
      { ...handoff, instructions: "Different instructions" },
      options,
    ),
    (error: unknown) =>
      error instanceof HandoffError && error.code === "SUBMISSION_CONFLICT",
  );
});

test("a failed initial insert prevents analysis and removes the unreferenced image", async () => {
  const { client, calls } = gatherDatabase({ insertError: true });
  await assert.rejects(
    gatherRequirements(client, "owner", gatherInput(), {
      limit: 4,
      model: {
        generate: async () =>
          assert.fail("Must persist before invoking the model"),
      },
    }),
    status(500),
  );
  assert.deepEqual(calls, ["upload", "create", "remove"]);
});

test("model failures and malformed output retain the request and image and mark the attempt failed", async () => {
  for (const text of [
    undefined,
    "not JSON",
    "{}",
    JSON.stringify({ ...verification, requirements: "wrong type" }),
  ]) {
    const { client, calls } = gatherDatabase();
    await assert.rejects(
      gatherRequirements(client, "owner", gatherInput(), {
        limit: 4,
        model: {
          generate: async () => {
            assert.deepEqual(calls, ["upload", "create", "reserve"]);
            if (text === undefined) throw new Error("provider secret");
            return { text };
          },
        },
      }),
      (error: unknown) =>
        error instanceof HandoffError &&
        error.statusCode === 502 &&
        error.code === "ANALYSIS_FAILED" &&
        !error.message.includes("secret"),
    );
    assert.deepEqual(calls, ["upload", "create", "reserve", "fail"]);
  }
});

test("a failed draft save retains the request and image and records analysis failure", async () => {
  const { client, calls } = gatherDatabase({ finishError: true });
  await assert.rejects(
    gatherRequirements(client, "owner", gatherInput(), {
      limit: 4,
      model: { generate: async () => ({ text: JSON.stringify(verification) }) },
    }),
    status(500),
  );
  assert.deepEqual(calls, ["upload", "create", "reserve", "complete", "fail"]);
});

test("upload failures prevent inserting a design request", async () => {
  const { client, calls } = gatherDatabase({ uploadError: true });
  await assert.rejects(
    gatherRequirements(client, "owner", gatherInput(), {
      limit: 4,
      model: {
        generate: async () =>
          assert.fail("Must not analyze without an uploaded image"),
      },
    }),
    status(502),
  );
  assert.deepEqual(calls, ["upload"]);
});

test("the test model runs through gathering and saves its clarification questions", async () => {
  const { client, calls } = gatherDatabase();
  const result = await gatherRequirements(client, "owner", gatherInput(), {
    model: createVerificationModel({
      aiProvider: "test",
      aiApiKey: "",
      aiModel: "",
      aiBaseUrl: "",
    }),
    limit: 4,
  });
  assert.deepEqual(calls, ["upload", "create", "reserve", "complete"]);
  assert.equal(result.clarifying_questions.length, 3);
  assert.equal(result.draft_version, 1);
});

test("gathering deduplicates image questions while preserving their upload type", async () => {
  const { client } = gatherDatabase();
  const saved = await gatherRequirements(client, "owner", gatherInput(), {
    limit: 4,
    model: {
      generate: async () => ({
        text: JSON.stringify({
          ...verification,
          clarifying_questions: [
            { type: "image", question: "Upload the exact logo for the header" },
            { type: "image", question: "Upload the exact logo for the header" },
          ],
        }),
      }),
    },
  });
  assert.equal(saved.draft?.clarifying_questions.length, 1);
  assert.equal(saved.draft?.clarifying_questions[0]?.type, "image");
  assert.equal(
    saved.draft?.clarifying_questions[0]?.question,
    "Upload the exact logo for the header",
  );
});
