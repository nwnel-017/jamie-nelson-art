import { test, afterEach, vi, type TestContext } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../types/supabase/database";
import type { AiModel } from "../../../../server/utils/agent/ai-model";
import type { DesignRequest } from "../../../../server/utils/agent/design-request";
import { createTestModel } from "../../../../server/utils/agent/test-model";
import { initialDraftAnalysis } from "../../../../server/utils/agent/draft-analysis";
import { clarifyDesignRequest } from "../../../../server/services/clarify-requirements.service";
import {
  reserveAnalysis,
  finishAnalysis,
  getRequestWithDraft,
} from "../../../../server/services/design-drafts.service";
import { VerificationAgent } from "../../../../server/utils/agent/verification-agent";
import { HandoffError } from "../../../../server/utils/agent/errors";
import { submissionHash } from "../../../../server/utils/agent/submission-hash";
import {
  uploadDesignImage,
  deleteDesignImage,
} from "../../../../server/services/website-designs-storage.service";

afterEach(() => vi.restoreAllMocks());

test("design images upload to real local storage and are publicly readable", async () => {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(
      new URL(process.env.SUPABASE_URL!).hostname,
    ),
    "Only local Supabase may be used",
  );
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
    "base64",
  );
  const image = await uploadDesignImage(client, png);
  try {
    const response = await fetch(image.url);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  } finally {
    await deleteDesignImage(client, image.path);
  }
});

async function drafts(t: TestContext) {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(
      new URL(process.env.SUPABASE_URL!).hostname,
    ),
    "Only local Supabase may be used",
  );
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const owner = `draft-integration-${randomUUID()}`;
  const ids: string[] = [];
  const model = createTestModel();
  let calls = 0;
  const counted: AiModel = {
    generate: async (input) => {
      calls++;
      return model.generate(input);
    },
  };
  const initial = async () => {
    const { data: row, error } = await client
      .from("design_requests")
      .insert({
        canva_user_id: owner,
        design_image: "https://example.com/test.png",
        instructions: "Update the gallery.",
        change_options: ["existing_pages"],
        requirements: [],
        ambiguities: [],
        clarifying_questions: [],
        analysis_status: "pending",
      })
      .select("id, instructions")
      .single();
    assert.ifError(error);
    assert.ok(row);
    ids.push(row.id);
    const submission = randomUUID();
    assert.deepEqual(
      await reserveAnalysis(client, {
        requestId: row.id,
        userId: owner,
        submissionId: submission,
        baseVersion: 0,
        payloadHash: submissionHash({ initial: row.id }),
        limit: 4,
      }),
      { state: "reserved" },
    );
    const analysis = await new VerificationAgent(counted).run({
      instructions: row.instructions,
      changeOptions: ["existing_pages"],
      image: { bytes: new Uint8Array([1]), mimeType: "image/png" },
    });
    return finishAnalysis(client, {
      requestId: row.id,
      userId: owner,
      submissionId: submission,
      analysis: initialDraftAnalysis(analysis),
      answers: [],
      limit: 4,
    });
  };
  const body = (
    request: DesignRequest,
    answer: string,
    submission_id = randomUUID(),
  ) => ({
    draft_version: request.draft!.version,
    submission_id,
    answers: request.draft!.clarifying_questions.map((q) => ({
      question_id: q.id,
      answer,
    })),
  });
  const code = (expected: string) => (error: unknown) =>
    error instanceof HandoffError && error.code === expected;
  t.onTestFinished(async () => {
    for (const id of ids) {
      const { error } = await client
        .from("design_requests")
        .delete()
        .eq("id", id)
        .eq("canva_user_id", owner);
      assert.ifError(error);
    }
  });
  const clarify = (request: DesignRequest, answer: string) =>
    clarifyDesignRequest(
      client,
      request.id,
      owner,
      body(request, answer),
      counted,
      4,
    );
  return {
    client,
    owner,
    initial,
    body,
    code,
    counted,
    clarify,
    calls: () => calls,
  };
}

test("clarification creates a new version and becomes ready when the target is resolved", async (t) => {
  const { initial, clarify } = await drafts(t);
  const first = await initial();
  assert.equal(first.analyze_attempts, 1);
  assert.equal(first.draft_version, 1);
  const second = await clarify(first, "idk");
  assert.equal(second.ready, false);
  assert.equal(second.draft_version, 2);
  assert.equal(second.analyze_attempts, 2);
  const ready = await clarify(second, "/gallery");
  assert.equal(ready.ready, true);
  assert.equal(ready.draft_version, 3);
  assert.equal(ready.analyze_attempts, 3);
  assert.ok(ready.plan!.steps.every((step) => step.target));
});

test("replaying a clarification returns its saved version without another model call", async (t) => {
  const { client, owner, initial, body, counted, calls } = await drafts(t);
  const first = await initial();
  const input = body(first, "idk");
  const second = await clarifyDesignRequest(
    client,
    first.id,
    owner,
    input,
    counted,
    4,
  );
  const count = calls();
  const replay = await clarifyDesignRequest(
    client,
    first.id,
    owner,
    input,
    counted,
    4,
  );
  assert.deepEqual(replay.draft, second.draft);
  assert.equal(calls(), count);
});

test("a new submission against an old draft is rejected as stale", async (t) => {
  const { client, owner, initial, body, counted, clarify, code } =
    await drafts(t);
  const first = await initial();
  await clarify(first, "idk");
  await assert.rejects(
    clarifyDesignRequest(
      client,
      first.id,
      owner,
      body(first, "/gallery"),
      counted,
      4,
    ),
    code("STALE_DRAFT"),
  );
});

test("reusing a submission ID with different answers is rejected", async (t) => {
  const { client, owner, initial, body, counted, code } = await drafts(t);
  const first = await initial();
  const input = body(first, "idk");
  await clarifyDesignRequest(client, first.id, owner, input, counted, 4);
  await assert.rejects(
    clarifyDesignRequest(
      client,
      first.id,
      owner,
      {
        ...input,
        answers: input.answers.map((answer) => ({
          ...answer,
          answer: "Different",
        })),
      },
      counted,
      4,
    ),
    code("SUBMISSION_CONFLICT"),
  );
});

test("saved draft versions remain readable and cannot be updated directly", async (t) => {
  const { client, owner, initial, clarify } = await drafts(t);
  const first = await initial();
  await clarify(first, "/gallery");
  const historical = await getRequestWithDraft(client, first.id, owner, 4, 1);
  assert.deepEqual(historical.draft, first.draft);
  const immutable = await client
    .from("design_analyses")
    .update({ ready: true })
    .eq("design_request_id", first.id);
  assert.ok(
    immutable.error,
    "Service client must not update immutable versions directly",
  );
});

test("concurrent clarification cannot start a second analysis", async (t) => {
  const { client, owner, initial, body, counted, code } = await drafts(t);
  const current = await initial();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow: AiModel = {
    generate: async (input) => {
      entered();
      await gate;
      return counted.generate(input);
    },
  };
  const pending = clarifyDesignRequest(
    client,
    current.id,
    owner,
    body(current, "idk"),
    slow,
    4,
  );
  try {
    await started;
    await assert.rejects(
      clarifyDesignRequest(
        client,
        current.id,
        owner,
        body(current, "idk"),
        counted,
        4,
      ),
      code("ANALYSIS_IN_PROGRESS"),
    );
  } finally {
    release();
    await pending;
  }
});

test("the analysis limit rejects another clarification without calling the model", async (t) => {
  const { client, owner, initial, clarify, calls, code } = await drafts(t);
  let current = await initial();
  for (let attempt = 1; attempt < 4; attempt++)
    current = await clarify(current, "idk");
  assert.equal(current.analyze_attempts, 4);
  assert.equal(current.attempts_remaining, 0);
  const count = calls();
  await assert.rejects(
    clarify(current, "/gallery"),
    code("ANALYSIS_LIMIT_REACHED"),
  );
  assert.equal(calls(), count);
  assert.equal(
    (await getRequestWithDraft(client, current.id, owner, 4)).draft_version,
    4,
  );
});

test("failed analysis retains the previous draft and a new submission can retry", async (t) => {
  const { client, owner, initial, body, counted, clarify, code } =
    await drafts(t);
  const beforeFailure = await initial();
  const input = body(beforeFailure, "/gallery");
  await assert.rejects(
    clarifyDesignRequest(
      client,
      beforeFailure.id,
      owner,
      input,
      {
        generate: async () => {
          throw new Error("Simulated failure");
        },
      },
      4,
    ),
    code("ANALYSIS_FAILED"),
  );
  const failed = await getRequestWithDraft(client, beforeFailure.id, owner, 4);
  assert.equal(failed.analyze_attempts, 2);
  assert.equal(failed.draft_version, 1);
  assert.equal(failed.analysis_status, "failed");
  await assert.rejects(
    clarifyDesignRequest(client, beforeFailure.id, owner, input, counted, 4),
    code("ANALYSIS_FAILED"),
  );
  const retried = await clarify(beforeFailure, "/gallery");
  assert.equal(retried.ready, true);
  assert.equal(retried.analyze_attempts, 3);
  assert.equal(retried.draft_version, 2);
  const history = await client
    .from("design_analyses")
    .select("status, version, base_version, plan, ready")
    .eq("design_request_id", beforeFailure.id)
    .order("started_at");
  assert.ifError(history.error);
  assert.deepEqual(
    history.data!.map(({ status, version, base_version }) => ({
      status,
      version,
      base_version,
    })),
    [
      { status: "completed", version: 1, base_version: 0 },
      { status: "failed", version: null, base_version: 1 },
      { status: "completed", version: 2, base_version: 1 },
    ],
  );
  assert.equal(history.data![1]!.plan, null);
  assert.equal(history.data![1]!.ready, null);
  assert.deepEqual(
    (await getRequestWithDraft(client, beforeFailure.id, owner, 4, 1)).draft,
    beforeFailure.draft,
  );
  assert.ok(!("payload_hash" in retried.draft!));
  assert.ok(!("status" in retried.draft!));
});

test("initial POST retries are idempotent and concurrent calls cannot double-analyze", async () => {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(
      new URL(process.env.SUPABASE_URL!).hostname,
    ),
    "Only local Supabase may be used",
  );
  const { gatherRequirements } =
    await import("../../../../server/services/gather-requirements.service");
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const id = randomUUID();
  const pendingId = randomUUID();
  const owner = `gather-integration-${id}`;
  let modelCalls = 0;
  let uploads = 0;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let finish!: () => void;
  const release = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const ready = {
    response: "The requirements have been analyzed.",
    requirements: ["Make the gallery blue"],
    ambiguities: [],
    clarifying_questions: [],
    ready: true,
    plan: {
      steps: [
        { id: "step-1", action: "Make the gallery blue", target: "/gallery" },
      ],
    },
  };
  const handoff = {
    submissionId: id,
    instructions: "Make the gallery blue",
    changeOptions: ["existing_pages"] as const,
    bytes: new Uint8Array([1, 2, 3]),
    file: {},
  };
  const storage = client.storage.from("website_designs");
  vi.spyOn(client.storage, "from").mockImplementation(() => storage);
  vi.spyOn(storage, "upload").mockImplementation(async () => {
    uploads++;
    return { data: { path: "test.png" }, error: null };
  });
  vi.spyOn(storage, "remove").mockImplementation(async () => ({
    data: [],
    error: null,
  }));
  const deps = {
    model: {
      generate: async () => {
        modelCalls++;
        entered();
        await release;
        return { text: JSON.stringify(ready) };
      },
    },
    limit: 1,
  };
  const input = {
    ...handoff,
    changeOptions: [...handoff.changeOptions],
  } as Parameters<typeof gatherRequirements>[2];
  const code = (expected: string) => (error: unknown) =>
    error instanceof HandoffError && error.code === expected;
  try {
    const first = gatherRequirements(client, owner, input, deps);
    await started;
    await assert.rejects(
      gatherRequirements(client, owner, input, deps),
      code("ANALYSIS_IN_PROGRESS"),
    );
    finish();
    const saved = await first;
    assert.equal(saved.ready, true);
    assert.equal(saved.attempts_remaining, 0);
    const replay = await gatherRequirements(client, owner, input, deps);
    assert.equal(replay.draft_version, 1);
    assert.equal(modelCalls, 1);
    assert.equal(uploads, 1);
    await assert.rejects(
      gatherRequirements(
        client,
        owner,
        { ...input, instructions: "Different instructions" },
        deps,
      ),
      code("SUBMISSION_CONFLICT"),
    );
  } finally {
    finish();
    await client.from("design_requests").delete().in("id", [id, pendingId]);
  }
});
