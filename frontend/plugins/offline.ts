import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, type Plugin, type ResolvedConfig } from 'vite';
import { build as bundle } from 'esbuild';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Application build inputs must not be links');
    return entry.isDirectory() ? files(file) : [file];
  }).sort();
}

export function offline(root: string): Plugin {
  const publicAssets = ['fonts', 'sounds', 'textures', 'native', 'placeholder.png', 'placeholder-fluid.png'];
  let config: ResolvedConfig;
  let build = '';
  const emitted = new Set<string>();
  return {
    name: 'catalog-offline-shell',
    apply: 'build',
    config(input, environment) {
      if (input.base && input.base !== '/') throw new Error('NeoNEI currently serves its application and API from the origin root');
      const project = path.resolve(root, '..');
      const source = [
        ...files(path.join(root, 'src')), ...files(path.join(root, 'plugins')),
        ...publicAssets.flatMap(name => {
          const entry = path.join(root, 'public', name);
          return name.includes('.') ? [entry] : files(entry);
        }),
        ...files(path.join(project, 'catalog/src')),
        ...['package.json', 'package-lock.json', 'catalog/package.json'].map(file => path.join(project, file)),
        ...['index.html', 'vite.config.ts', 'package.json'].map(file => path.join(root, file)),
      ];
      const digest = createHash('sha256').update(process.version + process.platform + process.arch + environment.mode);
      const env = loadEnv(environment.mode, root, 'VITE_');
      digest.update(JSON.stringify(Object.fromEntries(Object.entries(env).sort())));
      for (const file of [...new Set(source)].sort()) {
        if (!existsSync(file)) throw new Error('Offline build input missing: ' + file);
        digest.update(path.relative(project, file).replaceAll(path.sep, '/') + '\0').update(readFileSync(file));
      }
      build = digest.digest('hex');
      return { define: { __APP_BUILD__: JSON.stringify(build) } };
    },
    configResolved(value) { config = value; },
    buildStart() { emitted.clear(); },
    writeBundle(_options, output) {
      // Includes Vite's emitted worker chunks and lazy routes. Output directories
      // may contain older builds; their files do not belong to this shell.
      for (const file of Object.values(output)) emitted.add(file.fileName);
    },
    async closeBundle() {
      const output = path.resolve(config.root, config.build.outDir);
      const selected = new Set([...emitted].map(name => path.join(output, name)));
      // Ship the UI's static assets, never development pages or the retired worker.
      for (const name of publicAssets) {
        const source = path.join(root, 'public', name);
        if (existsSync(source)) {
          cpSync(source, path.join(output, name), { recursive: true });
          const current = name.includes('.') ? [source] : files(source);
          for (const file of current) selected.add(path.join(output, path.relative(path.join(root, 'public'), file)));
        }
      }
      const assets = [...selected].filter(file => !file.endsWith('.map') && path.basename(file) !== 'sw.js').sort();
      if (!selected.has(path.join(output, 'index.html'))) throw new Error('Offline application build has no emitted entry page');
      const bytes = assets.reduce((total, file) => total + readFileSync(file).byteLength, 0);
      if (assets.length > 512 || bytes > 32 * 1024 * 1024) throw new Error('Offline application shell exceeds its budget');
      const manifest = { build, files: assets.map(file => ({
        url: '/' + path.relative(output, file).split(path.sep).map(encodeURIComponent).join('/'),
        integrity: 'sha256-' + createHash('sha256').update(readFileSync(file)).digest('base64'),
      })) };
      const result = await bundle({ entryPoints: [path.join(root, 'src/offline/service.ts')], bundle: true,
        write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
        define: { __SHELL__: JSON.stringify(manifest) } });
      writeFileSync(path.join(output, 'sw.js'), result.outputFiles[0]!.contents);
    },
  };
}
