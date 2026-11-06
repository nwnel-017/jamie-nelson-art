import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase/database";
import type { AiModel } from "../server/utils/agent/ai-model";
import type { DesignRequest } from "../server/utils/agent/design-request";
import { createTestModel } from "../server/utils/agent/test-model";
import { initialDraftAnalysis } from "../server/utils/agent/draft-analysis";
import { clarifyDesignRequest } from "../server/services/clarify-requirements.service";
import {
  reserveAnalysis,
  finishAnalysis,
  getRequestWithDraft,
} from "../server/services/design-drafts.service";
import { VerificationAgent } from "../server/utils/agent/verification-agent";
import { HandoffError } from "../server/utils/agent/errors";
import { submissionHash } from "../server/utils/agent/submission-hash";

// Explicit opt-in script: npm run test:drafts:integration (loads local .env).
test("real draft transactions enforce versions, readiness, concurrency, limits and idempotency", async () => {
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
  try {
    const first = await initial();
    assert.equal(first.analyze_attempts, 1);
    assert.equal(first.draft_version, 1);
    const vague = body(first, "idk");
    const second = await clarifyDesignRequest(
      client,
      first.id,
      owner,
      vague,
      counted,
      4,
    );
    assert.equal(second.ready, false);
    assert.equal(second.draft_version, 2);
    assert.equal(second.analyze_attempts, 2);
    const count = calls;
    const replay = await clarifyDesignRequest(
      client,
      first.id,
      owner,
      vague,
      counted,
      4,
    );
    assert.equal(replay.draft_version, 2);
    assert.equal(calls, count);
    await assert.rejects(
      clarifyDesignRequest(
        client,
        first.id,
        owner,
        { ...vague, submission_id: randomUUID() },
        counted,
        4,
      ),
      code("STALE_DRAFT"),
    );
    await assert.rejects(
      clarifyDesignRequest(
        client,
        first.id,
        owner,
        {
          ...vague,
          answers: vague.answers.map((a) => ({ ...a, answer: "Different" })),
        },
        counted,
        4,
      ),
      code("SUBMISSION_CONFLICT"),
    );
    const ready = await clarifyDesignRequest(
      client,
      first.id,
      owner,
      body(second, "/gallery"),
      counted,
      4,
    );
    assert.equal(ready.ready, true);
    assert.equal(ready.draft_version, 3);
    assert.equal(ready.analyze_attempts, 3);
    assert.ok(ready.plan!.steps.every((step) => step.target));
    assert.equal(
      (await getRequestWithDraft(client, first.id, owner, 4, 1)).draft!.version,
      1,
    );
    const immutable = await client
      .from("design_analyses")
      .update({ ready: true })
      .eq("design_request_id", first.id);
    assert.ok(
      immutable.error,
      "Service client must not update immutable versions directly",
    );

    let current = await initial();
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
    release();
    current = await pending;
    current = await clarifyDesignRequest(
      client,
      current.id,
      owner,
      body(current, "idk"),
      counted,
      4,
    );
    current = await clarifyDesignRequest(
      client,
      current.id,
      owner,
      body(current, "idk"),
      counted,
      4,
    );
    assert.equal(current.analyze_attempts, 4);
    assert.equal(current.attempts_remaining, 0);
    const atLimit = calls;
    await assert.rejects(
      clarifyDesignRequest(
        client,
        current.id,
        owner,
        body(current, "/gallery"),
        counted,
        4,
      ),
      code("ANALYSIS_LIMIT_REACHED"),
    );
    assert.equal(calls, atLimit);
    assert.equal(
      (await getRequestWithDraft(client, current.id, owner, 4)).draft_version,
      4,
    );

    const beforeFailure = await initial();
    const failedBody = body(beforeFailure, "/gallery");
    await assert.rejects(
      clarifyDesignRequest(
        client,
        beforeFailure.id,
        owner,
        failedBody,
        {
          generate: async () => {
            throw new Error("Simulated failure");
          },
        },
        4,
      ),
      code("ANALYSIS_FAILED"),
    );
    const failed = await getRequestWithDraft(
      client,
      beforeFailure.id,
      owner,
      4,
    );
    assert.equal(failed.analyze_attempts, 2);
    assert.equal(failed.draft_version, 1);
    assert.equal(failed.analysis_status, "failed");
    await assert.rejects(
      clarifyDesignRequest(
        client,
        beforeFailure.id,
        owner,
        failedBody,
        counted,
        4,
      ),
      code("ANALYSIS_FAILED"),
    );
    const retried = await clarifyDesignRequest(
      client,
      beforeFailure.id,
      owner,
      body(beforeFailure, "/gallery"),
      counted,
      4,
    );
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
    const historical = await getRequestWithDraft(
      client,
      beforeFailure.id,
      owner,
      4,
      1,
    );
    assert.deepEqual(historical.draft, beforeFailure.draft);
    assert.ok(!("payload_hash" in retried.draft!));
    assert.ok(!("status" in retried.draft!));
  } finally {
    for (const id of ids) {
      const { error } = await client
        .from("design_requests")
        .delete()
        .eq("id", id)
        .eq("canva_user_id", owner);
      if (error) throw error;
    }
  }
});

test("initial POST retries are idempotent, concurrent calls cannot double-analyze, and approval checks the owner and readiness", async (t) => {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(
      new URL(process.env.SUPABASE_URL!).hostname,
    ),
    "Only local Supabase may be used",
  );
  const { gatherRequirements } =
    await import("../server/services/gather-requirements.service");
  const { executeDesignRequest } =
    await import("../server/services/execute-design.service");
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
  t.mock.method(client.storage, "from", () => storage);
  t.mock.method(storage, "upload", async () => {
    uploads++;
    return { data: { path: "test.png" }, error: null };
  });
  t.mock.method(storage, "remove", async () => ({ data: [], error: null }));
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
    const approval = await executeDesignRequest(client, saved.id, owner);
    assert.deepEqual(approval, {
      success: true,
      requestId: id,
      draft_version: 1,
    });
    await assert.rejects(
      executeDesignRequest(client, saved.id, "someone-else"),
      (error: unknown) =>
        error instanceof HandoffError && error.statusCode === 404,
    );
    const pending = await gatherRequirements(
      client,
      owner,
      { ...input, submissionId: pendingId },
      { ...deps, model: createTestModel(), limit: 4 },
    );
    assert.equal(pending.ready, false);
    await assert.rejects(
      executeDesignRequest(client, pending.id, owner),
      code("PLAN_NOT_READY"),
    );
  } finally {
    finish();
    await client.from("design_requests").delete().in("id", [id, pendingId]);
  }
});
