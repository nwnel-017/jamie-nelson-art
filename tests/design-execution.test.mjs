import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateTechnicalInstructions } from '../scripts/technical-instructions-validation.mjs';

const script = fileURLToPath(new URL('../scripts/prepare-design-execution.mjs', import.meta.url));
const valid = () => ({ objective: 'Blue gallery', tasks: [{ id: 'color', description: 'Set gallery color', files: ['app/pages/gallery.vue'], acceptance_criteria: ['Gallery is blue'] }], verification_steps: ['Run build'], constraints: [], blockers: [] });

function run(t, data, raw = false) {
  const dir = mkdtempSync(join(tmpdir(), 'design-execution-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const job = join(dir, 'technical-design-job');
  mkdirSync(job);
  writeFileSync(join(job, 'technical-instructions.json'), raw ? data : JSON.stringify(data));
  const prompt = join(dir, 'prompt.ts');
  writeFileSync(prompt, '// Prompt comment\nexport const TECHNICAL_EXECUTION_PROMPT = `Follow the scope.`.trim();\n');
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: dir, GITHUB_WORKSPACE: dir, TECHNICAL_EXECUTION_PROMPT_FILE: prompt } });
  return { result, job };
}

test('valid plan creates isolated execution configuration and data prompt', t => {
  const plan = valid();
  const { result, job } = run(t, plan);
  assert.equal(result.status, 0, result.stderr);
  const config = readFileSync(join(job, 'executor-home/config.toml'), 'utf8');
  assert.match(config, /developer_instructions = "Follow the scope\."/);
  assert.match(config, /trust_level = "untrusted"/);
  assert.equal(config.includes('Blue gallery'), false);
  assert.match(readFileSync(join(job, 'execution-prompt.txt'), 'utf8'), /Blue gallery/);
});

test('blockers stop execution before any config or prompt is written', t => {
  for (const tasks of [[], valid().tasks]) {
    const { result, job } = run(t, { ...valid(), tasks, blockers: ['Missing approved asset'] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unresolved blockers/);
    assert.equal(existsSync(join(job, 'executor-home')), false);
    assert.equal(existsSync(join(job, 'execution-prompt.txt')), false);
  }
});

test('malformed, oversized, empty, or unknown instruction data fails closed', t => {
  for (const data of ['not JSON', ' '.repeat(128 * 1024 + 1)]) {
    const { result, job } = run(t, data, true);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(job, 'executor-home')), false);
  }
  const plan = valid();
  for (const data of [null, [], { ...plan, extra: true }, { ...plan, tasks: [] }, { ...plan, objective: ' ' }, { ...plan, tasks: [plan.tasks[0], plan.tasks[0]] }, { ...plan, constraints: Array(101).fill('x') }, { ...plan, constraints: ['x'.repeat(4001)] }, { ...plan, tasks: [{ ...plan.tasks[0], acceptance_criteria: [] }] }, { ...plan, tasks: [{ ...plan.tasks[0], extra: true }] }, { ...plan, tasks: [{ ...plan.tasks[0], files: Array(51).fill('app/x.vue') }] }]) {
    assert.throws(() => validateTechnicalInstructions(data), /Invalid technical instructions/);
  }
});

test('instruction file paths cannot escape the checkout', () => {
  for (const name of ['/etc/passwd', '../secret', 'app/../secret', './app/x.vue', 'app\\x.vue', 'app/\0x.vue', 'C:/secret', 'app//x.vue']) {
    const plan = valid();
    plan.tasks[0].files = [name];
    assert.throws(() => validateTechnicalInstructions(plan), /Invalid technical instructions/, name);
  }
});
