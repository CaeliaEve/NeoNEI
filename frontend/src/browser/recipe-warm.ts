import { elysiumFacade, session } from '../services/api/elysiumFacade';
import {residentSourceFrame,cancelPageWarm} from './resident';
import {firstFrames,warmFrames} from './warm-frames';
import {recipeVisualFrame} from './recipe-visuals';
import {withFrameFallback} from './visual-mapping';

let timer: ReturnType<typeof setTimeout> | undefined;
let active = false;
let target = '';
let generation = 0;
let controller=new AbortController();
let foreground=new AbortController();

export async function warmRecipeFrames(id:string,signal:AbortSignal,priority=0){
 const catalog=await session();signal.throwIfAborted();
 const detail=await catalog.recipe(id,signal,priority);
 await warmFrames(firstFrames(detail),frame=>withFrameFallback(recipeVisualFrame(frame,catalog.manifest.id,signal,priority),
  ()=>residentSourceFrame(frame,catalog.manifest.id,signal,priority)??catalog.atlas.acquireFrame(frame,signal,priority),signal),signal);
}

export function cancelRecipeWarm() {
  clearTimeout(timer);
  target = '';
  generation++;
  controller.abort();controller=new AbortController();
}

export function scheduleRecipeWarm(id: string) {
  cancelRecipeWarm();
  target = id;
  timer = setTimeout(() => void run(), 100);
}

async function run() {
  if (active || !target) return;
  const id = target, token = generation;
  const signal=controller.signal;
  target = '';
  active = true;
  try {
    const value = await elysiumFacade.getRecipeBootstrap(id,'recipes',{signal,priority:10});
    if (token !== generation) return;
    // The bootstrap chooses a single available direction and seeds the same cache as a click.
    for (const recipe of [value.indexedCrafting[0], value.indexedUsage[0]]) {
      if (!recipe || token !== generation) continue;
      await warmRecipeFrames(recipe.id,signal,10);
    }
  } catch {
    // The explicit click path reports failures; speculative work stays silent.
  } finally {
    active = false;
    if (target) timer = setTimeout(() => void run(), 100);
  }
}

export function prioritizeRecipe(id:string,direction:'recipes'|'uses'){
 // Attach the foreground consumer before cancelling the hover consumer sharing its request.
 foreground.abort();foreground=new AbortController();const signal=foreground.signal;
 void elysiumFacade.getRecipeBootstrap(id,direction,{signal}).then(async value=>{
  for(const recipe of [value.indexedCrafting[0],value.indexedUsage[0]])if(recipe)await warmRecipeFrames(recipe.id,signal);
 }).catch(()=>{});
 cancelRecipeWarm();cancelPageWarm();
}
