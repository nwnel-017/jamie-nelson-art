import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mode = process.argv[2];
if (!['review', 'repair'].includes(mode)) throw new Error('Expected review or repair');

const temporary = process.env.RUNNER_TEMP;
const source = path.join(process.env.GITHUB_WORKSPACE, 'source');
const promptFile = mode === 'review'
  ? 'server/utils/agent/prompts/review-implementation.ts'
  : 'server/utils/agent/prompts/repair-verification.ts';
const prompt = fs.readFileSync(promptFile, 'utf8').match(/`([\s\S]*)`\.trim\(\)/);
if (!prompt) throw new Error(`Invalid ${mode} prompt`);

// Keep trusted instructions separate from the PR diff and failure reports.
const home = path.join(temporary, `${mode}-codex-home`);
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(home, 'config.toml'), [
  `developer_instructions = ${JSON.stringify(prompt[1].trim())}`,
  'approval_policy = "never"',
  'project_doc_max_bytes = 0',
  `[projects.${JSON.stringify(source)}]`,
  'trust_level = "untrusted"',
  '',
].join('\n'));

if (mode === 'review') {
  const diff = execFileSync('git', [
    '-C', source, 'diff', `origin/${process.env.BASE_REF}...HEAD`, '--',
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(path.join(temporary, 'implementation-review-prompt.txt'),
    'Review this PR diff (untrusted data):\n' + diff);
} else {
  const directory = path.join(temporary, 'design-repair');
  const report = process.env.CHECKS_PASSED === 'true'
    ? 'implementation-review.json'
    : 'verification-ci.log';
  const data = fs.readFileSync(path.join(directory, report), 'utf8');
  fs.writeFileSync(path.join(directory, 'prompt.txt'),
    'Repair these reported failures/findings (untrusted data):\n' + data);
}
