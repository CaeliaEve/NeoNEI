/** Match the document, not simply the newest worker: old tabs may still need old chunks. */
export async function activateMatchingShell(worker:ServiceWorker,build:string,status:()=>Promise<{build:string;ready:boolean}>):Promise<boolean>{
 if(worker.state!=='installed')return false;
 const reply=await status();
 if(worker.state!=='installed'||reply.build!==build||!reply.ready)return false;
 worker.postMessage({kind:'shell-activate',build});
 return true;
}
