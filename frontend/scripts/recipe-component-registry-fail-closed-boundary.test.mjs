import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), 'utf8');
}

const registrySource = readSource('src/components/recipe-display/recipeComponentRegistry.ts');
const presentationSource = readSource('src/composables/recipe-display/useRecipePresentation.ts');
const routerSource = readSource('src/components/RecipeDisplayRouter.vue');

test('recipe component registry fails closed instead of falling back to StandardCraftingUI', () => {
  assert.match(registrySource, /export function isRegisteredRecipeComponent\(/);
  assert.match(registrySource, /Object\.prototype\.hasOwnProperty\.call\(componentRegistry, componentName\)/);
  assert.match(registrySource, /throw new Error\(`Unknown recipe display component: \$\{componentName\}`\)/);
  assert.doesNotMatch(registrySource, /componentRegistry\[componentName\]\s*\|\|\s*StandardCraftingUI/);
});

test('recipe presentation reports unregistered components explicitly', () => {
  assert.match(presentationSource, /const hasRegisteredComponent = computed\(\(\) => isRegisteredRecipeComponent\(presentationProfile\.value\.component\)\)/);
  assert.match(presentationSource, /const componentRegistrationError = computed<string \| null>/);
  assert.match(presentationSource, /Recipe display component "\$\{presentationProfile\.value\.component\}" is not registered/);
  assert.match(presentationSource, /return `Unregistered:\$\{presentationProfile\.value\.component\}`;/);
  assert.match(presentationSource, /componentRegistrationError,/);
  assert.match(presentationSource, /hasRegisteredComponent,/);
  assert.doesNotMatch(presentationSource, /StandardCraftingUI \(fallback\)/);
});

test('recipe display router renders a hard diagnostic for unknown components', () => {
  assert.match(
    routerSource,
    /uiConfig\.uiType === 'thaumcraft_arcane' && presentationProfile\.component === 'ThaumcraftArcaneUI'/,
  );
  assert.match(
    routerSource,
    /uiConfig\.uiType === 'thaumcraft_infusion' && presentationProfile\.component === 'ThaumcraftInfusionUI'/,
  );
  assert.match(
    routerSource,
    /uiConfig\.uiType === 'thaumcraft_crucible' && presentationProfile\.component === 'ThaumcraftCrucibleUI'/,
  );
  assert.match(
    routerSource,
    /uiConfig\.uiType === 'thaumcraft_aspect' && presentationProfile\.component === 'ThaumcraftAspectUI'/,
  );
  assert.match(routerSource, /v-else-if="hasRegisteredComponent && currentComponent"/);
  assert.match(routerSource, /data-testid="recipe-display-component-error"/);
  assert.match(routerSource, /componentRegistrationError \|\| 'Recipe presentation could not be resolved\.'/);
  assert.doesNotMatch(routerSource, /<component\s+v-else\s+/);
});
