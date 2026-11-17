import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'vite';
import { offline } from '../plugins/offline.ts';

test('offline shell includes this build, workers and declared public files without stale output', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'neonei-offline-build-'));
  try {
    const root = path.join(project, 'frontend'), output = path.join(project, 'output');
    const inputs = {
      'package.json': '{}', 'package-lock.json': '{}', 'catalog/package.json': '{}',
      'catalog/src/index.ts': 'export {};', 'frontend/package.json': '{"type":"module"}',
      'frontend/vite.config.ts': 'export default {};', 'frontend/plugins/input.ts': 'export {};',
      'frontend/index.html': '<script type="module" src="/src/main.ts"></script>',
      'frontend/src/main.ts': 'new Worker(new URL("./worker.ts", import.meta.url), {type:"module"}); import("./page.ts");',
      'frontend/src/page.ts': 'console.log("current page");',
      'frontend/src/worker.ts': 'self.postMessage("current worker");',
      'frontend/src/offline/service.ts': 'globalThis.testShell = __SHELL__; ',
      'frontend/public/placeholder.png': 'placeholder', 'frontend/public/placeholder-fluid.png': 'fluid',
      'frontend/public/fonts/current.woff2': 'font', 'frontend/public/textures/current.png': 'texture',
      'frontend/public/sounds/current.mp3': 'sound', 'frontend/public/native/current.json': '{}',
      'output/web/obsolete.js': 'old chunk', 'output/fonts/removed.woff2': 'old font',
      'output/dev-only.html': 'do not publish', 'output/sw.js': 'old worker',
    };
    for (const [relative, contents] of Object.entries(inputs)) {
      const file = path.join(project, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    }
    const result = await build({ root, configFile: false, logLevel: 'silent',
      plugins: [offline(root)], build: { outDir: output, emptyOutDir: false, copyPublicDir: false, assetsDir: 'web' },
    });
    const context = {};
    runInNewContext(await readFile(path.join(output, 'sw.js'), 'utf8'), context);
    const manifest = context.testShell;
    const paths = manifest.files.map(file => file.url);
    assert.ok(paths.includes('/index.html'));
    assert.ok(paths.some(file => file.startsWith('/web/worker-')), 'worker missing');
    assert.ok(paths.some(file => file.startsWith('/web/page-')), 'lazy route missing');
    for (const name of ['/web/obsolete.js', '/fonts/removed.woff2', '/dev-only.html', '/sw.js'])
      assert.ok(!paths.includes(name), 'stale or undeclared output entered shell: ' + name);
    for (const file of result.output) if (!file.fileName.endsWith('.map'))
      assert.ok(paths.includes('/' + file.fileName), 'emitted file missing: ' + file.fileName);
    for (const file of manifest.files) {
      const bytes = await readFile(path.join(output, decodeURIComponent(file.url.slice(1))));
      assert.equal(file.integrity, 'sha256-' + createHash('sha256').update(bytes).digest('base64'));
    }
    assert.equal(await readFile(path.join(output, 'web/obsolete.js'), 'utf8'), 'old chunk', 'unowned file was deleted');
  } finally { await rm(project, { recursive: true, force: true }); }
});
