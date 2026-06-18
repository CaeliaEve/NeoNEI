import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/render-contract.routes.ts', 'utf8');
const serviceSource = fs.readFileSync('src/services/render-contract.service.ts', 'utf8');
const censusSource = fs.readFileSync('src/services/ui-family-census.service.ts', 'utf8');

test('render contract exposes the UI family census contract surface', () => {
  assert.equal(routeSource.includes("'/ui-family-census'"), true);
  assert.equal(routeSource.includes("'/ui-family-census/:familyKey'"), true);
  assert.equal(serviceSource.includes('uiFamilyCensus'), true);
  assert.equal(serviceSource.includes('NESQL_UI_FAMILY_CENSUS_FILE'), true);
  assert.equal(serviceSource.includes('getUiFamilyCensusService().getReportOrNull()'), true);
  assert.equal(censusSource.includes('getFamilyByKey(familyKey: string)'), true);
  assert.equal(censusSource.includes('getReportOrNull()'), true);
});
