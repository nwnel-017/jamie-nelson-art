import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const validator = fileURLToPath(new URL('../scripts/validate-design-patch.mjs', import.meta.url));
function patch(t, name, mode = 'file') {
  const dir = mkdtempSync(join(tmpdir(), 'design-patch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '--quiet');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '--allow-empty', '--quiet', '-m', 'base');
  mkdirSync(dirname(join(repo, name)), { recursive: true });
  if (mode === 'symlink') symlinkSync('/etc/passwd', join(repo, name));
  else {
    writeFileSync(join(repo, name), name.endsWith('.vue') ? '<template>Blue gallery</template>\n' : 'body { color: blue; }\n');
    if (mode === 'executable') chmodSync(join(repo, name), 0o755);
  }
  git('add', '--all');
  const file = join(dir, 'changes.patch');
  writeFileSync(file, git('diff', '--cached', '--binary'));
  git('reset', '--hard', '--quiet', 'HEAD');
  const result = spawnSync(process.execPath, [validator, file], { cwd: repo, encoding: 'utf8' });
  return { result, repo, git };
}

test('presentation patches apply successfully', t => {
  for (const name of ['app/pages/gallery.vue', 'app/assets/gallery.css']) {
    const { result, repo, git } = patch(t, name);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readFileSync(join(repo, name), 'utf8').length);
    assert.match(git('diff', '--cached', '--name-only'), /gallery/);
  }
});

test('workflow, backend, auth, and hidden paths are rejected', t => {
  for (const name of ['.github/workflows/ci.yml', 'server/api/change.ts', 'app/pages/auth.vue', 'app/middleware/check.vue', 'app/.hidden.vue', 'package.json']) {
    const { result } = patch(t, name);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /Protected patch path/);
  }
});

test('symlinks and executable presentation files are rejected', t => {
  for (const mode of ['symlink', 'executable']) {
    const { result } = patch(t, 'app/pages/gallery.vue', mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Executable, symlink or submodule changes are forbidden/);
  }
});
