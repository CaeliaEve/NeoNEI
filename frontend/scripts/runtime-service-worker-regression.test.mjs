import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("runtime service worker is registered by the frontend shell", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /registerRuntimeServiceWorker/);
});

test("runtime service worker caches binary packs, atlas images, and native engine assets", async () => {
  const worker = await readFile(new URL("../public/neonei-sw.js", import.meta.url), "utf8");
  assert.ok(worker.includes("dist-data\\/runtime"), "runtime binary pack path should be cached");
  assert.ok(worker.includes("textures\\/atlas"), "atlas texture path should be cached");
  assert.ok(worker.includes("native\\/engine"), "native engine path should be cached");
  assert.match(worker, /cacheFirst/);
  assert.match(worker, /networkFirst/);
  assert.match(worker, /NEONEI_RUNTIME_CACHE_STATUS/);
  assert.match(worker, /NEONEI_RUNTIME_CACHE_CLEAR/);
});
