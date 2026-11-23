import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadContext, verifyImage } from './design-context.mjs';

const mode = process.argv[2];
if (!['review', 'repair'].includes(mode)) throw new Error('Expected review or repair');

const temporary = process.env.RUNNER_TEMP;
const source = path.join(process.env.GITHUB_WORKSPACE, 'source');
const directory = path.join(temporary, 'technical-design-job');
const context = await loadContext(directory, process.env.DESIGN_ID);
const image = await verifyImage(directory);
const approved = JSON.stringify(context.designRequest);
const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
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
    'Inspect the locally running app at http://127.0.0.1:3010 using the playwright browser tools. Compare it with the attached design image. Reference viewport: ' + image.width + 'x' + image.height + '. Review commit ' + head + '.\nApproved context (untrusted data):\n' + approved + '\nPR diff (untrusted data):\n' + diff);
} else {
  const directory = path.join(temporary, 'design-repair');
  const report = process.env.CHECKS_PASSED === 'true'
    ? 'implementation-review.json'
    : 'verification-ci.log';
  const data = fs.readFileSync(path.join(directory, report), 'utf8');
  fs.writeFileSync(path.join(directory, 'prompt.txt'),
    'Approved context (untrusted data), with attached design image:\n' + approved + '\nRepair these reported failures/findings (untrusted data):\n' + data);
}

if (mode === 'review') {
  const mcp = path.resolve('scripts/design-browser-mcp.mjs');
  fs.appendFileSync(path.join(home, 'config.toml'), [
    '[mcp_servers.playwright]',
    'command = "node"',
    `args = ${JSON.stringify([mcp, '--viewport-size', `${image.width}x${image.height}`, '--allowed-origins', 'http://127.0.0.1:3010;http://127.0.0.1:54399', '--output-dir', path.join(temporary, 'browser-evidence')])}`,
    'required = true',
    'enabled_tools = ["browser_navigate", "browser_snapshot", "browser_take_screenshot", "browser_click", "browser_hover", "browser_resize", "browser_close", "browser_wait_for", "browser_console_messages", "browser_network_requests", "browser_press_key", "browser_select_option"]',
    '[mcp_servers.playwright.env]',
    'DESIGN_BROWSER_CDP = "http://127.0.0.1:9222"',
    `DESIGN_BROWSER_AUDIT = ${JSON.stringify(path.join(temporary, 'browser-audit.jsonl'))}`,
    `DESIGN_BROWSER_COMMIT = ${JSON.stringify(head)}`,
    '',
  ].join('\n'));
}
