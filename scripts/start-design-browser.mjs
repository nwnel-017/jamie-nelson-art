import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';

const browser = spawn(chromium.executablePath(), [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=9222', '--user-data-dir=/tmp/design-browser',
], { stdio: 'inherit' });
// Chromium's debugger remains loopback-only; expose only this fixed target to the trusted proxy.
createServer(client => {
  const upstream = connect(9222, '127.0.0.1');
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.pipe(upstream).pipe(client);
}).listen(9223, '0.0.0.0');
browser.on('exit', code => process.exit(code ?? 1));
process.on('SIGTERM', () => browser.kill('SIGTERM'));
