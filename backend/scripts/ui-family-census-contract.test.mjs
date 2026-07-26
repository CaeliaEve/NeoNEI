import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const endpointRegistrySource = fs.readFileSync('src/routes/render-contract-endpoint-registry.ts', 'utf8');
const serviceSource = fs.readFileSync('src/services/render-contract.service.ts', 'utf8');
const censusSource = fs.readFileSync('src/services/ui-family-census.service.ts', 'utf8');

test('render contract exposes the UI family census contract surface', () => {
  assert.equal(endpointRegistrySource.includes("path: '/ui-family-census'"), true);
  assert.equal(endpointRegistrySource.includes("path: '/ui-family-census/:familyKey'"), true);
  assert.equal(serviceSource.includes('uiFamilyCensus'), true);
  assert.equal(serviceSource.includes('CURRENT_RUNTIME_ARTIFACT_PATHS.uiFamilyCensus'), true);
  assert.equal(serviceSource.includes('getUiFamilyCensusService().getReportOrNull(uiFamilyCensusFilePath)'), true);
  assert.equal(censusSource.includes('getFamilyByKey(familyKey: string)'), true);
  assert.equal(censusSource.includes('resolveDistDataRuntimeFile(CURRENT_RUNTIME_ARTIFACT_PATHS.uiFamilyCensus)'), true);
  assert.equal(censusSource.includes('getReportOrNull(censusFilePath = this.resolveCensusFilePath())'), true);
});
