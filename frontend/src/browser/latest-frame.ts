export function latestFrame(request:(cb:()=>void)=>number,cancel:(id:number)=>void){
 let handle:number|null=null,latest:(()=>void)|null=null,timer:ReturnType<typeof setTimeout>|null=null;
 const clear=()=>{if(handle!==null)cancel(handle);if(timer!==null)clearTimeout(timer);handle=null;timer=null;};
 const flush=()=>{clear();const run=latest;latest=null;run?.();};
 return {schedule(task:()=>void){latest=task;if(handle===null){handle=request(flush);
  // Embedded/occluded browsers can throttle RAF to 1 Hz even while reporting visible.
  // Keep burst coalescing, but never make target identity publication wait for a paint.
  timer=setTimeout(flush,16);}},clear(){clear();latest=null;}};
}
