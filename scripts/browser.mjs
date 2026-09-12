import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const application = path.resolve(process.env.NEONEI_TEST_BUNDLE ?? root);
const require = createRequire(path.join(application, 'backend/package.json'));
const { createApp } = require(path.join(application, 'backend/dist/app.js'));
const server = await new Promise((resolve, reject) => {
  const listener = createApp({ catalog: path.join(root, 'fixtures/catalog'), web: path.join(application, 'frontend/dist') })
    .listen(0, '127.0.0.1', () => resolve(listener));
  listener.once('error', reject);
});
const frontend = path.join(root, 'frontend');
const cli = createRequire(path.join(frontend, 'package.json')).resolve('@playwright/test/cli');
let child;
const stop = () => child?.kill('SIGTERM');
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
    cwd: frontend, shell: false, windowsHide: true, stdio: 'inherit',
    env: { ...process.env, NEONEI_TEST_URL: `http://127.0.0.1:${server.address().port}` },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
