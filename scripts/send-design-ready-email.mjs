import { setTimeout as delay } from 'node:timers/promises';

function required(env, key) {
  const value = env[key]?.trim();
  if (!value || /[\r\n]/.test(value)) throw new Error(`Missing or invalid ${key}.`);
  return value;
}

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Preview and pull request links must use HTTPS without credentials.');
  }
  return url.toString();
}

// Find the preview URL for this commit; deployment does not need to be ready yet.
export async function resolvePreviewUrl(env = process.env, request = fetch) {
  const repository = required(env, 'GITHUB_REPOSITORY');
  const sha = required(env, 'DESIGN_HEAD_SHA');
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/.test(repository) ||
    repository.split('/').some((part) => part === '.' || part === '..') ||
    !/^[0-9a-f]{40}$/.test(sha)
  ) {
    throw new Error('Invalid repository or reviewed commit.');
  }
  const token = required(env, 'GH_TOKEN');
  const environment = env.DESIGN_PREVIEW_ENVIRONMENT?.trim() || 'Preview';
  const get = async (pathname) => {
    const response = await request(`https://api.github.com/repos/${repository}/${pathname}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
    });
    if (!response.ok)
      throw new Error(`Could not read preview deployment (HTTP ${response.status}).`);
    return response.json();
  };
  const deployments = await get(`deployments?sha=${sha}&per_page=100`);
  if (!Array.isArray(deployments)) throw new Error('Invalid preview deployment response.');
  for (const deployment of deployments) {
    if (
      deployment.sha !== sha ||
      deployment.environment?.toLowerCase() !== environment.toLowerCase() ||
      !Number.isSafeInteger(deployment.id) ||
      deployment.id <= 0
    )
      continue;
    const statuses = await get(`deployments/${deployment.id}/statuses?per_page=1`);
    const status = Array.isArray(statuses) ? statuses[0] : undefined;
    if (['failure', 'error'].includes(status?.state)) throw new Error('Preview deployment failed.');
    if (status?.state === 'inactive' || !status?.environment_url) continue;
    return httpsUrl(status.environment_url);
  }
  return null;
}

const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

function failureContent(job) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job))
    throw new Error('Invalid technical job ID.');
  return {
    subject: 'Something went wrong updating your site',
    text: `Something went wrong while updating your site. Please contact the developer for help.\n\nRequest reference: ${job}`,
    html: `<p>Something went wrong while updating your site. Please contact the developer for help.</p><p>Request reference: ${job}</p>`,
  };
}

function readyContent(env, previewUrl) {
  const prNumber = required(env, 'DESIGN_PR_NUMBER');
  const sha = required(env, 'DESIGN_HEAD_SHA');
  const prUrl = httpsUrl(required(env, 'DESIGN_PR_URL'));
  if (!/^[1-9][0-9]*$/.test(prNumber) || !/^[0-9a-f]{40}$/.test(sha))
    throw new Error('Invalid pull request number or reviewed commit.');
  const preview = httpsUrl(previewUrl);
  return {
    subject: `Website changes are ready for approval (PR #${prNumber})`,
    html: `<p>Your site changes are ready for approval.</p><p>The preview may take a few minutes to become available.</p><p><a href="${escapeHtml(preview)}">Open the preview</a></p><p><a href="${escapeHtml(prUrl)}">Review the pull request</a></p>`,
    text: `Your site changes are ready for approval.\nThe preview may take a few minutes to become available.\n\nPreview: ${preview}\nPull request: ${prUrl}`,
  };
}

// Save the entire message so configuration changes cannot alter a delivery retry.
export function createResultEmail(outcome, env, previewUrl) {
  if (!['ready', 'failure'].includes(outcome)) throw new Error('Invalid email outcome.');
  return {
    outcome,
    message: {
      from: required(env, 'RESEND_FROM_EMAIL'),
      to: [required(env, 'ADMIN_EMAIL')],
      ...(outcome === 'ready'
        ? readyContent(env, previewUrl)
        : failureContent(required(env, 'DESIGN_JOB_ID'))),
    },
  };
}

export function sendSavedResultEmail(email, env, request = fetch, wait = delay) {
  const job = required(env, 'DESIGN_JOB_ID');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job))
    throw new Error('Invalid technical job ID.');
  return sendEmail(env, request, `design-result/${job}`, email.message, wait);
}

async function sendEmail(env, request, key, content, wait = delay) {
  const apiKey = required(env, 'RESEND_API_KEY');
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await request('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify(content),
      });
    } catch {
      if (attempt === 2)
        throw new Error('Could not reach the email provider after three attempts.');
      await wait(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 2) break;
    await wait(1000 * 2 ** attempt);
  }
  if (!response.ok) throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id)
    throw new Error('Resend did not return an email ID.');
  return result.id;
}
