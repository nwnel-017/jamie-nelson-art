import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export async function resolvePreviewUrl(env = process.env, request = fetch) {
  const repository = required(env, 'GITHUB_REPOSITORY');
  const sha = required(env, 'DESIGN_HEAD_SHA');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(part => part === '.' || part === '..') || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('Invalid repository or reviewed commit.');
  }
  const token = required(env, 'GH_TOKEN');
  const environment = env.DESIGN_PREVIEW_ENVIRONMENT?.trim() || 'Preview';
  const get = async pathname => {
    const response = await request(`https://api.github.com/repos/${repository}/${pathname}`, {
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
    });
    if (!response.ok) throw new Error(`Could not read preview deployment (HTTP ${response.status}).`);
    return response.json();
  };
  const deployments = await get(`deployments?sha=${sha}&per_page=100`);
  if (!Array.isArray(deployments)) throw new Error('Invalid preview deployment response.');
  for (const deployment of deployments) {
    if (deployment.sha !== sha || deployment.environment?.toLowerCase() !== environment.toLowerCase() ||
        !Number.isSafeInteger(deployment.id) || deployment.id <= 0) continue;
    const statuses = await get(`deployments/${deployment.id}/statuses?per_page=1`);
    const status = Array.isArray(statuses) ? statuses[0] : undefined;
    if (status?.state !== 'success' || !status.environment_url) continue;
    return httpsUrl(status.environment_url);
  }
  throw new Error(`No ready HTTPS ${environment} deployment exists for the reviewed commit. Rerun notification after the preview is ready.`);
}

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export async function sendDesignReadyEmail(env = process.env, request = fetch) {
  const apiKey = required(env, 'RESEND_API_KEY');
  const from = required(env, 'RESEND_FROM_EMAIL');
  const to = required(env, 'ADMIN_EMAIL');
  const prNumber = required(env, 'DESIGN_PR_NUMBER');
  const sha = required(env, 'DESIGN_HEAD_SHA');
  const prUrl = httpsUrl(required(env, 'DESIGN_PR_URL'));
  if (!/^[1-9][0-9]*$/.test(prNumber) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid pull request number or reviewed commit.');
  const previewUrl = await resolvePreviewUrl(env, request);
  const response = await request('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `design-ready/${prNumber}/${sha}` },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Website changes are ready to review (PR #${prNumber})`,
      html: `<p>Your site changes are ready to review.</p><p><a href="${escapeHtml(previewUrl)}">Open the preview</a></p><p><a href="${escapeHtml(prUrl)}">Review the pull request</a></p>`,
      text: `Your site changes are ready to review.\n\nPreview: ${previewUrl}\nPull request: ${prUrl}`,
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) throw new Error('Resend did not return an email ID.');
  return result.id;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Ready-for-review email accepted by Resend: ${await sendDesignReadyEmail()}`);
}
