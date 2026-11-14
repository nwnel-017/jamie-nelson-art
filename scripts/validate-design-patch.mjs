// Run from trusted workflow code, against the publisher's source checkout.
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
const patch = process.argv[2];
if (!patch || statSync(patch).size > 10 * 1024 * 1024) throw new Error('Missing or oversized patch');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
if (git('status', '--porcelain').trim()) throw new Error('Publisher checkout must be clean');
git('apply', '--check', '--index', patch);
git('apply', '--index', patch);
const paths = git('diff', '--cached', '--name-only', '-z', '--no-renames').split('\0').filter(Boolean);
if (!paths.length) throw new Error('Empty patch');
for (const name of paths) {
  // Application presentation only. Backend, CI, scripts, manifests and auth require human changes.
  if (!/^(app|assets|public|components|pages|layouts)\//.test(name) ||
      name.split('/').some(part => part.startsWith('.') || /^(middleware|plugins|api)$/i.test(part)) ||
      /(?:auth|credential|secret|token|config)/i.test(name) ||
      !/\.(vue|css|scss|sass|less|png|jpe?g|webp|gif|avif|svg|ico|woff2?|ttf|otf|json|md)$/i.test(name)) {
    throw new Error(`Protected patch path: ${name}`);
  }
}
for (const record of git('diff', '--cached', '--raw', '-z', '--no-renames').split('\0')) {
  if (record.startsWith(':')) {
    const modes = record.slice(1).split(' ').slice(0, 2);
    if (modes.some(mode => !['000000', '100644'].includes(mode))) throw new Error('Executable, symlink or submodule changes are forbidden');
  }
}
console.log(`Validated ${paths.length} presentation file changes`);
