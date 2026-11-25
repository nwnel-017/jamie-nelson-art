import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createResultEmail,
  sendSavedResultEmail,
  resolvePreviewUrl,
  PreviewDeploymentError,
} from "./send-design-ready-email.mjs";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// Run from trusted workflow code after the design workflow finishes.
export async function notifyDesignResult(
  run,
  env = process.env,
  request = fetch,
  wait = delay,
) {
  // Only handle design workflows dispatched from the configured branch.
  const implementation = run.path === ".github/workflows/implement-design.yml";
  const verification = run.path === ".github/workflows/verify-design-pr.yml";
  if (
    (!implementation && !verification) ||
    run.event !== "workflow_dispatch" ||
    run.status !== "completed" ||
    run.head_branch !== (env.DESIGN_WORKFLOW_REF || "master")
  )
    return null;
  const match = run.display_title?.match(
    new RegExp(
      implementation
        ? `^Technical design job (${uuid})$`
        : `^Verify design PR #([1-9][0-9]*) \\(repair [0-2]\\) job (${uuid})$`,
      "i",
    ),
  );
  if (!match) return null;
  // Implementation reruns do not generate work; notification reruns can still retry delivery.
  if (implementation && run.run_attempt !== 1) return null;
  if (
    !Number.isSafeInteger(run.id) ||
    run.id <= 0 ||
    !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY) ||
    !env.GH_TOKEN ||
    !/^[0-9a-f]{40}$/.test(run.head_sha)
  )
    throw new Error("Invalid workflow identity.");
  const get = async (path) => {
    const response = await request(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`,
      {
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Could not read design workflow data (HTTP ${response.status}).`,
      );
    return response.json();
  };
  const jobId = implementation ? match[1] : match[2];
  const mailEnv = { ...env, DESIGN_JOB_ID: jobId };
  const backend = new URL(env.TECHNICAL_JOBS_BACKEND_URL);
  if (
    backend.protocol !== "https:" ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  )
    throw new Error("Invalid email state backend.");
  let identity;
  const emailState = async (action, email) => {
    if (!identity) {
      const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
      url.searchParams.set("audience", `${backend.origin}/design-result-email`);
      const response = await request(url, {
        headers: {
          Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Could not authenticate email state request.");
      identity = (await response.json()).value;
      if (typeof identity !== "string" || !identity)
        throw new Error("Missing notification identity.");
    }
    const response = await request(
      `${backend.origin}/api/agent/technical-jobs/${jobId}/email`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${identity}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...(email ? { email } : {}) }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Could not update result email state (HTTP ${response.status}).`,
      );
    return response.json();
  };
  const deliver = async (email, saved = false) => {
    const state = saved
      ? { result_email: email }
      : await emailState("save", email);
    if (state.email_sent_at) return null;
    const result = await sendSavedResultEmail(
      state.result_email,
      mailEnv,
      request,
      wait,
    );
    await emailState("sent");
    return result;
  };
  // Restore the job's saved message before inspecting PR state that may have changed.
  const previous = await emailState("read");
  if (previous.email_sent_at) return null;
  if (previous.result_email) return deliver(previous.result_email, true);
  const fail = () => deliver(createResultEmail("failure", mailEnv));
  const { jobs } = await get(
    `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  if (!Array.isArray(jobs)) throw new Error("Invalid design workflow jobs.");
  // A newer run owns notifications when it replaces a cancelled run.
  if (run.conclusion === "cancelled") {
    const { workflow_runs: runs } = await get(
      "actions/runs?event=workflow_dispatch&per_page=100",
    );
    if (!Array.isArray(runs))
      throw new Error("Invalid successor workflow data.");
    if (
      runs.some(
        (next) =>
          next.id > run.id &&
          next.event === "workflow_dispatch" &&
          next.head_branch === run.head_branch &&
          ((next.path === ".github/workflows/implement-design.yml" &&
            next.display_title === `Technical design job ${jobId}`) ||
            (next.path === ".github/workflows/verify-design-pr.yml" &&
              next.display_title?.endsWith(` job ${jobId}`))),
      )
    )
      return null;
  }
  // Repairs hand off to another run; only terminal verification sends an email.
  if (verification) {
    const repair = jobs.find((job) => job.name === "publish-repair");
    if (
      repair?.steps?.some(
        (step) =>
          step.name === "Publish repair and queue another verification run" &&
          step.conclusion === "success",
      )
    )
      return null;
    if (jobs.find((job) => job.name === "ready")?.conclusion !== "success")
      return fail();
    const pr = await get(`pulls/${match[1]}`);
    if (
      !pr ||
      typeof pr.state !== "string" ||
      typeof pr.head?.ref !== "string" ||
      !/^[0-9a-f]{40}$/.test(pr.head?.sha)
    ) {
      throw new Error("Invalid pull request response.");
    }
    if (
      pr.state !== "open" ||
      !new RegExp(`^agent/design-${uuid}$`, "i").test(pr.head.ref)
    )
      return null;
    const statuses = await get(`commits/${pr.head.sha}/statuses?per_page=100`);
    if (!Array.isArray(statuses))
      throw new Error("Invalid verification status response.");
    const status = statuses.find(
      (item) => item.context === "design-verification",
    );
    // Ignore a completed run if the PR now points at a different verification result.
    if (
      status?.state !== "success" ||
      status.target_url !==
        `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${run.id}`
    )
      return null;
    const readyEnv = {
      ...mailEnv,
      DESIGN_PR_NUMBER: match[1],
      DESIGN_PR_URL: `https://github.com/${env.GITHUB_REPOSITORY}/pull/${match[1]}`,
      DESIGN_HEAD_SHA: pr.head.sha,
    };
    let previewUrl;
    try {
      previewUrl = await resolvePreviewUrl(readyEnv, request);
    } catch (error) {
      // Only a confirmed deployment failure should select the failure email.
      if (error instanceof PreviewDeploymentError) return fail();
      throw error;
    }
    if (!previewUrl) return null;
    return deliver(createResultEmail("ready", readyEnv, previewUrl));
  }
  // Ignore duplicate claims and successful handoffs to verification.
  const claim = jobs.find((job) => job.name === "claim");
  if (
    claim?.conclusion === "success" &&
    claim.steps?.some(
      (step) =>
        step.name ===
          "Transfer approved context to isolated implementation job" &&
        step.conclusion === "skipped",
    )
  )
    return null;
  const published = jobs.find((job) => job.name === "publish");
  if (
    published?.steps?.some(
      (step) =>
        step.name === "Open pull request" && step.conclusion === "success",
    )
  )
    return null;
  return fail();
}

// Vercel status events retry completed verification from the trusted default branch.
export async function notifyPreviewStatus(
  event,
  env = process.env,
  request = fetch,
) {
  if (event.context !== "Vercel" || !/^[0-9a-f]{40}$/.test(event.sha))
    return null;
  const get = async (path) => {
    const response = await request(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`,
      {
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error("Could not read preview verification.");
    return response.json();
  };
  const statuses = await get(`commits/${event.sha}/statuses?per_page=100`);
  if (!Array.isArray(statuses))
    throw new Error("Invalid verification status response.");
  const verified = statuses.find(
    (item) => item.context === "design-verification",
  );
  if (verified?.state !== "success") return null;
  const prefix = `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/`;
  if (!verified.target_url?.startsWith(prefix)) return null;
  const runId = verified.target_url.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(runId)) return null;
  const run = await get(`actions/runs/${runId}`);
  return notifyDesignResult(run, env, request);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  console.log(
    event.workflow_run
      ? await notifyDesignResult(event.workflow_run)
      : await notifyPreviewStatus(event),
  );
}
