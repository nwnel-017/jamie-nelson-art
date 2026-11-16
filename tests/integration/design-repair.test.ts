import { test, type TestContext } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = parse(readFileSync(join(root, '.github/workflows/verify-design-pr.yml'), 'utf8'));
const publish = workflow.jobs['publish-repair'].steps.at(-1).run;
// Exercise publication locally, stopping before the GitHub verification dispatch.
const command = publish.slice(0, publish.indexOf('gh workflow'));
const branch = 'agent/design-12345678-1234-4234-8234-123456789abc';
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'design-repair-'));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, 'remote.git');
  const source = join(directory, 'source');
  const author = join(directory, 'author');
  const temporary = join(directory, 'temporary');
  git(directory, 'init', '--bare', '--quiet', remote);
  git(directory, 'clone', '--quiet', remote, source);
  git(source, 'config', 'user.name', 'Fixture');
  git(source, 'config', 'user.email', 'fixture@example.test');
  git(source, 'switch', '-c', branch);
  mkdirSync(join(source, 'app/pages'), { recursive: true });
  writeFileSync(join(source, 'app/pages/gallery.vue'), '<template>Original</template>\n');
  git(source, 'add', '.');
  git(source, 'commit', '--quiet', '-m', 'Original design');
  git(source, 'push', '--quiet', 'origin', branch);
  const expected = git(source, 'rev-parse', 'HEAD');
  git(directory, 'clone', '--quiet', '--branch', branch, remote, author);
  writeFileSync(join(author, 'app/pages/gallery.vue'), '<template>Repaired</template>\n');
  mkdirSync(join(temporary, 'design-repair'), { recursive: true });
  writeFileSync(join(temporary, 'design-repair/changes.patch'),
    execFileSync('git', ['diff', '--binary'], { cwd: author, encoding: 'utf8' }));
  symlinkSync(root, join(directory, 'control'), 'dir');
  const run = (script = command) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    cwd: source,
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: temporary, EXPECTED_SHA: expected, HEAD_REF: branch, DESIGN_ID: branch.slice('agent/design-'.length) },
  });
  return { remote, source, author, expected, run };
}

test('valid presentation repair is validated, committed, and pushed', t => {
  const { remote, source, expected, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const head = git(remote, 'rev-parse', `refs/heads/${branch}`);
  assert.notEqual(head, expected);
  assert.equal(git(remote, 'rev-parse', `${head}^`), expected);
  assert.equal(git(remote, 'show', `${head}:app/pages/gallery.vue`), '<template>Repaired</template>');
  assert.equal(git(source, 'status', '--porcelain'), '');
});

test('stale repair is rejected without changing the advanced branch or checkout', t => {
  const { remote, source, author, expected, run } = fixture(t);
  writeFileSync(join(author, 'app/pages/gallery.vue'), '<template>Human update</template>\n');
  git(author, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-am', 'Human update');
  git(author, 'push', '--quiet', 'origin', branch);
  const advanced = git(remote, 'rev-parse', `refs/heads/${branch}`);
  const result = run(command.slice(0, command.indexOf('git switch')));
  assert.notEqual(result.status, 0);
  assert.equal(git(remote, 'rev-parse', `refs/heads/${branch}`), advanced);
  assert.equal(git(source, 'rev-parse', 'HEAD'), expected);
  assert.equal(readFileSync(join(source, 'app/pages/gallery.vue'), 'utf8'), '<template>Original</template>\n');
  assert.equal(git(source, 'status', '--porcelain'), '');
});
