import type {Manifest} from '@elysium/contracts';
import {PriorityPool} from './priority-pool.ts';
export class Interaction {
 private worker:Worker;private seq=0;
 private readonly reads=new PriorityPool<unknown>(4);
 private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
 readonly ready:Promise<boolean>;
 constructor(manifest:Manifest){
  this.worker=new Worker(new URL('./interaction.worker.ts',import.meta.url),{type:'module'});
  this.worker.onmessage=event=>{const {id,value,error}=event.data,p=this.pending.get(id);if(!p)return;this.pending.delete(id);error?p.reject(Error(error)):p.resolve(value);};
  this.worker.onerror=()=>{for(const p of this.pending.values())p.reject(Error('交互 Worker 失败'));this.pending.clear();};
  this.ready=this.call({kind:'open',manifest}).catch(()=>false);
 }
 private call(message:Record<string,unknown>,signal?:AbortSignal):Promise<any>{
  if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{const id=++this.seq;const abort=()=>{this.pending.delete(id);reject(new DOMException('Aborted','AbortError'));};
   signal?.addEventListener('abort',abort,{once:true});
   this.pending.set(id,{resolve:value=>{signal?.removeEventListener('abort',abort);resolve(value);},reject:error=>{signal?.removeEventListener('abort',abort);reject(error);}});
   this.worker.postMessage({id,...message});
  });
 }
 read(endpoint:string,signal?:AbortSignal,priority=0){return this.reads.run(endpoint,()=>this.call({kind:'query',endpoint}),signal,priority);}
 close(){this.reads.close();this.worker.terminate();for(const p of this.pending.values())p.reject(Error('交互会话关闭'));this.pending.clear();}
}
