// TO DO --> review existing tests and make sure they pass
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HandoffError } from "../server/utils/agent/errors";
import { executeDesignRequest } from "../server/services/execute-design.service";
import type { Database } from "../types/supabase/database";
import {
  reserveAnalysis,
  finishAnalysis,
} from "../server/services/design-drafts.service";
import {
  reserveTechnicalDesignJob,
  markTechnicalJobDispatched,
  claimTechnicalDesignJob,
  reconcileTechnicalDesignRun,
  finishTechnicalDesignJob,
  getTechnicalDesignJobForDraft,
} from "../server/services/technical-design-jobs.service";

function localClient() {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(
      new URL(process.env.SUPABASE_URL!).hostname,
    ),
    "Only local Supabase may be used",
  );
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

async function createDesignRequest(
  client: ReturnType<typeof localClient>,
  userId: string,
) {
  const { data: request, error } = await client
    .from("design_requests")
    .insert({
      canva_user_id: userId,
      design_image: "https://example.com/design.png",
      instructions: "Make the gallery blue.",
      requirements: [],
      ambiguities: [],
      clarifying_questions: [],
    })
    .select("id")
    .single();
  assert.ifError(error);
  assert.ok(request);
  return request;
}

async function createReadyDraft(
  client: ReturnType<typeof localClient>,
  requestId: string,
  userId: string,
) {
  const submissionId = randomUUID();
  await reserveAnalysis(client, {
    requestId,
    userId,
    submissionId,
    baseVersion: 0,
    payloadHash: randomUUID(),
    limit: 4,
  });
  return finishAnalysis(client, {
    requestId,
    userId,
    submissionId,
    answers: [],
    limit: 4,
    analysis: {
      requirements: ["Make the gallery blue."],
      ambiguities: [],
      clarifying_questions: [],
      ready: true,
      plan: {
        steps: [
          {
            id: "step-1",
            action: "Make the gallery blue.",
            target: "/gallery",
          },
        ],
      },
    },
  });
}

test("technical jobs require a ready draft and reserve only one job per draft", async () => {
  const client = localClient();
  const userId = `technical-reservation-${randomUUID()}`;
  const request = await createDesignRequest(client, userId);
  const input = {
    requestId: request.id,
    userId,
    repositorySha: "a".repeat(40),
    promptVersion: "1",
    model: "test-model",
  };
  try {
    const notReady = await client.rpc("reserve_technical_design_job", {
      p_request_id: input.requestId,
      p_user_id: userId,
      p_repository_sha: input.repositorySha,
      p_prompt_version: input.promptVersion,
      p_model: input.model,
    });
    assert.equal((notReady.data as { state: string }).state, "not_ready");

    const ready = await createReadyDraft(client, request.id, userId);
    const jobs = await Promise.all([
      reserveTechnicalDesignJob(client, input),
      reserveTechnicalDesignJob(client, input),
    ]);
    assert.equal(jobs.filter((job) => job.created).length, 1);
    assert.equal(jobs[0]!.job.id, jobs[1]!.job.id);

    const foreign = await client.rpc("reserve_technical_design_job", {
      p_request_id: request.id,
      p_user_id: "someone-else",
      p_repository_sha: input.repositorySha,
      p_prompt_version: "1",
      p_model: "test-model",
    });
    assert.equal((foreign.data as { state: string }).state, "not_found");
    const forbidden = await client
      .from("technical_design_jobs")
      .update({ status: "completed" })
      .eq("id", jobs[0]!.job.id);
    assert.ok(forbidden.error, "Only lifecycle RPCs may mutate planning jobs");
    assert.ok(ready.draft);
  } finally {
    await client.from("design_requests").delete().eq("id", request.id);
  }
});

test("technical job claim is bound to one run and completion is validated and idempotent", async () => {
  const client = localClient();
  const userId = `technical-lifecycle-${randomUUID()}`;
  const request = await createDesignRequest(client, userId);
  try {
    const ready = await createReadyDraft(client, request.id, userId);
    assert.ok(ready.draft);
    const input = {
      requestId: request.id,
      userId,
      repositorySha: "a".repeat(40),
      promptVersion: "1",
      model: "test-model",
    };
    const { job } = await reserveTechnicalDesignJob(client, input);
    const run = { runId: String(Date.now()), runAttempt: 1 };
    await markTechnicalJobDispatched(client, job.id, run.runId);
    assert.equal(
      (await claimTechnicalDesignJob(client, job.id, { ...run, runAttempt: 2 }))
        .claimed,
      false,
    );
    assert.equal(
      (
        await claimTechnicalDesignJob(client, job.id, {
          ...run,
          runId: run.runId + "1",
        })
      ).claimed,
      false,
    );
    const claims = await Promise.all([
      claimTechnicalDesignJob(client, job.id, run),
      claimTechnicalDesignJob(client, job.id, run),
    ]);
    assert.equal(claims.filter((claim) => claim.claimed).length, 1);
    const claimed = claims.find((claim) => claim.claimed)!;
    assert.deepEqual(
      claimed.designRequest!.requirements,
      ready.draft.requirements,
    );
    assert.deepEqual(claimed.designRequest!.plan, ready.draft.plan);
    assert.equal(claimed.job!.repository_sha, input.repositorySha);
    const instructions = {
      objective: "Make gallery blue",
      tasks: [
        {
          id: "task-1",
          description: "Update gallery theme",
          files: ["app/pages/gallery.vue"],
          acceptance_criteria: ["Gallery is blue"],
        },
      ],
      verification_steps: ["Run npm run build"],
      constraints: [],
      blockers: [],
    };
    const wrongRun = await client.rpc("finish_technical_design_job", {
      p_job_id: job.id,
      p_run_id: run.runId + "1",
      p_run_attempt: 1,
      p_instructions: instructions,
    });
    assert.equal(wrongRun.data, false);
    await assert.rejects(
      finishTechnicalDesignJob(client, job.id, run, { objective: "invalid" }),
      /invalid technical instructions/,
    );
    assert.deepEqual(
      await finishTechnicalDesignJob(client, job.id, run, instructions),
      { success: true },
    );
    const duplicate = await client.rpc("finish_technical_design_job", {
      p_job_id: job.id,
      p_run_id: run.runId,
      p_run_attempt: 1,
      p_instructions: instructions,
    });
    assert.equal(duplicate.data, true);
    const changed = await client.rpc("finish_technical_design_job", {
      p_job_id: job.id,
      p_run_id: run.runId,
      p_run_attempt: 1,
      p_instructions: { objective: "Changed" },
    });
    assert.equal(changed.data, false);
    await reconcileTechnicalDesignRun(client, job.id, run.runId, 1);
    assert.equal(
      (await getTechnicalDesignJobForDraft(client, ready.draft!.id))!.status,
      "completed",
    );
    assert.equal(
      (await claimTechnicalDesignJob(client, job.id, run)).claimed,
      false,
    );

    await client.from("design_requests").delete().eq("id", request.id);
    // Cascade deletion removes jobs together with the source request.
    assert.equal(
      await getTechnicalDesignJobForDraft(client, ready.draft!.id),
      null,
    );
  } finally {
    await client.from("design_requests").delete().eq("id", request.id);
  }
});

for (const completedBeforeDispatch of [false, true]) {
  test(`signed workflow completion fails a ${completedBeforeDispatch ? "dispatching" : "queued"} job without retrying`, async () => {
    const client = localClient();
    const userId = `technical-cancel-${randomUUID()}`;
    const { data: request, error } = await client
      .from("design_requests")
      .insert({
        canva_user_id: userId,
        design_image: "https://example.com/design.png",
        instructions: "Make gallery blue",
        requirements: [],
        ambiguities: [],
        clarifying_questions: [],
      })
      .select("id")
      .single();
    assert.ifError(error);
    assert.ok(request);
    try {
      const submissionId = randomUUID();
      await reserveAnalysis(client, {
        requestId: request.id,
        userId,
        submissionId,
        baseVersion: 0,
        payloadHash: "cancel-hash",
        limit: 4,
      });
      const ready = await finishAnalysis(client, {
        requestId: request.id,
        userId,
        submissionId,
        answers: [],
        limit: 4,
        analysis: {
          requirements: ["Make gallery blue"],
          ambiguities: [],
          clarifying_questions: [],
          ready: true,
          plan: {
            steps: [
              { id: "step-1", action: "Make gallery blue", target: "/gallery" },
            ],
          },
        },
      });
      const { job } = await reserveTechnicalDesignJob(client, {
        requestId: request.id,
        userId,
        repositorySha: "b".repeat(40),
        promptVersion: "1",
        model: "test-model",
      });
      const runId = String(Date.now()) + "9";
      if (!completedBeforeDispatch)
        await markTechnicalJobDispatched(client, job.id, runId);
      await reconcileTechnicalDesignRun(client, job.id, runId, 2);
      assert.equal(
        (await getTechnicalDesignJobForDraft(client, ready.draft!.id))!.status,
        completedBeforeDispatch ? "dispatching" : "queued",
      );
      if (!completedBeforeDispatch) {
        await reconcileTechnicalDesignRun(client, job.id, runId + "1", 1);
        assert.equal(
          (await getTechnicalDesignJobForDraft(client, ready.draft!.id))!
            .status,
          "queued",
        );
      }
      await reconcileTechnicalDesignRun(client, job.id, runId, 1);
      // A late successful dispatch response cannot resurrect a completed workflow.
      if (completedBeforeDispatch)
        await markTechnicalJobDispatched(client, job.id, runId);
      assert.equal(
        (await getTechnicalDesignJobForDraft(client, ready.draft!.id))!.status,
        "failed",
      );
      assert.equal(
        (
          await claimTechnicalDesignJob(client, job.id, {
            runId,
            runAttempt: 1,
          })
        ).claimed,
        false,
      );
      const replay = await reserveTechnicalDesignJob(client, {
        requestId: request.id,
        userId,
        repositorySha: "c".repeat(40),
        promptVersion: "2",
        model: "changed-model",
      });
      assert.equal(replay.created, false);
      assert.equal(replay.job.id, job.id);
      assert.equal(replay.job.repository_sha, "b".repeat(40));
      assert.equal(replay.job.status, "failed");
    } finally {
      await client.from("design_requests").delete().eq("id", request.id);
    }
  });
}

for (const dispatchOutcome of ["rejected", "uncertain"] as const) {
  test(`approval preserves a ${dispatchOutcome} dispatch without sending another workflow`, async (t) => {
    const client = localClient();
    const userId = `technical-dispatch-${randomUUID()}`;
    const { data: request, error } = await client
      .from("design_requests")
      .insert({
        canva_user_id: userId,
        design_image: "https://example.com/design.png",
        instructions: "Make gallery blue",
        requirements: [],
        ambiguities: [],
        clarifying_questions: [],
      })
      .select("id")
      .single();
    assert.ifError(error);
    assert.ok(request);
    try {
      const submissionId = randomUUID();
      await reserveAnalysis(client, {
        requestId: request.id,
        userId,
        submissionId,
        baseVersion: 0,
        payloadHash: "dispatch-hash",
        limit: 4,
      });
      const ready = await finishAnalysis(client, {
        requestId: request.id,
        userId,
        submissionId,
        answers: [],
        limit: 4,
        analysis: {
          requirements: ["Make gallery blue"],
          ambiguities: [],
          clarifying_questions: [],
          ready: true,
          plan: {
            steps: [
              { id: "step-1", action: "Make gallery blue", target: "/gallery" },
            ],
          },
        },
      });
      const planningConfig = {
        token: "test-token",
        repository: "owner/repository",
        repositoryId: "123",
        workflowRef: "master",
        sourceRef: "master",
        backendUrl: "https://backend.example",
        model: "test-model",
        promptVersion: "technical-instructions-v1",
      };
      const originalFetch = globalThis.fetch;
      let githubCalls = 0;
      t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname !== "api.github.com")
          return originalFetch(input, init);
        githubCalls++;
        if (url.pathname.includes("/commits/"))
          return new Response(JSON.stringify({ sha: "d".repeat(40) }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (dispatchOutcome === "uncertain")
          throw new TypeError("Network error");
        return new Response("Rejected", { status: 403 });
      });
      const code = (expected: string) => (error: unknown) =>
        error instanceof HandoffError && error.code === expected;
      await assert.rejects(
        executeDesignRequest(client, request.id, userId, planningConfig),
        code(
          dispatchOutcome === "rejected"
            ? "DISPATCH_FAILED"
            : "DISPATCH_UNCONFIRMED",
        ),
      );
      const job = await getTechnicalDesignJobForDraft(client, ready.draft!.id);
      assert.ok(job);
      assert.equal(
        job.status,
        dispatchOutcome === "rejected" ? "failed" : "dispatching",
      );
      await assert.rejects(
        executeDesignRequest(client, request.id, userId, planningConfig),
        code(
          dispatchOutcome === "rejected"
            ? "PLANNING_FAILED"
            : "DISPATCH_UNCONFIRMED",
        ),
      );
      assert.equal(
        githubCalls,
        2,
        "Approval must not redispatch an existing job",
      );
      if (dispatchOutcome === "uncertain") {
        // The first dispatch may have succeeded before the response was lost.
        const claim = await claimTechnicalDesignJob(client, job.id, {
          runId: String(Date.now()) + "8",
          runAttempt: 1,
        });
        assert.equal(claim.claimed, true);
        const replay = await executeDesignRequest(
          client,
          request.id,
          userId,
          planningConfig,
        );
        assert.equal(replay.status, "running");
        assert.equal(replay.jobId, job.id);
        assert.equal(githubCalls, 2);
      } else {
        assert.equal(
          (
            await claimTechnicalDesignJob(client, job.id, {
              runId: String(Date.now()) + "7",
              runAttempt: 1,
            })
          ).claimed,
          false,
        );
      }
    } finally {
      await client.from("design_requests").delete().eq("id", request.id);
    }
  });
}

test("approval dispatches a ready draft once and records the GitHub run ID", async (t) => {
  const client = localClient();
  const userId = `technical-success-${randomUUID()}`;
  const { data: request, error } = await client
    .from("design_requests")
    .insert({
      canva_user_id: userId,
      design_image: "https://example.com/design.png",
      instructions: "Make gallery blue",
      requirements: [],
      ambiguities: [],
      clarifying_questions: [],
    })
    .select("id")
    .single();
  assert.ifError(error);
  assert.ok(request);
  try {
    const submissionId = randomUUID();
    await reserveAnalysis(client, {
      requestId: request.id,
      userId,
      submissionId,
      baseVersion: 0,
      payloadHash: "successful-dispatch-hash",
      limit: 4,
    });
    const ready = await finishAnalysis(client, {
      requestId: request.id,
      userId,
      submissionId,
      answers: [],
      limit: 4,
      analysis: {
        requirements: ["Make gallery blue"],
        ambiguities: [],
        clarifying_questions: [],
        ready: true,
        plan: {
          steps: [
            { id: "step-1", action: "Make gallery blue", target: "/gallery" },
          ],
        },
      },
    });
    const planningConfig = {
      token: "test-token",
      repository: "owner/repository",
      repositoryId: "123",
      workflowRef: "master",
      sourceRef: "master",
      backendUrl: "https://backend.example",
      model: "test-model",
      promptVersion: "technical-instructions-v1",
    };
    const originalFetch = globalThis.fetch;
    let githubCalls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname !== "api.github.com") return originalFetch(input, init);
      githubCalls++;
      if (url.pathname.includes("/commits/"))
        return new Response(JSON.stringify({ sha: "e".repeat(40) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      return new Response(JSON.stringify({ workflow_run_id: 789 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const approval = await executeDesignRequest(
      client,
      request.id,
      userId,
      planningConfig,
    );
    const job = await getTechnicalDesignJobForDraft(client, ready.draft!.id);

    assert.deepEqual(approval, {
      success: true,
      requestId: request.id,
      draft_version: ready.draft!.version,
      jobId: job!.id,
      status: "queued",
    });
    assert.equal(job!.status, "queued");
    assert.equal(job!.github_run_id, "789");
    assert.equal(githubCalls, 2, "Resolve once and dispatch once");
  } finally {
    await client.from("design_requests").delete().eq("id", request.id);
  }
});
