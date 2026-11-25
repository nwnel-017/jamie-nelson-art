// Fixed ports only: the app, fixture API, and isolated browser debugger.
import { createServer, connect } from 'node:net';
for (const port of [3010, 54399, 9222]) {
  createServer(client => {
    const upstream = connect(port === 9222 ? 9223 : port, 'design-review-app');
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream).pipe(client);
  }).listen(port, '0.0.0.0');
}
