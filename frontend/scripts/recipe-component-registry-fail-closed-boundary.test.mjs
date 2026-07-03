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
const presentationPolicySource = readSource('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');
const routerSource = readSource('src/components/RecipeDisplayRouter.vue');

test('recipe component registry fails closed instead of falling back to StandardCraftingUI', () => {
  assert.match(registrySource, /export function isRegisteredRecipeComponent\(/);
  assert.match(registrySource, /Object\.prototype\.hasOwnProperty\.call\(componentRegistry, componentName\)/);
  assert.match(registrySource, /throw new Error\(`Unknown recipe display component: \$\{componentName\}`\)/);
  assert.doesNotMatch(registrySource, /componentRegistry\[componentName\]\s*\|\|\s*StandardCraftingUI/);
});

test('recipe presentation reports unregistered components explicitly through policy ops', () => {
  assert.match(presentationSource, /const presentationRoute = computed\(\(\) => resolveRecipePresentationRoute/);
  assert.match(presentationSource, /const componentRegistrationError = computed<string \| null>\(\(\) => presentationRoute\.value\.error\)/);
  assert.match(presentationSource, /const displayedComponentName = computed\(\(\) => presentationRoute\.value\.displayedComponentName\)/);
  assert.match(presentationSource, /componentRegistrationError,/);
  assert.match(presentationSource, /hasRegisteredComponent,/);
  assert.match(presentationPolicySource, /Recipe display component "\$\{profile\.component\}" is not registered/);
  assert.match(presentationPolicySource, /displayedComponentName: `Unregistered:\$\{input\.profile\.component\}`/);
  assert.doesNotMatch(presentationSource, /StandardCraftingUI \(fallback\)/);
});

test('recipe display router uses one registered-component path and a hard diagnostic for unknown components', () => {
  assert.doesNotMatch(routerSource, /<ThaumcraftArcaneUI/);
  assert.doesNotMatch(routerSource, /<ThaumcraftInfusionUI/);
  assert.doesNotMatch(routerSource, /<ThaumcraftCrucibleUI/);
  assert.doesNotMatch(routerSource, /<ThaumcraftAspectUI/);
  assert.match(routerSource, /const handleItemClick = \(itemId: string, options\?: \{ tab\?: 'usedIn' \| 'producedBy' \}\)/);
  assert.match(routerSource, /v-else-if="hasRegisteredComponent && currentComponent"/);
  assert.match(routerSource, /data-testid="recipe-display-component-error"/);
  assert.match(routerSource, /componentRegistrationError \|\| 'Recipe presentation could not be resolved\.'/);
  assert.doesNotMatch(routerSource, /<component\s+v-else\s+/);
});
