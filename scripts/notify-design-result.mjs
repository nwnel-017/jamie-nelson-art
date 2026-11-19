import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  sendDesignFailureEmail,
  sendDesignReadyEmail,
  resolvePreviewUrl,
} from './send-design-ready-email.mjs';

const MAX_STATUS_PAGES = 10;
const PREVIEW_ATTEMPTS = 11;
const PREVIEW_INTERVAL_MS = 30000;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Run from trusted workflow code after the design workflow finishes.
export async function notifyDesignResult(run, env = process.env, request = fetch, wait = delay) {
  // Only handle design workflows dispatched from the configured branch.
  const planning = run.path === '.github/workflows/generate-technical-instructions.yml';
  const verification = run.path === '.github/workflows/verify-design-pr.yml';
  if (
    (!planning && !verification) ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== (env.DESIGN_WORKFLOW_REF || 'master')
  )
    return null;
  const match = run.display_title?.match(
    new RegExp(
      planning
        ? `^Technical design job (${uuid})$`
        : `^Verify design PR #([1-9][0-9]*) \\(repair [0-2]\\) job (${uuid})$`,
      'i',
    ),
  );
  if (!match) return null;
  // Planning reruns do not generate work; notification reruns can still retry delivery.
  if (planning && run.run_attempt !== 1) return null;
  if (
    !Number.isSafeInteger(run.id) ||
    run.id <= 0 ||
    !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY) ||
    !env.GH_TOKEN ||
    !/^[0-9a-f]{40}$/.test(run.head_sha)
  )
    throw new Error('Invalid workflow identity.');
  const get = async (path) => {
    const response = await request(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`,
      {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(`Could not read design workflow data (HTTP ${response.status}).`);
    return response.json();
  };
  const jobId = planning ? match[1] : match[2];
  const mailEnv = { ...env, DESIGN_JOB_ID: jobId };
  const context = `design-email/${jobId}/${run.id}`;
  const statusPath = `statuses/${run.head_sha}`;
  // Restore the selected outcome before inspecting PR state that may have changed.
  let previous;
  for (let page = 1; page <= MAX_STATUS_PAGES; page++) {
    const statuses = await get(`commits/${run.head_sha}/statuses?per_page=100&page=${page}`);
    if (!Array.isArray(statuses)) throw new Error('Invalid email status data.');
    previous = statuses.find((status) => status.context === context);
    if (previous || statuses.length < 100) break;
    if (page === MAX_STATUS_PAGES) {
      throw new Error(`Email status lookup exceeded ${MAX_STATUS_PAGES} pages.`);
    }
  }
  if (previous?.state === 'success') return null;
  // Record the email outcome on the workflow commit so retries keep the same message.
  const save = async (state, description, targetUrl) => {
    const response = await request(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${statusPath}`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state, context, description, target_url: targetUrl }),
      },
    );
    if (!response.ok) throw new Error(`Could not record email outcome (HTTP ${response.status}).`);
  };
  const deliver = async (description, targetUrl, recorded = false) => {
    if (!recorded) await save('pending', description, targetUrl);
    let result;
    if (description === 'failure') result = await sendDesignFailureEmail(mailEnv, request, wait);
    else {
      const ready = description.match(/^ready:([1-9][0-9]*):([0-9a-f]{40})$/);
      if (!ready) throw new Error('Invalid recorded email outcome.');
      result = await sendDesignReadyEmail(
        {
          ...mailEnv,
          DESIGN_PR_NUMBER: ready[1],
          DESIGN_HEAD_SHA: ready[2],
          DESIGN_PR_URL: `https://github.com/${env.GITHUB_REPOSITORY}/pull/${ready[1]}`,
        },
        request,
        { previewUrl: targetUrl, wait },
      );
    }
    // Mark delivery complete only after Resend accepts the email.
    await save('success', description, targetUrl);
    return result;
  };
  if (previous) return deliver(previous.description, previous.target_url, true);
  const fail = () =>
    deliver('failure', `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${run.id}`);
  const { jobs } = await get(
    `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  if (!Array.isArray(jobs)) throw new Error('Invalid design workflow jobs.');
  // A newer run owns notifications when it replaces a cancelled run.
  if (run.conclusion === 'cancelled') {
    const { workflow_runs: runs } = await get('actions/runs?event=workflow_dispatch&per_page=100');
    if (!Array.isArray(runs)) throw new Error('Invalid successor workflow data.');
    if (
      runs.some(
        (next) =>
          next.id > run.id &&
          next.event === 'workflow_dispatch' &&
          next.head_branch === run.head_branch &&
          ((next.path === '.github/workflows/generate-technical-instructions.yml' &&
            next.display_title === `Technical design job ${jobId}`) ||
            (next.path === '.github/workflows/verify-design-pr.yml' &&
              next.display_title?.endsWith(` job ${jobId}`))),
      )
    )
      return null;
  }
  // Repairs hand off to another run; only terminal verification sends an email.
  if (verification) {
    const repair = jobs.find((job) => job.name === 'publish-repair');
    if (
      repair?.steps?.some(
        (step) =>
          step.name === 'Publish repair and queue another verification run' &&
          step.conclusion === 'success',
      )
    )
      return null;
    if (jobs.find((job) => job.name === 'ready')?.conclusion !== 'success') return fail();
    let readyEnv;
    let previewUrl;
    try {
      const pr = await get(`pulls/${match[1]}`);
      if (
        pr.state !== 'open' ||
        !new RegExp(`^agent/design-${uuid}$`, 'i').test(pr.head?.ref) ||
        !/^[0-9a-f]{40}$/.test(pr.head?.sha)
      )
        throw new Error('PR no longer matches verification.');
      const statuses = await get(`commits/${pr.head.sha}/statuses?per_page=100`);
      const status = statuses.find((item) => item.context === 'design-verification');
      if (
        status?.state !== 'success' ||
        status.target_url !== `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${run.id}`
      )
        throw new Error('PR no longer points at this verified commit.');
      readyEnv = {
        ...mailEnv,
        DESIGN_PR_NUMBER: match[1],
        DESIGN_PR_URL: `https://github.com/${env.GITHUB_REPOSITORY}/pull/${match[1]}`,
        DESIGN_HEAD_SHA: pr.head.sha,
      };
      // Allow up to five minutes for the preview to become available.
      for (let attempt = 0; attempt < PREVIEW_ATTEMPTS; attempt++) {
        try {
          previewUrl = await resolvePreviewUrl(readyEnv, request);
          break;
        } catch (error) {
          if (attempt === PREVIEW_ATTEMPTS - 1) throw error;
          await wait(PREVIEW_INTERVAL_MS);
        }
      }
      const current = await get(`pulls/${match[1]}`);
      if (current.state !== 'open' || current.head?.sha !== readyEnv.DESIGN_HEAD_SHA)
        throw new Error('PR changed while waiting for preview.');
    } catch {
      return fail();
    }
    return deliver(`ready:${match[1]}:${readyEnv.DESIGN_HEAD_SHA}`, previewUrl);
  }
  // Ignore duplicate claims and successful handoffs to verification.
  const claim = jobs.find((job) => job.name === 'claim');
  if (
    claim?.conclusion === 'success' &&
    claim.steps?.some(
      (step) =>
        step.name === 'Transfer approved input to isolated planner job' &&
        step.conclusion === 'skipped',
    )
  )
    return null;
  const published = jobs.find((job) => job.name === 'publish');
  if (
    published?.steps?.some(
      (step) => step.name === 'Open pull request' && step.conclusion === 'success',
    )
  )
    return null;
  return fail();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  console.log(await notifyDesignResult(event.workflow_run));
}
