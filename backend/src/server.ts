import type { Server } from 'node:http';
import { createApp } from './app';
import { settings, type Settings } from './settings';

export async function start(config: Settings = settings()): Promise<Server> {
  const app = createApp(config);
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(config.port, config.host, () => resolve(listening));
    listening.once('error', reject);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (require.main === module) {
  void start().then(server => {
    console.info('NeoNEI listening', server.address());
    let stopping = false;
    const stop = (): void => {
      if (stopping) return;
      stopping = true;
      server.close(error => { if (error) { console.error(error); process.exitCode = 1; } });
      setTimeout(() => server.closeAllConnections(), 5_000).unref();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
