import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const viewerSource = fs.readFileSync(
  'src/composables/useRecipeViewer.ts',
  'utf8',
);

test('recipe viewer clears stale load error after successful bootstrap', () => {
  const staleErrorAssignment = "loadError.value = '\\u8bfb\\u53d6\\u914d\\u65b9\\u5931\\u8d25";
  const successGuard = 'if (disposed || requestSeq !== loadRequestSeq || itemIdRef.value !== itemId) {';
  const clearLoadError = "loadError.value = '';";
  const itemAssignment = 'item.value = bootstrappedItem;';

  const staleErrorIndex = viewerSource.indexOf(staleErrorAssignment);
  const successGuardIndex = viewerSource.indexOf(successGuard, staleErrorIndex);
  const clearLoadErrorIndex = viewerSource.indexOf(clearLoadError, successGuardIndex);
  const itemAssignmentIndex = viewerSource.indexOf(itemAssignment, successGuardIndex);

  assert.notEqual(staleErrorIndex, -1, 'load path should still seed the failure message before async work');
  assert.notEqual(successGuardIndex, -1, 'success path should guard stale/disposed requests');
  assert.notEqual(clearLoadErrorIndex, -1, 'success path must clear the seeded failure message');
  assert.notEqual(itemAssignmentIndex, -1, 'success path should assign bootstrapped item data');
  assert.equal(
    clearLoadErrorIndex < itemAssignmentIndex,
    true,
    'stale loadError must be cleared before successful recipe data can render',
  );
});
