// Keep browser automation and its audit outside the generated app and browser containers.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export async function capturePage(page, size) {
  const before = page.url();
  if (new URL(before).origin !== 'http://127.0.0.1:3010') throw new Error('Only local app pages can be inspected');
  let changed = false;
  const navigated = frame => { if (frame === page.mainFrame()) changed = true; };
  page.on('framenavigated', navigated);
  try {
    if (size) await page.setViewportSize(size);
    const pixels = await page.screenshot({ type: 'png' });
    if (changed || page.url() !== before || page.isClosed()) throw new Error('Page changed during visual inspection');
    return { page: before, pixels };
  } finally {
    page.off('framenavigated', navigated);
  }
}

function main() {
  const endpoint = process.env.DESIGN_BROWSER_CDP;
  if (!endpoint) throw new Error('An isolated browser endpoint is required');
  const args = process.argv.slice(2);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/mcp/cli.js', import.meta.url)), '--cdp-endpoint', endpoint, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  const tools = new Set(['browser_navigate', 'browser_snapshot', 'browser_take_screenshot', 'browser_click', 'browser_hover', 'browser_resize', 'browser_close', 'browser_wait_for', 'browser_console_messages', 'browser_network_requests', 'browser_press_key', 'browser_select_option']);
  const input = createInterface({ input: process.stdin });
  let browser;
  const reply = message => process.stdout.write(JSON.stringify(message) + '\n');

  async function capture() {
    browser ??= await chromium.connectOverCDP(endpoint);
    const pages = browser.contexts().flatMap(context => context.pages());
    if (pages.length !== 1) throw new Error('Visual inspection requires one active page');
    const size = args[args.indexOf('--viewport-size') + 1]?.match(/^(\d+)x(\d+)$/);
    const { page, pixels } = await capturePage(pages[0], size && { width: Number(size[1]), height: Number(size[2]) });
    appendFileSync(process.env.DESIGN_BROWSER_AUDIT, JSON.stringify({ commit: process.env.DESIGN_BROWSER_COMMIT, page, tool: 'browser_take_screenshot', visual: true }) + '\n');
    return { content: [{ type: 'image', mimeType: 'image/png', data: pixels.toString('base64') }] };
  }
  input.on('line', async line => {
    const message = JSON.parse(line);
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      if (!tools.has(name)) {
        reply({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Only design inspection tools are allowed' } });
        return;
      }
      if (message.params.arguments) delete message.params.arguments.filename;
      if (name === 'browser_take_screenshot') {
        try { reply({ jsonrpc: '2.0', id: message.id, result: await capture() }); }
        catch (error) { reply({ jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
        return;
      }
    }
    child.stdin.write(JSON.stringify(message) + '\n');
  });
  child.stdout.pipe(process.stdout);
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { input.close(); process.exit(code ?? 1); });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  input.on('close', () => child.stdin.end());
}
if (process.argv[1]?.endsWith('/design-browser-mcp.mjs')) main();
