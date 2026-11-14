import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreviewUrl, sendDesignReadyEmail } from '../scripts/send-design-ready-email.mjs';
const sha = 'a'.repeat(40);
const env = { RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'Portfolio <updates@example.com>', ADMIN_EMAIL: 'delivered@resend.dev', DESIGN_PR_NUMBER: '12', DESIGN_HEAD_SHA: sha, DESIGN_PR_URL: 'https://github.com/owner/repo/pull/12', GITHUB_REPOSITORY: 'owner/repo', GH_TOKEN: 'github-token' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function transport({ deployments = [{ id: 1, sha, environment: 'Preview' }], statuses = [{ state: 'success', environment_url: 'https://preview.example.com/?x=1&y=2' }], sendStatus = 200, sendResult = { id: 'email-id' } } = {}) {
  const calls = [];
  return { calls, request: async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('api.resend.com')) return json(sendResult, sendStatus);
    if (String(url).includes('/statuses?')) return json(statuses);
    return json(deployments);
  } };
}

test('notification resolves the successful preview for the exact reviewed commit and sends escaped links', async () => {
  const { request, calls } = transport();
  assert.equal(await sendDesignReadyEmail(env, request), 'email-id');
  assert.match(calls[0].url, new RegExp(`deployments\\?sha=${sha}`));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer github-token');
  const mail = calls.at(-1);
  assert.equal(mail.url, 'https://api.resend.com/emails');
  assert.equal(mail.options.headers['Idempotency-Key'], `design-ready/12/${sha}`);
  assert.equal(mail.options.redirect, 'error');
  const body = JSON.parse(mail.options.body);
  assert.match(body.html, /x=1&amp;y=2/);
  assert.match(body.text, /https:\/\/github.com\/owner\/repo\/pull\/12/);
  assert.deepEqual(body.to, ['delivered@resend.dev']);
});

test('retries use the same per-PR and commit idempotency key and payload', async () => {
  const { request, calls } = transport();
  await sendDesignReadyEmail(env, request);
  await sendDesignReadyEmail(env, request);
  const emails = calls.filter(call => call.url.includes('api.resend.com'));
  assert.equal(emails.length, 2);
  assert.equal(emails[0].options.headers['Idempotency-Key'], emails[1].options.headers['Idempotency-Key']);
  assert.equal(emails[0].options.body, emails[1].options.body);
});

test('missing configuration and invalid identities fail before sending', async () => {
  for (const key of Object.keys(env)) {
    const { request, calls } = transport();
    await assert.rejects(sendDesignReadyEmail({ ...env, [key]: '' }, request));
    assert.equal(calls.some(call => call.url.includes('api.resend.com')), false, key);
  }
  for (const changes of [{ DESIGN_PR_URL: 'http://github.com/owner/repo/pull/12' }, { DESIGN_PR_URL: 'https://user:pass@github.com/owner/repo/pull/12' }, { DESIGN_PR_NUMBER: '12\ninjected' }, { DESIGN_HEAD_SHA: 'master' }, { GITHUB_REPOSITORY: '../repo' }]) {
    const { request, calls } = transport();
    await assert.rejects(sendDesignReadyEmail({ ...env, ...changes }, request));
    assert.equal(calls.some(call => call.url.includes('api.resend.com')), false);
  }
});

test('missing, pending, failed, wrong-commit, and production deployments never send ready email', async () => {
  for (const options of [{ deployments: [] }, { statuses: [{ state: 'pending', environment_url: 'https://preview.example.com' }] }, { statuses: [{ state: 'failure' }, { state: 'success', environment_url: 'https://old.example.com' }] }, { deployments: [{ id: 1, sha: 'b'.repeat(40), environment: 'Preview' }] }, { deployments: [{ id: 1, sha, environment: 'Production' }] }, { statuses: [{ state: 'success', environment_url: 'http://preview.example.com' }] }]) {
    const { request, calls } = transport(options);
    await assert.rejects(sendDesignReadyEmail(env, request));
    assert.equal(calls.some(call => call.url.includes('api.resend.com')), false);
  }
});

test('preview environment is configurable and matched without case sensitivity', async () => {
  const { request } = transport({ deployments: [{ id: 2, sha, environment: 'staging' }] });
  assert.equal(await resolvePreviewUrl({ ...env, DESIGN_PREVIEW_ENVIRONMENT: 'Staging' }, request), 'https://preview.example.com/?x=1&y=2');
});

test('GitHub and Resend errors propagate without leaking response bodies', async () => {
  await assert.rejects(resolvePreviewUrl(env, async () => json({ secret: 'hidden' }, 403)), /HTTP 403/);
  const failure = transport({ sendStatus: 422, sendResult: { secret: 'hidden' } });
  await assert.rejects(sendDesignReadyEmail(env, failure.request), error => error.message.includes('HTTP 422') && !error.message.includes('hidden'));
  const missing = transport({ sendResult: {} });
  await assert.rejects(sendDesignReadyEmail(env, missing.request), /email ID/);
});
