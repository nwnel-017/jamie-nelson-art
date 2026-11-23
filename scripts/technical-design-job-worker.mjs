// This script connects the GitHub Actions workflow to the technical job backend.
// It claims a queued job, prepares the approved context and image, and reports
// the implementation handoff. Publishing and verification run separately.

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContext, prepareImage } from "./design-context.mjs";

const PROMPT_VERSION = "image-implementation-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;
const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

// Return a required environment value.
function required(env, name) {
  if (!env[name]) throw new Error(`Missing ${name}.`);
  return env[name];
}

// Validate the backend and job settings.
export function workerContext(env = process.env) {
  const url = new URL(required(env, "TECHNICAL_JOBS_BACKEND_URL"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "TECHNICAL_JOBS_BACKEND_URL must be a public HTTPS origin.",
    );
  }
  const jobId = required(env, "TECHNICAL_JOB_ID");
  if (!UUID.test(jobId)) throw new Error("Invalid technical job ID.");
  return {
    backend: url.origin,
    jobId,
    directory: join(required(env, "RUNNER_TEMP"), "technical-design-job"),
  };
}

// Read and parse a size-limited JSON response.
async function responseJson(response, limit) {
  if (!response.ok)
    throw new Error(`Worker request failed (HTTP ${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Worker received an empty response.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Worker response exceeds its size limit.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Request a GitHub OIDC token for the backend.
async function identityToken(context, env, request) {
  const oidcUrl = new URL(required(env, "ACTIONS_ID_TOKEN_REQUEST_URL"));
  oidcUrl.searchParams.set(
    "audience",
    `${context.backend}/technical-design-jobs`,
  );
  const result = await responseJson(
    await request(oidcUrl, {
      redirect: "error",
      headers: {
        Authorization: `Bearer ${required(env, "ACTIONS_ID_TOKEN_REQUEST_TOKEN")}`,
      },
    }),
    32 * 1024,
  );
  if (typeof result.value !== "string" || !result.value)
    throw new Error("GitHub did not issue an identity token.");
  return result.value;
}

// Send an authenticated request to the job backend.
async function backendPost(context, suffix, body, env, request) {
  const token = await identityToken(context, env, request);
  return responseJson(
    await request(
      `${context.backend}/api/agent/technical-jobs/${context.jobId}/${suffix}`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    ),
    MAX_INPUT_BYTES,
  );
}

// Check that the backend returned a valid job claim.
export function validateClaim(result, jobId) {
  if (result?.claimed !== true) {
    if (result?.claimed === false) return false;
    throw new Error("Invalid job claim response.");
  }
  if (
    result.job?.id !== jobId ||
    !SHA.test(result.job.repository_sha) ||
    result.job.prompt_version !== PROMPT_VERSION ||
    !MODEL.test(result.job.model) ||
    !result.designRequest ||
    typeof result.designRequest !== "object" ||
    Array.isArray(result.designRequest)
  ) {
    throw new Error("Invalid technical job input.");
  }
  return true;
}

// directly called via github action
// Claim a job and save its validated input.
export async function claimJob(env = process.env, request = fetch) {
  const context = workerContext(env);
  // A workflow rerun is not a second generation attempt.
  if (env.GITHUB_RUN_ATTEMPT !== "1") {
    await appendFile(required(env, "GITHUB_OUTPUT"), "claimed=false\n");
    return;
  }
  const result = await backendPost(context, "claim", undefined, env, request);
  const claimed = validateClaim(result, context.jobId);
  if (claimed) {
    await mkdir(context.directory, { recursive: true });
    await writeFile(
      join(context.directory, "input.json"),
      JSON.stringify(result),
      { mode: 0o600 },
    );
    await appendFile(
      required(env, "GITHUB_OUTPUT"),
      `claimed=true\nrepository_sha=${result.job.repository_sha}\nmodel=${result.job.model}\n`,
    );
  } else {
    await appendFile(required(env, "GITHUB_OUTPUT"), "claimed=false\n");
  }
}

// Prepare immutable approved context and image before any model process starts.
export async function prepareContext(env = process.env) {
  if (env.GITHUB_RUN_ATTEMPT !== "1") throw new Error("Only the first workflow attempt may prepare context.");
  const context = workerContext(env);
  const input = await loadContext(context.directory, env.DESIGN_ID);
  if (!validateClaim(input, context.jobId)) throw new Error("Job was not claimed.");
  await prepareImage(context.directory, input);
}

// Completion remains a workflow handoff outcome, not verified PR progress.
export async function reportResult(env = process.env, request = fetch) {
  const context = workerContext(env);
  await backendPost(context, "result", {
    status: env.TECHNICAL_IMPLEMENTATION_RESULT === "success" ? "completed" : "failed",
  }, env, request);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const commands = {
    claim: claimJob,
    prepare: prepareContext,
    result: reportResult,
  };
  const command = commands[process.argv[2]];
  if (!command) throw new Error("Expected claim, prepare, or result.");
  try {
    await command();
  } catch {
    // Never print backend response bodies, JWTs, approved input, or model output.
    console.error(
      "Technical planning worker failed. Check the backend job status and workflow step.",
    );
    process.exitCode = 1;
  }
}
