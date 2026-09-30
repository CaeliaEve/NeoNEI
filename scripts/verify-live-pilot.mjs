// Verify existing game-produced catalogs. Never installs mods or starts game jobs.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(root, 'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const { createApp } = require(path.join(root, 'backend/dist/app.js'));
const [receiptPath, output] = process.argv.slice(2);
assert(receiptPath && output, 'Usage: node scripts/verify-live-pilot.mjs <pilot-receipt.json> <new-output-directory>');
await mkdir(output); // Refuse to overwrite a prior run.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const receipt = await read(receiptPath), prior = path.dirname(receiptPath);
const evidence = { started: new Date().toISOString(), status: 'running', input: { path: receiptPath, sha256: hash(await readFile(receiptPath)) }, handlers: {} };
const save = () => writeFile(path.join(output, 'receipt.json'), JSON.stringify(evidence, null, 2) + '\n');
const log = async data => writeFile(path.join(output, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...data }) + '\n', { flag: 'a' });
try {
  for (const handler of ['macerator', 'furnace']) {
    const result = evidence.handlers[handler] = { status: 'running', samples: [], screenshots: [] };
    const source = receipt[handler].sourceDataset.path;
    const sourceManifest = await read(path.join(source, 'manifest.json'));
    const catalogId = receipt[handler].assemblyAndCompilation.compiledCatalogId;
    const catalogRoot = path.join(prior, `compiled-${handler}-from-published`);
    const manifest = await read(path.join(catalogRoot, 'catalogs', catalogId, 'manifest.json'));
    assert.equal(manifest.id, catalogId);
    result.source = sourceManifest.id; result.catalog = catalogId;
    const tables = {};
    for (const file of sourceManifest.files) {
      if (!['items', 'assets', 'recipes', 'views', 'categories', 'aspects'].includes(file.kind)) continue;
      const bytes = await readFile(path.join(source, file.path));
      assert.equal(hash(bytes), file.sha256);
      (tables[file.kind] ??= []).push(...gunzipSync(bytes).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
    }
    const items = new Map(tables.items.map(x => [x.id, x]));
    const assets = new Map(tables.assets.map(x => [x.id, x]));
    const views = new Map(tables.views.map(x => [x.id, x]));
    const categories = new Map(tables.categories.map(x => [x.id, x]));
    const candidates = [];
    for (const recipe of tables.recipes) {
      const view = views.get(recipe.view ?? categories.get(recipe.category).view);
      for (const element of view?.elements ?? []) {
        if (element.kind !== 'slot' || element.substance !== 'item') continue;
        const stack = recipe[element.direction === 'input' ? 'inputs' : 'outputs'].find(x => x.kind === 'item' && x.slot === element.slot);
        if (!stack || stack.change) continue;
        const item = items.get(element.direction === 'input' ? stack.choices[0].id : stack.id);
        const asset = assets.get(item.icon);
        candidates.push({ recipe, element, stack, item, asset });
      }
    }
    // Include a fast native resource animation; don't infer animation from arbitrary timers.
    const animated = candidates.find(x => x.item.registry === 'Railcraft:firestone.raw' && x.asset.frames.length > 1);
    assert(animated, 'Expected real Firestone animation in the accepted pilot');
    const samples = [animated];
    for (const prefix of ['minecraft:', 'gregtech:gt.block', 'gregtech:gt.metaitem', '']) {
      const sample = candidates.find(x => x.item.registry.startsWith(prefix) && !samples.some(y => y.item.id === x.item.id));
      assert(sample, `Missing sample for ${prefix}`); samples.push(sample);
    }
    const server = await new Promise(resolve => { const s = createApp({ catalog: catalogRoot, web: path.join(root, 'frontend/dist') }).listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    let stopped = false, context;
    const profile = path.resolve(output, `${handler}-profile`);
    const stopServer = async () => {
      if (stopped) return;
      server.closeAllConnections(); await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
      assert.equal(server.listening, false); stopped = true;
      await log({ handler, event: 'http_listener_closed', origin, hostProcessPid: process.pid, listening: server.listening });
    };
    const launch = async offline => {
      const c = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1440, height: 1000 }, offline });
      await c.tracing.start({ screenshots: true, snapshots: true, sources: true });
      await log({ handler, event: 'browser_context_opened', profile, offline });
      return c;
    };
    const close = async phase => {
      if (!context) return;
      await context.tracing.stop({ path: path.join(output, `${handler}-${phase}-trace.zip`) });
      await context.close(); context = null; await log({ handler, event: 'browser_context_closed', phase });
    };
    const shot = async (page, name) => {
      await expect(page.locator('[class*="app-route-fade-"]')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const filename = `${handler}-${name}.png`; const bytes = await page.screenshot({ path: path.join(output, filename), fullPage: true });
      result.screenshots.push({ path: filename, bytes: bytes.length, sha256: hash(bytes) });
    };
    try {
      context = await launch(false); let page = context.pages()[0];
      const api = async endpoint => { const response = await fetch(`${origin}/api/catalog/${catalogId}/${endpoint}`); assert.equal(response.status, 200); return response.json(); };
      for (const sample of samples) {
        const { recipe, element, item, asset } = sample;
        const detail = await api(`recipes/${recipe.id}`);
        const texture = detail.related.textures.find(x => x.id === item.icon); assert(texture);
        const url = `${origin}/recipe-by-id/${recipe.id}?catalog=${catalogId}`;
        await page.goto(url);
        const selector = `[data-recipe="${recipe.id}"] [data-direction="${element.direction}"][data-substance="item"][data-slot="${element.slot}"] > .stack-slot > [data-item="${item.id}"] canvas`;
        const canvas = page.locator(selector); await expect(canvas).toHaveCount(1); await expect(canvas).toBeVisible();
        // Icon sets its backing dimensions after the asynchronous atlas lease resolves.
        await expect.poll(() => canvas.evaluate(c => c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
        const sourceBytes = await readFile(path.join(source, asset.path));
        assert.equal(hash(sourceBytes), sourceManifest.files.find(f => f.path === asset.path).sha256);
        for (const atlasPath of new Set(texture.frames.map(x=>x.path))) {
          const bytes=await readFile(path.join(catalogRoot,'catalogs',catalogId,atlasPath));
          const declared=manifest.files.find(x=>x.path===atlasPath);assert.equal(bytes.length,declared.bytes);assert.equal(hash(bytes),declared.sha256);
        }
        const decoded=spawnSync(process.env.NEONEI_AUDIT_PYTHON ?? 'python', [path.join(root,'scripts/verify-pilot-pixels.py')], {
          input:JSON.stringify({sourcePath:path.join(source,asset.path),atlasRoot:path.join(catalogRoot,'catalogs',catalogId),asset,texture}), encoding:'utf8',windowsHide:true,
        });
        assert.equal(decoded.status,0,decoded.stderr || decoded.stdout);const nativePixels=JSON.parse(decoded.stdout);
        const measured = await canvas.evaluate(async (canvas, { frames, origin, catalogId, png, sourceFrames, asset }) => {
          const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
          const cache = new Map();
          const source = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
          const expected = [], pngExpected = [], differences = [];
          const draw = async (image, frame, width, height) => {
            const c = new OffscreenCanvas(width,height), ctx = c.getContext('2d'); ctx.imageSmoothingEnabled=false;
            ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height,0,0,width,height);
            return ctx.getImageData(0,0,width,height).data;
          };
          for (let i=0;i<frames.length;i++) {
            const f=frames[i];
            if(!cache.has(f.path)) cache.set(f.path, await createImageBitmap(await (await fetch(`${origin}/assets/${catalogId}/${f.path}`)).blob()));
            const atlasPixels=await draw(cache.get(f.path),f,canvas.width,canvas.height);
            expected.push(await digest(atlasPixels));
            const sf=sourceFrames[i] ?? {x:0,y:0,width:asset.width,height:asset.height};
            const sourcePixels=await draw(source,sf,canvas.width,canvas.height);
            pngExpected.push(await digest(sourcePixels));
            const deltas=[];for(let p=0;p<atlasPixels.length;p++)if(atlasPixels[p]!==sourcePixels[p])deltas.push({index:p,atlas:atlasPixels[p],png:sourcePixels[p]});
            differences.push({count:deltas.length,maxDelta:Math.max(0,...deltas.map(x=>Math.abs(x.atlas-x.png))),first:deltas.slice(0,10)});
          }
          source.close(); for(const image of cache.values()) image.close();
          const observations=[];
          for(let i=0;i<20;i++) {
            const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
            observations.push({ time:Date.now(), sha256:await digest(pixels), nonZeroAlpha:pixels.filter((v,i)=>i%4===3&&v>0).length });
            if(observations.some(x=>x.nonZeroAlpha>0&&expected.includes(x.sha256)) && (new Set(observations.filter(x=>x.nonZeroAlpha>0&&expected.includes(x.sha256)).map(x=>x.sha256)).size>1 || frames.length===1)) break;
            await new Promise(resolve=>setTimeout(resolve,200));
          }
          return { width:canvas.width,height:canvas.height,expected,pngExpected,differences,observations };
        }, { frames:texture.frames,origin,catalogId,png:sourceBytes.toString('base64'),sourceFrames:asset.frames,asset });
        const record={itemId:item.id,registry:item.registry,meta:item.meta,recipeId:recipe.id,direction:element.direction,slot:element.slot,selector,url,
          sourceAsset:{id:asset.id,path:asset.path,bytes:sourceBytes.length,sha256:hash(sourceBytes)},texture,nativePixels,measured};
        result.samples.push(record); await save();
        // Browser decoders round translucent RGB differently when premultiplying
        // PNG and WebP. Raw decoded RGBA above must match exactly; UI pixels must
        // match the actual atlas rendered through the same browser canvas path.
        assert(measured.observations.some(x=>x.nonZeroAlpha>0 && measured.expected.includes(x.sha256)),'Bound slot did not render its declared item');
        if(sample===animated) assert(new Set(measured.observations.filter(x=>x.nonZeroAlpha>0&&measured.expected.includes(x.sha256)).map(x=>x.sha256)).size>1,'Resource item animation did not advance');
        await shot(page,`item-${result.samples.length}`);
      }
      const choice=candidates.find(x=>x.element.direction==='input' && x.stack.choices.length>1 && x.stack.choices.length<=24); assert(choice);
      await page.goto(`${origin}/recipe-by-id/${choice.recipe.id}?catalog=${catalogId}`);
      const slot=page.locator(`[data-direction="input"][data-slot="${choice.element.slot}"][data-substance="item"]`);
      await slot.getByRole('button',{name:`查看 ${choice.stack.choices.length} 个候选输入`,exact:true}).click();
      await expect(page.locator('.choices-dialog .choice-list')).toHaveCSS('display','grid');
      await shot(page,'choices');
      const selected=choice.stack.choices[1].id;
      await page.locator(`.choices-dialog [data-item="${selected}"]`).click();
      await expect(slot.locator(`:scope > .stack-slot > [data-item="${selected}"]`)).toBeVisible();
      await slot.locator(`:scope > .stack-slot > [data-item="${selected}"]`).click({button:'right'});
      await expect(page).toHaveURL(new RegExp(`/recipe/${selected}\\?`)); assert.equal(new URL(page.url()).searchParams.get('catalog'),catalogId);
      await expect(page.locator('.recipe-by-id-page')).toHaveCount(0);
      await expect(page.locator('.recipe-view')).toBeVisible();
      await expect(page.locator('.recipe-view .loading-state')).toHaveCount(0);
      await expect(page.locator('.variant-scaffold')).not.toContainText(/(?:item|string)_[a-f0-9]{64}/);
      await expect.poll(() => page.locator('.machine-icon-container canvas').first().evaluate(c => c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
      result.navigation={target:selected,url:page.url(),choices:choice.stack.choices.length}; await shot(page,'uses');
      for(const key of ['aer','alienis']) {
        const aspect=tables.aspects.find(x=>x.source.key===key); assert(aspect);
        await page.goto(`${origin}/aspect/${aspect.id}?catalog=${catalogId}`);
        await expect(page.locator('.magic-facts code')).toHaveText(key);
        await expect(page.locator('.industry-workspace')).toHaveCSS('display','grid');
        await expect(page.locator('.magic-title canvas')).toHaveCSS('width','48px');
        await expect.poll(() => page.locator('.magic-title canvas').evaluate(c => c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
        await shot(page,key);
      }
      await page.goto(`${origin}/offline?catalog=${catalogId}`);
      await page.getByRole('button',{name:'保存完整资料',exact:true}).click();
      await expect(page.getByRole('link',{name:'离线打开',exact:true})).toBeVisible({timeout:90000});
      await stopServer(); await context.setOffline(true); await close('online');
      context=await launch(true);page=context.pages()[0];
      await page.goto(`${origin}/recipe-by-id/${animated.recipe.id}?catalog=${catalogId}&offline=1`);
      const offlineCanvas=page.locator(`[data-direction="${animated.element.direction}"][data-slot="${animated.element.slot}"] > .stack-slot > [data-item="${animated.item.id}"] canvas`);
      await expect(offlineCanvas).toBeVisible();
      const frames=new Set();await expect.poll(async()=>{const frame=await offlineCanvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)?c.toDataURL():null);if(frame)frames.add(frame);return frames.size;},{timeout:10000,intervals:[200]}).toBeGreaterThan(1);
      const texturePath=result.samples[0].texture.frames[0].path;
      const offlineTexture=await page.evaluate(async url=>{const r=await fetch(url);if(!r.ok)throw Error(String(r.status));const b=await r.arrayBuffer();return {bytes:b.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('')};},`${origin}/assets/${catalogId}/${texturePath}`);
      const declared=manifest.files.find(x=>x.path===texturePath);assert.equal(offlineTexture.sha256,declared.sha256);assert.equal(offlineTexture.bytes,declared.bytes);
      result.offline={listenerClosed:!server.listening,profile,distinctItemFrames:frames.size,texture:{path:texturePath,...offlineTexture}};
      await shot(page,'offline-reopened');await close('offline');result.status='passed';
    } finally {await close('interrupted');await stopServer();await save();}
  }
  evidence.status='passed';
} catch(error) {evidence.status='failed';evidence.error=error.stack;process.exitCode=1;}
finally {evidence.finished=new Date().toISOString();await save();console.log(JSON.stringify({status:evidence.status,output,error:evidence.error}));}
