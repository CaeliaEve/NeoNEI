type Step={index:number;next:number;blend:number;phase?:number};
/** At most one frame pair in flight; never queue old animation work behind paging. */
export function framePlayer<T extends {release:()=>void}>(select:(time:number)=>Step,acquire:(index:number,signal:AbortSignal)=>Promise<T>,draw:(first:T,next:T|undefined,blend:number)=>void,fail:(error:unknown)=>void){
 const controller=new AbortController();let busy=false,latest=0,painted='';
 return {
  tick(time:number){
   latest=time;if(busy||controller.signal.aborted)return;
   const step=select(time),key=JSON.stringify(step);if(key===painted)return;
   busy=true;
   void(async()=>{
    let first:T|undefined,next:T|undefined;
    try{
     first=await acquire(step.index,controller.signal);
     controller.signal.throwIfAborted();
     if(step.blend>0)next=await acquire(step.next,controller.signal);
     controller.signal.throwIfAborted();
     const now=select(latest);
     if(now.index===step.index&&now.next===step.next&&now.phase===step.phase){draw(first,next,now.blend);painted=JSON.stringify(now);}
    }catch(error){if(!controller.signal.aborted){controller.abort();fail(error);}}
    finally{first?.release();next?.release();busy=false;}
   })();
  },
  close(){controller.abort();},
 };
}
