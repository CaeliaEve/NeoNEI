import type {Recipe} from '@elysium/contracts';
import {language,t} from '../i18n/index.ts';
import {calculateMaterials as calculate,parseBatches as parse,type Selection} from '../catalog/materials.ts';

export {formatQuantity,multiplyQuantity} from '../catalog/materials.ts';
export type {MaterialRow,Materials,Selection} from '../catalog/materials.ts';

export function parseBatches(value:string):bigint {
  return parse(value,{language:language.value,t});
}
export function calculateMaterials(recipe:Recipe,count:string,selected:Selection={}) {
  return calculate(recipe,count,selected,{language:language.value,t});
}
