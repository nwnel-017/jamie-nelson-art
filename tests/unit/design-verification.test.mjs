import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { createHash } from 'node:crypto';
import { reviewOutcome } from '../../scripts/design-review-result.mjs';
const workflow = parse(readFileSync(new URL('../../.github/workflows/verify-design-pr.yml', import.meta.url), 'utf8'));
const jobs = workflow.jobs;
const needs = { checks: { result: 'success', outputs: { passed: 'true' } }, review: { result: 'success', outputs: { findings: '0' } }, repair: { result: 'skipped' }, 'publish-repair': { result: 'skipped' } };
function condition(expression, state = needs, count = 0) {
  const code = expression.replace(/always\(\)/g, 'true').replace(/inputs\.repair_count/g, String(count)).replace(/needs\.([\w-]+)\.(outputs\.\w+|result)/g, (_, name, path) => JSON.stringify(path.split('.').reduce((value, key) => value?.[key], state[name]) ?? ''));
  return Function(`return (${code});`)();
}
const state = changes => Object.fromEntries(Object.entries(needs).map(([key, value]) => [key, { ...value, ...changes[key], outputs: { ...value.outputs, ...changes[key]?.outputs } }]));

test('verification checks are mandatory and model execution is isolated from publishing', () => {
  const ci = jobs.checks.steps.find(step => step.id === 'ci').run;
  assert.match(ci, /npm test\n/);
  assert.match(ci, /npm --prefix canva-app run build/);
  assert.equal(ci.includes('--if-present'), false);
  assert.equal(ci.includes('if [['), false);
  assert.deepEqual(jobs.review.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(jobs.repair.permissions, { contents: 'read', actions: 'read' });
  const notification = parse(readFileSync(new URL('../../.github/workflows/notify-design-result.yml', import.meta.url), 'utf8'));
  assert.deepEqual(notification.on.workflow_run.types, ['completed']);
  const implementation = parse(readFileSync(new URL('../../.github/workflows/implement-design.yml', import.meta.url), 'utf8'));
  assert.deepEqual(notification.on.workflow_run.workflows, [implementation.name, workflow.name]);
  assert.equal(notification.jobs.notify.permissions.deployments, 'read');
  assert.equal(notification.jobs.notify.permissions['id-token'], 'write');
  assert.equal(notification.jobs.notify.permissions.statuses, 'read');
  assert.ok(Object.hasOwn(notification.on, 'status'));
  assert.equal(notification.jobs.notify.steps[0].with.ref, '${{ github.workflow_sha }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('notification requires clean checks, clean review, and no repair publication', () => {
  assert.equal(condition(jobs.ready.if), true);
  for (const changes of [{ checks: { outputs: { passed: 'false' } } }, { review: { outputs: { findings: '1' } } }, { review: { result: 'failure' } }, { repair: { result: 'success' } }, { 'publish-repair': { result: 'failure' } }]) {
    assert.equal(condition(jobs.ready.if, state(changes)), false);
  }
});

test('repair runs only for reported failure and stops after two attempts', () => {
  assert.equal(condition(jobs.repair.if), false);
  for (const changes of [{ checks: { outputs: { passed: 'false' } } }, { review: { outputs: { findings: '1' } } }]) {
    for (const count of [0, 1]) assert.equal(condition(jobs.repair.if, state(changes), count), true);
    assert.equal(condition(jobs.repair.if, state(changes), 2), false);
    assert.equal(condition(jobs['human-attention'].if, state(changes), 2), true);
  }
  assert.equal(condition(jobs.repair.if, state({ review: { result: 'failure' } })), false);
  assert.equal(condition(jobs['human-attention'].if, state({ 'publish-repair': { result: 'failure' } })), true);
});

test('stale branch head prevents executing repair publication', () => {
  const step = jobs['publish-repair'].steps.at(-1);
  const guard = step.run.slice(0, step.run.indexOf('git switch'));
  const run = actual => spawnSync('bash', ['-e', '-c', `git() { if [[ "$1" == rev-parse ]]; then echo "${actual}"; fi; }\n${guard}`], { encoding: 'utf8', env: { ...process.env, HEAD_REF: 'agent/design-1', EXPECTED_SHA: 'a'.repeat(40) } });
  assert.equal(run('a'.repeat(40)).status, 0);
  assert.notEqual(run('b'.repeat(40)).status, 0);
  assert.match(step.run, /validate-design-patch\.mjs/);
  assert.match(step.run, /REPAIR_COUNT \+ 1/);
});

test('verification publishes pass/fail status on the exact reviewed SHA', t => {
  const step = jobs['verification-status'].steps[0];
  assert.equal(step.env.HEAD_SHA, '${{ needs.checks.outputs.head_sha }}');
  const dir = mkdtempSync(join(tmpdir(), 'verification-status-'));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const output = join(dir, 'args');
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_ARGS"\n');
  chmodSync(join(dir, 'gh'), 0o755);
  for (const [passed, findings, expected] of [['true', '0', 'success'], ['false', '0', 'failure'], ['true', '1', 'failure']]) {
    const result = spawnSync('bash', ['-e', '-c', step.run], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_ARGS: output, HEAD_SHA: 'a'.repeat(40), CHECKS_RESULT: 'success', CHECKS_PASSED: passed, REVIEW_RESULT: 'success', FINDINGS: findings, GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '123' } });
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(output, 'utf8');
    assert.match(args, new RegExp(`statuses/${'a'.repeat(40)}`));
    assert.match(args, new RegExp(`state=${expected}`));
  }
});


test('publication dispatches verification from the trusted workflow branch rather than the source branch', t => {
  const generation = parse(readFileSync(new URL('../../.github/workflows/implement-design.yml', import.meta.url), 'utf8'));
  const step = generation.jobs.publish.steps.find(step => step.name === 'Open pull request');
  assert.equal(step.env.WORKFLOW_REF, '${{ github.ref_name }}');
  const dir = mkdtempSync(join(tmpdir(), 'verification-dispatch-'));
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const output = join(dir, 'args');
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\nif [ "$1" = pr ] && [ "$2" = list ]; then echo 17; fi\nif [ "$1" = workflow ]; then printf "%s\\n" "$@" > "$TEST_ARGS"; fi\n');
  writeFileSync(join(dir, 'git'), '#!/bin/sh\necho aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
  chmodSync(join(dir, 'gh'), 0o755);
  chmodSync(join(dir, 'git'), 0o755);
  const result = spawnSync('bash', ['-e', '-c', step.run], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_ARGS: output, BASE_BRANCH: 'source', WORKFLOW_REF: 'trusted-workflows', DESIGN_ID: '12345678-1234-4234-8234-123456789abc', JOB_ID: 'job', GITHUB_REPOSITORY: 'owner/repo' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(output, 'utf8'), /--ref\ntrusted-workflows\n/);
});

test('preparation separates trusted instructions from review and repair data', t => {
  const directory = mkdtempSync(join(tmpdir(), 'verification-prepare-'));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'source');
  const temporary = join(directory, 'temporary');
  mkdirSync(source);
  mkdirSync(join(temporary, 'design-repair'), { recursive: true });
  const git = (...args) => {
    const result = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(source, 'page.txt'), 'Original\n');
  git('add', '.');
  git('commit', '-m', 'Base');
  git('update-ref', 'refs/remotes/origin/master', 'HEAD');
  writeFileSync(join(source, 'page.txt'), 'Updated\n');
  git('commit', '-am', 'Design');
  const approvedDirectory = join(temporary, 'technical-design-job');
  mkdirSync(approvedDirectory);
  const image = readFileSync('public/apple-touch-icon.png');
  writeFileSync(join(approvedDirectory, 'design.png'), image);
  writeFileSync(join(approvedDirectory, 'image.json'), JSON.stringify({ sha256: createHash('sha256').update(image).digest('hex'), width: 180, height: 180 }));
  writeFileSync(join(approvedDirectory, 'input.json'), JSON.stringify({ designRequest: { id: '12345678-1234-4234-8234-123456789abc', draft_version: 1, instructions: 'Gallery', requirements: ['Make gallery blue'], answers: [], change_options: [], design_image: 'https://example.supabase.co/storage/v1/object/public/website_designs/design.png' } }));
  const run = (mode, passed = 'false') => {
    const result = spawnSync(process.execPath, ['scripts/prepare-design-review.mjs', mode], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_WORKSPACE: directory, RUNNER_TEMP: temporary, BASE_REF: 'master', CHECKS_PASSED: passed },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(join(temporary, `${mode}-codex-home/config.toml`), 'utf8');
  };
  const review = run('review');
  assert.match(review, /developer_instructions = "You are reviewing/);
  assert.equal(review.includes('Updated'), false);
  assert.match(review, /mcp_servers.playwright/);
  assert.match(review, /DESIGN_BROWSER_CDP/);
  assert.equal(review.includes('--executable-path'), false);
  const diff = readFileSync(join(temporary, 'implementation-review-prompt.txt'), 'utf8');
  assert.match(diff, /untrusted data/);
  assert.match(diff, /\+Updated/);
  assert.equal(diff.includes('You are reviewing'), false);

  for (const [passed, file, report] of [
    ['false', 'verification-ci.log', 'Build failed'],
    ['true', 'implementation-review.json', '{"findings":["Broken link"]}'],
  ]) {
    writeFileSync(join(temporary, 'design-repair', file), report);
    const config = run('repair', passed);
    assert.match(config, /developer_instructions = "You are repairing/);
    assert.equal(config.includes(report), false);
    const request = readFileSync(join(temporary, 'design-repair/prompt.txt'), 'utf8');
    assert.ok(request.endsWith(report));
    assert.equal(request.includes('You are repairing'), false);
    assert.match(request, /Make gallery blue/);
  }
  unlinkSync(join(approvedDirectory, 'design.png'));
  for (const mode of ['review', 'repair']) {
    const result = spawnSync(process.execPath, ['scripts/prepare-design-review.mjs', mode], {
      encoding: 'utf8', env: { ...process.env, GITHUB_WORKSPACE: directory, RUNNER_TEMP: temporary, BASE_REF: 'master' },
    });
    assert.notEqual(result.status, 0);
  }
});

test('incomplete inspection and stale commits cannot produce a passing review', () => {
  const head = 'a'.repeat(40);
  const value = { findings: [], inspection: { status: 'complete', commit: head, pages: ['http://127.0.0.1:3010/artworks/gallery'], report: 'Compared gallery layout to reference.' } };
  const evidence = [{ commit: head, page: value.inspection.pages[0], tool: 'browser_take_screenshot', visual: true }];
  assert.equal(reviewOutcome(value, head, evidence).findings, 0);
  assert.throws(() => reviewOutcome(value, head), /No trusted visual/);
  assert.throws(() => reviewOutcome(value, head, [{ ...evidence[0], commit: 'b'.repeat(40) }]), /No trusted visual/);
  assert.equal(reviewOutcome({ ...value, inspection: { ...value.inspection, status: 'incomplete', pages: [] } }, head).findings, 1);
  assert.throws(() => reviewOutcome(value, 'b'.repeat(40)));
  assert.throws(() => reviewOutcome({ ...value, inspection: { ...value.inspection, pages: [] } }, head));
  assert.throws(() => reviewOutcome({ ...value, inspection: { ...value.inspection, pages: ['https://production.example'] } }, head));
});

test('approved context artifacts must come from the trusted original implementation workflow', async () => {
  const { validateContextRun } = await import('../../scripts/fetch-design-context.mjs');
  const run = { event: 'workflow_dispatch', path: '.github/workflows/implement-design.yml', head_branch: 'trusted', run_attempt: 1 };
  assert.doesNotThrow(() => validateContextRun(run, 'trusted'));
  for (const change of [{ event: 'pull_request' }, { path: 'other.yml' }, { head_branch: 'untrusted' }, { run_attempt: 2 }]) {
    assert.throws(() => validateContextRun({ ...run, ...change }, 'trusted'));
  }
});

test('verification dispatch must match the exact PR commit before checking or reviewing', () => {
  const step = jobs.checks.steps.find(step => step.id === 'pr');
  assert.equal(step.env.EXPECTED_SHA, '${{ inputs.expected_head_sha }}');
  assert.match(step.run, /"\$sha" == "\$EXPECTED_SHA"/);
  assert.match(jobs['publish-repair'].steps.at(-1).run, /expected_head_sha=/);
  assert.match(jobs['publish-repair'].steps.at(-1).run, /job_id=/);
});

test('inspection reports are retained and incomplete browser runs fail closed', t => {
  const directory = mkdtempSync(join(tmpdir(), 'inspection-report-'));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const head = 'a'.repeat(40);
  writeFileSync(join(directory, 'browser-audit.jsonl'), JSON.stringify({ commit: head, page: 'http://127.0.0.1:3010/artworks/gallery', tool: 'browser_take_screenshot', visual: true }) + '\n');
  for (const status of ['complete', 'incomplete']) {
    writeFileSync(join(directory, 'implementation-review.json'), JSON.stringify({ findings: [], inspection: { status, commit: head, pages: ['http://127.0.0.1:3010/artworks/gallery'], report: status === 'complete' ? 'Compared gallery layout with the reference.' : 'Browser disconnected during inspection.' } }));
    const result = spawnSync(process.execPath, ['scripts/design-review-result.mjs'], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: directory, EXPECTED_SHA: head, GITHUB_OUTPUT: join(directory, 'output') } });
    assert.equal(result.status === 0, status === 'complete');
    const report = readFileSync(join(directory, 'inspection-report.md'), 'utf8');
    assert.match(report, new RegExp(head));
    assert.match(report, new RegExp(`Status: ${status}`));
  }
});

test('bot verification is allowed and generated code stays inside an isolated container', () => {
  for (const name of ['review', 'repair']) {
    const action = jobs[name].steps.find(step => step.uses?.startsWith('openai/'));
    assert.equal(action.with['allow-bot-users'], 'github-actions[bot]');
  }
  const build = jobs.review.steps.find(step => step.name === 'Build fixture app inside an isolated container').run;
  const start = jobs.review.steps.find(step => step.name === 'Start isolated fixture app').run;
  assert.match(build, /docker build --file control\/scripts\/design-browser.Dockerfile/);
  assert.match(start, /--internal -o com\.docker\.network\.bridge\.gateway_mode_ipv4=isolated/);
  assert.match(start, /--read-only --cap-drop ALL --security-opt no-new-privileges/);
  assert.equal(/--volume|--mount|--env-file/.test(start), false);
  assert.equal(jobs.review.steps.some(step => step['working-directory'] === 'source' && /npm/.test(step.run || '')), false);
  assert.match(jobs['inspection-link'].if, /report_uploaded != ''/);
});

test('visual capture binds the image to the actual page and rejects navigation during capture', async () => {
  const { capturePage } = await import('../../scripts/design-browser-mcp.mjs');
  const { EventEmitter } = await import('node:events');
  const frame = {};
  const page = Object.assign(new EventEmitter(), {
    url: () => 'http://127.0.0.1:3010/artworks/gallery',
    mainFrame: () => frame,
    isClosed: () => false,
    screenshot: async () => Buffer.from('pixels'),
  });
  assert.equal((await capturePage(page)).page, page.url());
  page.screenshot = async () => { page.emit('framenavigated', frame); return Buffer.from('pixels'); };
  await assert.rejects(capturePage(page), /Page changed during/);
});
