import { test } from 'vitest';
import assert from 'node:assert/strict';
import { notifyDesignResult, notifyPreviewStatus } from '../../scripts/notify-design-result.mjs';
const job = '12345678-1234-4234-8234-123456789abc';
const env = {
  GITHUB_REPOSITORY: 'owner/repo',
  GH_TOKEN: 'token',
  RESEND_API_KEY: 'key',
  RESEND_FROM_EMAIL: 'updates@example.test',
  ADMIN_EMAIL: 'admin@example.test',
  TECHNICAL_JOBS_BACKEND_URL: 'https://backend.example',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/token',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-identity',
};
const run = {
  id: 12,
  head_sha: 'b'.repeat(40),
  run_attempt: 1,
  event: 'workflow_dispatch',
  status: 'completed',
  path: '.github/workflows/generate-technical-instructions.yml',
  head_branch: 'master',
  display_title: `Technical design job ${job}`,
  conclusion: 'failure',
};
const json = (value) => new Response(JSON.stringify(value));
function createTransport(jobs, routes = {}) {
  const emails = [];
  let resultEmail = null;
  let sentAt = null;

  const request = async (url, options) => {
    const { origin, pathname } = new URL(url);
    if (origin === 'https://api.resend.com') {
      emails.push(JSON.parse(options.body));
      return json({ id: 'sent' });
    }

    const path = pathname.replace('/repos/owner/repo/', '');
    if (origin === 'https://oidc.example') return json({ value: 'signed-notification-token' });
    if (origin === 'https://backend.example') {
      const body = JSON.parse(options.body);
      if (body.action === 'save' && !resultEmail) resultEmail = body.email;
      if (body.action === 'sent') sentAt = '2026-11-19T00:00:00Z';
      return json({ result_email: resultEmail, email_sent_at: sentAt });
    }
    if (path === 'actions/runs') return json({ workflow_runs: [] });
    if (path.endsWith('/jobs')) return json({ jobs });

    const response = routes[path];
    if (response !== undefined) return json(typeof response === 'function' ? response() : response);
    throw new Error(`Unexpected request ${url}`);
  };

  return { emails, request };
}

test('planning, execution, publication and cancellation failures email the admin without a PR', async () => {
  for (const name of ['claim', 'plan', 'implement', 'publish']) {
    const { emails, request } = createTransport([{ name, conclusion: 'failure', steps: [] }]);
    assert.equal(await notifyDesignResult(run, env, request), 'sent');
    assert.match(emails[0].text, /contact the developer/);
  }
  const { emails, request } = createTransport([]);
  await notifyDesignResult({ ...run, conclusion: 'cancelled' }, env, request);
  assert.equal(emails.length, 1);
});
test('successful handoff to verification sends no premature outcome', async () => {
  const { emails, request } = createTransport([
    {
      name: 'publish',
      conclusion: 'success',
      steps: [{ name: 'Open pull request', conclusion: 'success' }],
    },
  ]);
  assert.equal(await notifyDesignResult({ ...run, conclusion: 'success' }, env, request), null);
  assert.equal(emails.length, 0);
});

const sha = 'a'.repeat(40);
const verification = {
  ...run,
  path: '.github/workflows/verify-design-pr.yml',
  display_title: `Verify design PR #17 (repair 2) job ${job}`,
  conclusion: 'success',
};
function verifiedTransport({
  repaired = false,
  ready = true,
  preview = 'success',
  stale = false,
} = {}) {
  let previewRequests = 0;
  const jobs = [
    { name: 'ready', conclusion: ready ? 'success' : 'skipped' },
    {
      name: 'publish-repair',
      conclusion: repaired ? 'success' : 'skipped',
      steps: repaired
        ? [{ name: 'Publish repair and queue another verification run', conclusion: 'success' }]
        : [],
    },
  ];
  const previewStatus = () => {
    previewRequests++;
    const state =
      preview === 'eventual' ? (previewRequests === 1 ? 'pending' : 'success') : preview;
    return [{ state, environment_url: 'https://site-preview.vercel.app' }];
  };

  return createTransport(jobs, {
    'pulls/17': { state: 'open', head: { sha, ref: `agent/design-${job}` } },
    [`commits/${sha}/statuses`]: [
      {
        context: 'design-verification',
        state: 'success',
        target_url: `https://github.com/owner/repo/actions/runs/${stale ? 11 : 12}`,
      },
    ],
    deployments: [{ id: 1, sha, environment: 'Preview' }],
    'deployments/1/statuses': previewStatus,
  });
}

test('verified results wait for the matching preview and send approval links', async () => {
  const { emails, request } = verifiedTransport({ preview: 'eventual' });
  await notifyDesignResult(verification, env, request, async () => {});
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /ready for approval/);
  assert.match(emails[0].text, /https:\/\/site-preview.vercel.app/);
});
test('terminal verification and unavailable preview outcomes send failure; repair handoff sends nothing', async () => {
  for (const options of [{ ready: false }, { preview: 'failure' }]) {
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
  for (const changes of [
    { head_branch: 'other' },
    { event: 'pull_request' },
    { path: '.github/workflows/other.yml' },
  ]) {
    assert.equal(
      await notifyDesignResult({ ...verification, ...changes }, env, () => {
        throw new Error('Must not call');
      }),
      null,
    );
  }
  const { emails, request } = verifiedTransport({ stale: true });
  await notifyDesignResult(verification, env, request, async () => {});
  assert.equal(emails.length, 0);
});

test('an unclaimed duplicate planning dispatch does not send a failure email', async () => {
  const { emails, request } = createTransport([
    {
      name: 'claim',
      conclusion: 'success',
      steps: [{ name: 'Transfer approved input to isolated planner job', conclusion: 'skipped' }],
    },
    { name: 'plan', conclusion: 'skipped', steps: [] },
  ]);
  assert.equal(await notifyDesignResult({ ...run, conclusion: 'success' }, env, request), null);
  assert.equal(emails.length, 0);
});

test('a retry after successful notification does not reevaluate the PR or send a contradictory email', async () => {
  const { emails, request } = verifiedTransport();
  await notifyDesignResult(verification, env, request, async () => {});
  await notifyDesignResult(
    verification,
    env,
    async (url, options) => {
      if (String(url).includes('/pulls/')) throw new Error('PR was merged');
      return request(url, options);
    },
    async () => {},
  );
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /ready for approval/);
});
test('unreadable workflow outcomes remain retryable without selecting failure', async () => {
  const { emails, request } = createTransport([]);
  await assert.rejects(
    notifyDesignResult(run, env, async (url, options) => {
      if (String(url).includes('/jobs?')) return new Response('{}', { status: 503 });
      return request(url, options);
    }),
    /HTTP 503/,
  );
  assert.equal(emails.length, 0);
});
test('a cancelled run with a successor sends no premature failure', async () => {
  const { emails, request } = createTransport([]);
  await notifyDesignResult({ ...run, conclusion: 'cancelled' }, env, async (url, options) => {
    if (String(url).includes('/actions/runs?'))
      return json({ workflow_runs: [{ ...verification, id: 13 }] });
    return request(url, options);
  });
  assert.equal(emails.length, 0);
});
test('a failed email send retries the recorded outcome with unchanged content', async () => {
  const { emails, request } = verifiedTransport();
  let failSend = true;
  const transport = async (url, options) => {
    if (String(url).includes('api.resend.com') && failSend)
      return new Response('{}', { status: 503 });
    if (String(url).includes('/pulls/') && !failSend) throw new Error('PR changed');
    return request(url, options);
  };
  await assert.rejects(
    notifyDesignResult(verification, env, transport, async () => {}),
    /HTTP 503/,
  );
  failSend = false;
  await notifyDesignResult(verification, env, transport, async () => {});
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /ready for approval/);
});

test('a preview status cannot select failure while verification is still active', async () => {
  const { emails, request } = verifiedTransport({ ready: false });
  const result = await notifyPreviewStatus(
    { context: 'Vercel', sha },
    env,
    async (url, options) => {
      if (String(url).endsWith('/actions/runs/12'))
        return json({ ...verification, status: 'in_progress' });
      return request(url, options);
    },
  );
  assert.equal(result, null);
  assert.equal(emails.length, 0);
});

test('temporary PR and preview API errors leave notification retryable without saving failure', async () => {
  for (const path of ['/pulls/17', '/deployments?']) {
    const { emails, request } = verifiedTransport();
    let saved = false;
    await assert.rejects(
      notifyDesignResult(verification, env, async (url, options) => {
        if (String(url).includes(path)) return new Response('{}', { status: 503 });
        if (
          String(url).startsWith(env.TECHNICAL_JOBS_BACKEND_URL) &&
          JSON.parse(options.body).action === 'save'
        )
          saved = true;
        return request(url, options);
      }),
      /HTTP 503/,
    );
    assert.equal(saved, false);
    assert.equal(emails.length, 0);
  }
});
