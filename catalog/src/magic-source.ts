import type {Recipe} from '@elysium/contracts';

const prefix='com.gtnewhorizons.aspectrecipeindex.nei.';
export const ariHandlers={
  shaped:prefix+'arcaneworkbench.ShapedArcaneRecipeHandler',
  shapeless:prefix+'arcaneworkbench.ShapelessArcaneRecipeHandler',
  infusion:prefix+'InfusionRecipeHandler',
} as const;

export function isAriSource(source:Recipe['source'],handler:string):boolean {
  return source.owner==='aspectrecipeindex'&&source.handler===handler;
}
