/** The visible target runs immediately. Only speculative reads wait for navigation to settle. */
export async function recipeReadReady(mode:'visible'|'prefetch',current:()=>boolean,
 wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<boolean>{
 if(mode==='prefetch')await wait(300);
 return current();
}
