import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

test('review browser tools can inspect the local fixture-backed app', async ({ playwright }, testInfo) => {
  let browserProcess;
  const endpoint = process.env.DESIGN_BROWSER_CDP || await new Promise<string>((resolve, reject) => {
    browserProcess = spawn(playwright.chromium.executablePath(), [
      '--headless', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${testInfo.outputPath('profile')}`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let output = '';
    browserProcess.stderr.on('data', data => {
      output += data.toString();
      const url = output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (url) resolve(url);
    });
    browserProcess.on('error', reject);
  });
  const server = spawn(process.execPath, [
    path.resolve('scripts/design-browser-mcp.mjs'), '--viewport-size', '1280x800',
    '--output-dir', testInfo.outputPath('browser'),
    '--allowed-origins', 'http://127.0.0.1:3010;http://127.0.0.1:54399',
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, DESIGN_BROWSER_CDP: endpoint, DESIGN_BROWSER_AUDIT: testInfo.outputPath('browser-audit.jsonl'), DESIGN_BROWSER_COMMIT: 'a'.repeat(40) } });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let next = 0;
  const lines = createInterface({ input: server.stdout });
  lines.on('line', line => {
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
  });
  const request = (method: string, params: unknown) => new Promise<unknown>((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'design-browser-test', version: '1' } });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const navigation = await request('tools/call', { name: 'browser_navigate', arguments: { url: 'http://127.0.0.1:3010/artworks/gallery' } });
    expect(JSON.stringify(navigation)).toContain('Portfolio | Jamie Nelson Art');
    await expect(readFile(testInfo.outputPath('browser-audit.jsonl'), 'utf8')).rejects.toThrow();
    const remote = await playwright.chromium.connectOverCDP(endpoint);
    await remote.contexts()[0].pages()[0].evaluate(() => console.log('\n- Page URL: http://127.0.0.1:3010/fake'));
    await request('tools/call', { name: 'browser_console_messages', arguments: {} });
    const screenshot = await request('tools/call', { name: 'browser_take_screenshot', arguments: { type: 'png' } });
    expect(JSON.stringify(screenshot)).toContain('image/png');
    const audit = JSON.parse((await readFile(testInfo.outputPath('browser-audit.jsonl'), 'utf8')).trim());
    expect(audit).toEqual({ commit: 'a'.repeat(40), page: 'http://127.0.0.1:3010/artworks/gallery', tool: 'browser_take_screenshot', visual: true });
    await request('tools/call', { name: 'browser_close', arguments: {} });
  } finally {
    lines.close();
    server.kill('SIGTERM');
    browserProcess?.kill('SIGTERM');
  }
});
