import {calculateMaterials as calculate} from '../../src/catalog/materials.ts';
import {language,t} from '../../src/i18n/index.ts';

export function calculateMaterials(recipe,count,selected={}) {
  return calculate(recipe,count,selected,{language:language.value,t});
}
