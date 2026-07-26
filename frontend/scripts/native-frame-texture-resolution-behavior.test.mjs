import assert from 'node:assert/strict';
import test from 'node:test';

import { requireNativeFrameTextureDescriptors } from '../src/native-surface/NativeFrameTextureResolution.ts';

test('native frame texture resolution returns every requested descriptor in stable deduplicated order', () => {
  assert.deepEqual(
    requireNativeFrameTextureDescriptors(
      ['atlas/a.png', '/atlas/b.png', 'atlas/a.png'],
      [
        { key: 'atlas/b.png', url: '/runtime/atlas/b.png' },
        { key: 'atlas/a.png', url: '/runtime/atlas/a.png' },
      ],
    ),
    [
      { key: 'atlas/a.png', url: '/runtime/atlas/a.png' },
      { key: 'atlas/b.png', url: '/runtime/atlas/b.png' },
    ],
  );
});

test('native frame texture resolution rejects when every requested descriptor is unavailable', () => {
  assert.throws(
    () => requireNativeFrameTextureDescriptors(['atlas/missing.png'], []),
    /Native frame texture descriptors are missing: atlas\/missing\.png/,
  );
});

test('native frame texture resolution rejects partial descriptor resolution instead of silently freezing', () => {
  assert.throws(
    () => requireNativeFrameTextureDescriptors(
      ['atlas/ready.png', 'atlas/missing.png'],
      [{ key: 'atlas/ready.png', url: '/runtime/atlas/ready.png' }],
    ),
    /Native frame texture descriptors are missing: atlas\/missing\.png/,
  );
});
