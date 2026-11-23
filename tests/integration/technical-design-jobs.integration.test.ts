// TO DO --> review existing tests and make sure they pass
import { afterEach, test, vi } from "vitest";

import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  notifyDesignResult,
  notifyPreviewStatus,
} from "../../scripts/notify-design-result.mjs";
import {
  getResultEmail,
  saveResultEmail,
  markResultEmailSent,
} from "../../server/services/design-result-email.service";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HandoffError } from "../../server/utils/agent/errors";
import { executeDesignRequest } from "../../server/services/execute-design.service";
import type { Database } from "../../types/supabase/database";
import {
  reserveAnalysis,
  finishAnalysis,
} from "../../server/services/design-drafts.service";
import {
  reserveTechnicalDesignJob,
  markTechnicalJobDispatched,
  claimTechnicalDesignJob,
  failTechnicalDesignJob,
  reconcileTechnicalDesignRun,
  finishTechnicalDesignJob,
  getTechnicalDesignJobForDraft,
} from "../../server/services/technical-design-jobs.service";

afterEach(() => vi.restoreAllMocks());

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
      design_image: "https://project.supabase.co/storage/v1/object/public/website_designs/design.png",
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
      response: "The gallery design is ready for implementation.",
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
    const wrongRun = await client.rpc("finish_technical_design_job", {
      p_job_id: job.id,
      p_run_id: run.runId + "1",
      p_run_attempt: 1,
    });
    assert.equal(wrongRun.data, false);
    assert.deepEqual(
      await finishTechnicalDesignJob(client, job.id, run),
      { success: true },
    );
    const duplicate = await client.rpc("finish_technical_design_job", {
      p_job_id: job.id,
      p_run_id: run.runId,
      p_run_attempt: 1,
    });
    assert.equal(duplicate.data, true);
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
        design_image: "https://project.supabase.co/storage/v1/object/public/website_designs/design.png",
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
          response: "The gallery design is ready for implementation.",
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
  test(`approval preserves a ${dispatchOutcome} dispatch without sending another workflow`, async () => {
    const client = localClient();
    const userId = `technical-dispatch-${randomUUID()}`;
    const { data: request, error } = await client
      .from("design_requests")
      .insert({
        canva_user_id: userId,
        design_image: "https://project.supabase.co/storage/v1/object/public/website_designs/design.png",
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
          response: "The gallery design is ready for implementation.",
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
        promptVersion: "image-implementation-v1",
      };
      const originalFetch = globalThis.fetch;
      let githubCalls = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
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

test("approval dispatches a ready draft once and records the GitHub run ID", async () => {
  const client = localClient();
  const userId = `technical-success-${randomUUID()}`;
  const { data: request, error } = await client
    .from("design_requests")
    .insert({
      canva_user_id: userId,
      design_image: "https://project.supabase.co/storage/v1/object/public/website_designs/design.png",
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
        response: "The gallery design is ready for implementation.",
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
      promptVersion: "image-implementation-v1",
    };
    const originalFetch = globalThis.fetch;
    let githubCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
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

function implementGallery(context: Awaited<ReturnType<typeof claimTechnicalDesignJob>>) {
  const directory = mkdtempSync(join(tmpdir(), "design-implementation-"));
  const source = join(directory, "source");
  const input = join(directory, "technical-design-job");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: source, encoding: "utf8" });
  try {
    mkdirSync(join(source, "app/pages"), { recursive: true });
    mkdirSync(input);
    const image = readFileSync(resolve("public/apple-touch-icon.png"));
    writeFileSync(join(input, "input.json"), JSON.stringify(context));
    writeFileSync(join(input, "design.png"), image);
    writeFileSync(join(input, "image.json"), JSON.stringify({
      sha256: createHash("sha256").update(image).digest("hex"),
      width: image.readUInt32BE(16), height: image.readUInt32BE(20),
    }));
    execFileSync(
      process.execPath,
      [resolve("scripts/prepare-design-execution.mjs")],
      {
        env: {
          ...process.env,
          RUNNER_TEMP: directory,
          GITHUB_WORKSPACE: directory,
          TECHNICAL_EXECUTION_PROMPT_FILE: resolve(
            "server/utils/agent/prompts/execute-technical-instructions.ts",
          ),
        },
      },
    );
    git("init", "--quiet");
    git("config", "user.name", "Integration Test");
    git("config", "user.email", "test@example.test");
    writeFileSync(
      join(source, "app/pages/gallery.vue"),
      "<template>Gallery</template>\n",
    );
    git("add", ".");
    git("commit", "--quiet", "-m", "Base gallery");
    // Deterministic agent output; the real patch validator and commit steps still run.
    writeFileSync(
      join(source, "app/pages/gallery.vue"),
      '<template><main class="blue">Gallery</main></template>\n',
    );
    const patch = join(directory, "changes.patch");
    writeFileSync(patch, git("diff", "--binary"));
    git("restore", ".");
    execFileSync(
      process.execPath,
      [resolve("scripts/validate-design-patch.mjs"), patch],
      { cwd: source },
    );
    git("commit", "--quiet", "-m", "Implement approved gallery");
    assert.match(git("show", "HEAD:app/pages/gallery.vue"), /class="blue"/);
    assert.ok(
      readFileSync(join(input, "execution-prompt.txt"), "utf8").includes(
        JSON.stringify(context.designRequest!.requirements),
      ),
    );
    return git("rev-parse", "HEAD").trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const outcome of ["ready", "failure"] as const) {
  test(`approved technical job completes its ${outcome} flow and alerts the admin once`, async () => {
    const client = localClient();
    const userId = `email-flow-${randomUUID()}`;
    const design = await createDesignRequest(client, userId);
    const config = {
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
    const json = (value: unknown) => new Response(JSON.stringify(value));
    let designSha = "a".repeat(40);
    let jobId = "";
    let previewAvailable = false;
    const emails: Array<{ to: string[]; text: string }> = [];
    const notificationEnv = {
      GITHUB_REPOSITORY: config.repository,
      GH_TOKEN: "github-token",
      ADMIN_EMAIL: "admin@example.test",
      RESEND_API_KEY: "test-key",
      RESEND_FROM_EMAIL: "updates@example.test",
      TECHNICAL_JOBS_BACKEND_URL: config.backendUrl,
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-token",
    };
    const request = async (
      input: RequestInfo | URL,
      options?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input));
      if (url.hostname === "oidc.example")
        return json({ value: "signed-test-identity" });
      if (url.hostname === "backend.example") {
        assert.equal(url.pathname, `/api/agent/technical-jobs/${jobId}/email`);
        const body = JSON.parse(String(options?.body));
        if (body.action === "save")
          return json(await saveResultEmail(client, jobId, body.email));
        if (body.action === "sent")
          return json(await markResultEmailSent(client, jobId));
        return json(await getResultEmail(client, jobId));
      }
      if (url.hostname === "api.resend.com") {
        emails.push(JSON.parse(String(options?.body)));
        return json({ id: "sent-integration-email" });
      }
      if (url.hostname !== "api.github.com")
        throw new Error(`Unexpected external request: ${url.origin}`);
      if (url.pathname.endsWith("/dispatches"))
        return json({ workflow_run_id: 789 });
      if (url.pathname.endsWith("/jobs"))
        return json({
          jobs: [
            {
              name: outcome === "ready" ? "ready" : "plan",
              conclusion: outcome === "ready" ? "success" : "failure",
            },
          ],
        });
      if (url.pathname.endsWith("/pulls/17"))
        return json({
          state: "open",
          head: { sha: designSha, ref: `agent/design-${design.id}` },
        });
      if (
        url.pathname.endsWith("/statuses") &&
        url.pathname.includes("/commits/")
      )
        return json([
          {
            context: "design-verification",
            state: "success",
            target_url: "https://github.com/owner/repository/actions/runs/900",
          },
        ]);
      if (url.pathname.endsWith("/deployments"))
        return json(
          previewAvailable
            ? [{ id: 1, sha: designSha, environment: "Preview" }]
            : [],
        );
      if (url.pathname.endsWith("/deployments/1/statuses"))
        return json([
          {
            state: "pending",
            environment_url: "https://gallery-preview.vercel.app",
          },
        ]);
      if (url.pathname.endsWith("/actions/runs/900")) return json(completedRun);
      if (url.pathname.includes("/commits/"))
        return json({ sha: "e".repeat(40) });
      throw new Error(`Unexpected GitHub request: ${url.pathname}`);
    };
    const completedRun = {
      id: outcome === "ready" ? 900 : 789,
      head_sha: "e".repeat(40),
      run_attempt: 1,
      event: "workflow_dispatch",
      status: "completed",
      head_branch: "master",
      conclusion: outcome === "ready" ? "success" : "failure",
      path:
        outcome === "ready"
          ? ".github/workflows/verify-design-pr.yml"
          : ".github/workflows/generate-technical-instructions.yml",
      display_title: "",
    };
    try {
      await createReadyDraft(client, design.id, userId);
      vi.spyOn(globalThis, "fetch").mockImplementation((input, options) =>
        String(input).startsWith("https://api.github.com/")
          ? request(input, options)
          : originalFetch(input, options),
      );
      const approval = await executeDesignRequest(
        client,
        design.id,
        userId,
        config,
      );
      jobId = approval.jobId;
      const worker = { runId: "789", runAttempt: 1 };
      const claimed = await claimTechnicalDesignJob(client, jobId, worker);
      assert.equal(claimed.claimed, true);
      if (outcome === "ready") {
        await finishTechnicalDesignJob(
          client,
          jobId,
          worker,
        );
        designSha = implementGallery(claimed);
        completedRun.display_title = `Verify design PR #17 (repair 0) job ${jobId}`;
        // No URL yet: notification waits for a deployment event, not a polling timer.
        await notifyDesignResult(completedRun, notificationEnv, request);
        assert.equal(emails.length, 0);
        previewAvailable = true;
        await notifyPreviewStatus(
          { context: "Vercel", sha: designSha },
          notificationEnv,
          request,
        );
      } else {
        await failTechnicalDesignJob(client, jobId, worker);
        completedRun.display_title = `Technical design job ${jobId}`;
        await notifyDesignResult(completedRun, notificationEnv, request);
      }
      assert.equal(emails.length, 1);
      assert.deepEqual(emails[0]!.to, ["admin@example.test"]);
      if (outcome === "ready") {
        assert.match(emails[0]!.text, /https:\/\/gallery-preview.vercel.app/);
        assert.match(emails[0]!.text, /may take a few minutes/);
      } else {
        assert.match(emails[0]!.text, /contact the developer/);
        assert.match(emails[0]!.text, new RegExp(jobId));
      }
      const saved = await getResultEmail(client, jobId);
      assert.ok(saved.email_sent_at);
      await notifyDesignResult(completedRun, notificationEnv, request);
      assert.equal(
        emails.length,
        1,
        "replaying completion must not send another email",
      );
    } finally {
      await client.from("design_requests").delete().eq("id", design.id);
    }
  });
}
