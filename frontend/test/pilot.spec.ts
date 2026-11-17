import { test, expect } from '@playwright/test';

test('production offline library saves the shell and verified images', async ({ page, context, request }) => {
  const manifest = await (await request.get('/api/catalog')).json();
  const image = manifest.files.find((file: { kind: string }) => file.kind === 'image');
  await page.goto('/offline');
  await page.getByRole('button', { name: '保存完整资料', exact: true }).click();
  await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible({ timeout: 20000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: '离线打开', exact: true })).toBeVisible();
  const digest = await page.evaluate(async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Offline image failed: ' + response.status);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))]
      .map(n => n.toString(16).padStart(2, '0')).join('');
  }, `/assets/${manifest.id}/${image.path}`);
  expect(digest).toBe(image.sha256);
  await page.evaluate(async ({ id, path }) => {
    const db = await new Promise<IDBDatabase>(resolve => {
      const open = indexedDB.open('neonei.catalog'); open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      tx.objectStore('files').put({ catalog: id, path, body: new Uint8Array([0]).buffer });
    });
    db.close();
  }, { id: manifest.id, path: image.path });
  expect(await page.evaluate(async url => (await fetch(url)).status, `/assets/${manifest.id}/${image.path}`)).toBe(503);
});
