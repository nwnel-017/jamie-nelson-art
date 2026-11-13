import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
const workflow = parse(readFileSync(new URL('../.github/workflows/verify-design-pr.yml', import.meta.url), 'utf8'));
const jobs = workflow.jobs;
const needs = { checks: { result: 'success', outputs: { passed: 'true' } }, review: { result: 'success', outputs: { findings: '0' } }, repair: { result: 'skipped' }, 'publish-repair': { result: 'skipped' } };
function condition(expression, state = needs, count = 0) {
  const code = expression.replace(/always\(\)/g, 'true').replace(/inputs\.repair_count/g, String(count)).replace(/needs\.([\w-]+)\.(outputs\.\w+|result)/g, (_, name, path) => JSON.stringify(path.split('.').reduce((value, key) => value?.[key], state[name]) ?? ''));
  return Function(`return (${code});`)();
}
const state = changes => Object.fromEntries(Object.entries(needs).map(([key, value]) => [key, { ...value, ...changes[key], outputs: { ...value.outputs, ...changes[key]?.outputs } }]));

test('verification checks are mandatory and model execution is isolated from publishing', () => {
  const ci = jobs.checks.steps.find(step => step.id === 'ci').run;
  assert.match(ci, /npm run test:handoff\n/);
  assert.match(ci, /npm run test:planning\n/);
  assert.match(ci, /npm --prefix canva-app run build/);
  assert.equal(ci.includes('--if-present'), false);
  assert.equal(ci.includes('if [['), false);
  assert.deepEqual(jobs.review.permissions, { contents: 'read' });
  assert.deepEqual(jobs.repair.permissions, { contents: 'read' });
  assert.equal(jobs['notify-admin'].permissions.deployments, 'read');
  assert.equal(jobs['notify-admin'].steps.at(-1).env.DESIGN_PREVIEW_URL, undefined);
});

test('notification requires clean checks, clean review, and no repair publication', () => {
  assert.equal(condition(jobs['notify-admin'].if), true);
  for (const changes of [{ checks: { outputs: { passed: 'false' } } }, { review: { outputs: { findings: '1' } } }, { review: { result: 'failure' } }, { repair: { result: 'success' } }, { 'publish-repair': { result: 'failure' } }]) {
    assert.equal(condition(jobs['notify-admin'].if, state(changes)), false);
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
  t.after(() => rmSync(dir, { recursive: true, force: true }));
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
