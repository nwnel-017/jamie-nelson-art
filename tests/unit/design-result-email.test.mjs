import { test } from 'vitest';
import assert from 'node:assert/strict';
import { notifyDesignResult } from '../../scripts/notify-design-result.mjs';
const job = '12345678-1234-4234-8234-123456789abc';
const env = { GITHUB_REPOSITORY: 'owner/repo', GH_TOKEN: 'token', RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'updates@example.test', ADMIN_EMAIL: 'admin@example.test' };
const run = { id: 12, head_sha: 'b'.repeat(40), run_attempt: 1, event: 'workflow_dispatch', path: '.github/workflows/generate-technical-instructions.yml', head_branch: 'master', display_title: `Technical design job ${job}`, conclusion: 'failure' };
const json = value => new Response(JSON.stringify(value));
function transport(jobs) {
  const emails = [];
  const recorded = [];
  return { emails, request: async (url, options) => {
    if (String(url).includes('api.resend.com')) { emails.push(JSON.parse(options.body)); return json({ id: 'sent' }); }
    if (String(url).includes(`/commits/${run.head_sha}/statuses`)) return json(recorded);
    if (options?.method === 'POST') { recorded.unshift(JSON.parse(options.body)); return json({}); }
    if (String(url).includes('/actions/runs?')) return json({ workflow_runs: [] });
    if (String(url).includes('/jobs?')) return json({ jobs });
    throw new Error(`Unexpected request ${url}`);
  } };
}
test('planning, execution, publication and cancellation failures email the admin without a PR', async () => {
  for (const name of ['claim', 'plan', 'implement', 'publish']) {
    const { emails, request } = transport([{ name, conclusion: 'failure', steps: [] }]);
    assert.equal(await notifyDesignResult(run, env, request), 'sent');
    assert.match(emails[0].text, /contact the developer/);
  }
  const { emails, request } = transport([]);
  await notifyDesignResult({ ...run, conclusion: 'cancelled' }, env, request);
  assert.equal(emails.length, 1);
});
test('successful handoff to verification sends no premature outcome', async () => {
  const { emails, request } = transport([{ name: 'publish', conclusion: 'success', steps: [{ name: 'Open pull request', conclusion: 'success' }] }]);
  assert.equal(await notifyDesignResult({ ...run, conclusion: 'success' }, env, request), null);
  assert.equal(emails.length, 0);
});

const sha = 'a'.repeat(40);
const verification = { ...run, path: '.github/workflows/verify-design-pr.yml', display_title: `Verify design PR #17 (repair 2) job ${job}`, conclusion: 'success' };
function verifiedTransport({ repaired = false, ready = true, preview = 'success', stale = false } = {}) {
  const emails = [];
  const recorded = [];
  let previews = 0;
  return { emails, request: async (url, options) => {
    if (String(url).includes('api.resend.com')) { emails.push(JSON.parse(options.body)); return json({ id: 'sent' }); }
    if (String(url).includes(`/commits/${run.head_sha}/statuses`)) return json(recorded);
    if (options?.method === 'POST') { recorded.unshift(JSON.parse(options.body)); return json({}); }
    if (String(url).includes('/jobs?')) return json({ jobs: [
      { name: 'ready', conclusion: ready ? 'success' : 'skipped' },
      { name: 'publish-repair', conclusion: repaired ? 'success' : 'skipped', steps: repaired ? [{ name: 'Publish repair and queue another verification run', conclusion: 'success' }] : [] },
    ] });
    if (String(url).includes('/pulls/17')) return json({ state: 'open', head: { sha, ref: `agent/design-${job}` } });
    if (String(url).includes('/commits/')) return json([{ context: 'design-verification', state: 'success', target_url: `https://github.com/owner/repo/actions/runs/${stale ? 11 : 12}` }]);
    if (String(url).includes('/deployments?')) return json([{ id: 1, sha, environment: 'Preview' }]);
    if (String(url).includes('/deployments/1/statuses')) {
      previews++;
      return json([{ state: preview === 'eventual' && previews === 1 ? 'pending' : preview === 'eventual' ? 'success' : preview, environment_url: 'https://site-preview.vercel.app' }]);
    }
    throw new Error(`Unexpected request ${url}`);
  } };
}
test('verified results wait for the matching preview and send approval links', async () => {
  const { emails, request } = verifiedTransport({ preview: 'eventual' });
  await notifyDesignResult(verification, env, request, async () => {});
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /ready for approval/);
  assert.match(emails[0].text, /https:\/\/site-preview.vercel.app/);
});
test('terminal verification and unavailable preview outcomes send failure; repair handoff sends nothing', async () => {
  for (const options of [{ ready: false }, { preview: 'failure' }, { preview: 'pending' }]) {
    const { emails, request } = verifiedTransport(options);
    await notifyDesignResult(verification, env, request, async () => {});
    assert.equal(emails.length, 1);
    assert.match(emails[0].text, /contact the developer/);
  }
  const { emails, request } = verifiedTransport({ repaired: true, ready: false });
  assert.equal(await notifyDesignResult(verification, env, request), null);
  assert.equal(emails.length, 0);
});
test('untrusted workflow events and stale verification cannot send a ready email', async () => {
  for (const changes of [{ head_branch: 'other' }, { event: 'pull_request' }, { path: '.github/workflows/other.yml' }]) {
    assert.equal(await notifyDesignResult({ ...verification, ...changes }, env, () => { throw new Error('Must not call'); }), null);
  }
  const { emails, request } = verifiedTransport({ stale: true });
  await notifyDesignResult(verification, env, request, async () => {});
  assert.match(emails[0].text, /contact the developer/);
});

test('an unclaimed duplicate planning dispatch does not send a failure email', async () => {
  const { emails, request } = transport([
    { name: 'claim', conclusion: 'success', steps: [{ name: 'Transfer approved input to isolated planner job', conclusion: 'skipped' }] },
    { name: 'plan', conclusion: 'skipped', steps: [] },
  ]);
  assert.equal(await notifyDesignResult({ ...run, conclusion: 'success' }, env, request), null);
  assert.equal(emails.length, 0);
});

test('a retry after successful notification does not reevaluate the PR or send a contradictory email', async () => {
  const { emails, request } = verifiedTransport();
  await notifyDesignResult(verification, env, request, async () => {});
  await notifyDesignResult(verification, env, async (url, options) => {
    if (String(url).includes('/pulls/')) throw new Error('PR was merged');
    return request(url, options);
  }, async () => {});
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /ready for approval/);
});
test('unreadable workflow outcomes remain retryable without selecting failure', async () => {
  const { emails, request } = transport([]);
  await assert.rejects(notifyDesignResult(run, env, async (url, options) => {
    if (String(url).includes('/jobs?')) return new Response('{}', { status: 503 });
    return request(url, options);
  }), /HTTP 503/);
  assert.equal(emails.length, 0);
});
test('a cancelled run with a successor sends no premature failure', async () => {
  const { emails, request } = transport([]);
  await notifyDesignResult({ ...run, conclusion: 'cancelled' }, env, async (url, options) => {
    if (String(url).includes('/actions/runs?')) return json({ workflow_runs: [{ ...verification, id: 13 }] });
    return request(url, options);
  });
  assert.equal(emails.length, 0);
});
test('a failed email send retries the recorded outcome with unchanged content', async () => {
  const { emails, request } = verifiedTransport();
  let failSend = true;
  const transport = async (url, options) => {
    if (String(url).includes('api.resend.com') && failSend) return new Response('{}', { status: 503 });
    if (String(url).includes('/pulls/') && !failSend) throw new Error('PR changed');
    return request(url, options);
  };
  await assert.rejects(notifyDesignResult(verification, env, transport, async () => {}), /HTTP 503/);
  failSend = false;
  await notifyDesignResult(verification, env, transport, async () => {});
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /ready for approval/);
});

test('an older recorded notification still prevents duplicate delivery after newer statuses', async () => {
  const { emails, request } = transport([]);
  await notifyDesignResult(run, env, request);
  await notifyDesignResult(run, env, async (url, options) => {
    if (String(url).includes(`/commits/${run.head_sha}/statuses`) && !String(url).includes('page=2')) return json(Array.from({ length: 100 }, () => ({ context: 'another-check' })));
    return request(url, options);
  });
  assert.equal(emails.length, 1);
});
