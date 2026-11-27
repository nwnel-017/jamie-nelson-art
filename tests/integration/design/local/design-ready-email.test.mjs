import { test } from "vitest";
import assert from "node:assert/strict";
import {
  resolvePreviewUrl,
  createResultEmail,
  sendSavedResultEmail,
} from "../../../../scripts/send-design-ready-email.mjs";
const sendDesignReadyEmail = async (env, request) =>
  sendSavedResultEmail(
    createResultEmail("ready", env, await resolvePreviewUrl(env, request)),
    env,
    request,
  );
const sendDesignFailureEmail = (env, request, wait) =>
  sendSavedResultEmail(createResultEmail("failure", env), env, request, wait);

const sha = "a".repeat(40);
const env = {
  DESIGN_JOB_ID: "12345678-1234-4234-8234-123456789abc",
  RESEND_API_KEY: "key",
  RESEND_FROM_EMAIL: "Portfolio <updates@example.com>",
  ADMIN_EMAIL: "delivered@resend.dev",
  DESIGN_PR_NUMBER: "12",
  DESIGN_HEAD_SHA: sha,
  DESIGN_PR_URL: "https://github.com/owner/repo/pull/12",
  GITHUB_REPOSITORY: "owner/repo",
  GH_TOKEN: "github-token",
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status });
function transport({
  deployments = [{ id: 1, sha, environment: "Preview" }],
  statuses = [
    {
      state: "success",
      environment_url: "https://preview.example.com/?x=1&y=2",
    },
  ],
  sendStatus = 200,
  sendResult = { id: "email-id" },
} = {}) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("api.resend.com"))
        return json(sendResult, sendStatus);
      if (String(url).includes("/statuses?")) return json(statuses);
      return json(deployments);
    },
  };
}

test("notification resolves the successful preview for the exact reviewed commit and sends escaped links", async () => {
  const { request, calls } = transport();
  assert.equal(await sendDesignReadyEmail(env, request), "email-id");
  assert.match(calls[0].url, new RegExp(`deployments\\?sha=${sha}`));
  assert.equal(calls[0].options.headers.Authorization, "Bearer github-token");
  const mail = calls.at(-1);
  assert.equal(mail.url, "https://api.resend.com/emails");
  assert.equal(
    mail.options.headers["Idempotency-Key"],
    `design-result/${env.DESIGN_JOB_ID}`,
  );
  assert.equal(mail.options.redirect, "error");
  const body = JSON.parse(mail.options.body);
  assert.match(body.html, /x=1&amp;y=2/);
  assert.match(body.text, /https:\/\/github.com\/owner\/repo\/pull\/12/);
  assert.deepEqual(body.to, ["delivered@resend.dev"]);
});

test("retries use the same per-PR and commit idempotency key and payload", async () => {
  const { request, calls } = transport();
  await sendDesignReadyEmail(env, request);
  await sendDesignReadyEmail(env, request);
  const emails = calls.filter((call) => call.url.includes("api.resend.com"));
  assert.equal(emails.length, 2);
  assert.equal(
    emails[0].options.headers["Idempotency-Key"],
    emails[1].options.headers["Idempotency-Key"],
  );
  assert.equal(emails[0].options.body, emails[1].options.body);
});

test("missing configuration and invalid identities fail before sending", async () => {
  for (const key of Object.keys(env)) {
    const { request, calls } = transport();
    await assert.rejects(sendDesignReadyEmail({ ...env, [key]: "" }, request));
    assert.equal(
      calls.some((call) => call.url.includes("api.resend.com")),
      false,
      key,
    );
  }
  for (const changes of [
    { DESIGN_PR_URL: "http://github.com/owner/repo/pull/12" },
    { DESIGN_PR_URL: "https://user:pass@github.com/owner/repo/pull/12" },
    { DESIGN_PR_NUMBER: "12\ninjected" },
    { DESIGN_HEAD_SHA: "master" },
    { GITHUB_REPOSITORY: "../repo" },
  ]) {
    const { request, calls } = transport();
    await assert.rejects(sendDesignReadyEmail({ ...env, ...changes }, request));
    assert.equal(
      calls.some((call) => call.url.includes("api.resend.com")),
      false,
    );
  }
});

test("missing, failed, wrong-commit, and production deployments never send ready email", async () => {
  for (const options of [
    { deployments: [] },
    {
      statuses: [
        { state: "failure" },
        { state: "success", environment_url: "https://old.example.com" },
      ],
    },
    { deployments: [{ id: 1, sha: "b".repeat(40), environment: "Preview" }] },
    { deployments: [{ id: 1, sha, environment: "Production" }] },
    {
      statuses: [
        { state: "success", environment_url: "http://preview.example.com" },
      ],
    },
  ]) {
    const { request, calls } = transport(options);
    await assert.rejects(sendDesignReadyEmail(env, request));
    assert.equal(
      calls.some((call) => call.url.includes("api.resend.com")),
      false,
    );
  }
});

test("preview environment is configurable and matched without case sensitivity", async () => {
  const { request } = transport({
    deployments: [{ id: 2, sha, environment: "staging" }],
  });
  assert.equal(
    await resolvePreviewUrl(
      { ...env, DESIGN_PREVIEW_ENVIRONMENT: "Staging" },
      request,
    ),
    "https://preview.example.com/?x=1&y=2",
  );
});

test("GitHub and Resend errors propagate without leaking response bodies", async () => {
  await assert.rejects(
    resolvePreviewUrl(env, async () => json({ secret: "hidden" }, 403)),
    /HTTP 403/,
  );
  const failure = transport({
    sendStatus: 422,
    sendResult: { secret: "hidden" },
  });
  await assert.rejects(
    sendDesignReadyEmail(env, failure.request),
    (error) =>
      error.message.includes("HTTP 422") && !error.message.includes("hidden"),
  );
  const missing = transport({ sendResult: {} });
  await assert.rejects(sendDesignReadyEmail(env, missing.request), /email ID/);
});

test("failure email does not require a PR and asks the admin to contact the developer", async () => {
  const { request, calls } = transport();
  await sendDesignFailureEmail(
    { ...env, DESIGN_JOB_ID: "12345678-1234-4234-8234-123456789abc" },
    request,
  );
  const mail = calls.at(-1);
  const body = JSON.parse(mail.options.body);
  assert.match(body.text, /something went wrong/i);
  assert.match(body.text, /contact.*developer/i);
  assert.match(body.text, /12345678-1234-4234-8234-123456789abc/);
  assert.equal(calls.length, 1);
});

test("temporary send failures retry with the same payload and key; permanent errors stop", async () => {
  const calls = [];
  const options = {
    ...env,
    DESIGN_JOB_ID: "12345678-1234-4234-8234-123456789abc",
  };
  await sendDesignFailureEmail(
    options,
    async (url, request) => {
      calls.push(request);
      if (calls.length === 1) throw new Error("Network unavailable");
      return calls.length === 2 ? json({}, 503) : json({ id: "sent" });
    },
    async () => {},
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body, calls[2].body);
  assert.equal(
    calls[0].headers["Idempotency-Key"],
    calls[2].headers["Idempotency-Key"],
  );
  let attempts = 0;
  await assert.rejects(
    sendDesignFailureEmail(
      options,
      async () => {
        attempts++;
        return json({}, 422);
      },
      async () => {},
    ),
    /HTTP 422/,
  );
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(
    sendDesignFailureEmail(
      options,
      async () => {
        attempts++;
        return json({}, 503);
      },
      async () => {},
    ),
    /HTTP 503/,
  );
  assert.equal(attempts, 3);
});
