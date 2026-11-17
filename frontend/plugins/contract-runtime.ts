import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import type {Plugin} from 'vite';

interface Runtime {fileName:string;source:Uint8Array}
interface Build {pending:Map<string,Promise<Runtime>>;used:Set<string>}
const builds=new Map<string,Build>();

/** Keep generated validators opaque to Rollup; client and worker use the same
 * content-addressed ESM files, included in the ordinary offline shell census. */
export function contractRuntime(project:string,worker=false):Plugin{
  const key=path.resolve(project);
  if(!builds.has(key))builds.set(key,{pending:new Map(),used:new Set()});
  const state=builds.get(key)!;
  const require=createRequire(path.join(key,'catalog/package.json'));
  async function runtime(name:string):Promise<Runtime>{
    state.used.add(name);
    let pending=state.pending.get(name);
    if(!pending){
      pending=(async()=>{
        const entry=require.resolve(name);
        const exports=Object.keys(require(entry)).sort();
        if(exports.length===0||exports.some(name=>!/^[$A-Z_a-z][$\w]*$/.test(name)))
          throw new Error('Contract runtime has unsupported exports: '+name);
        const result=await build({stdin:{contents:`import api from ${JSON.stringify(entry)};
          ${exports.map(name=>`export const ${name}=api.${name};`).join('\n')}`,
          resolveDir:key,sourcefile:'contract-runtime.js'},
          bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:true,
          legalComments:'none',logLevel:'silent'});
        const source=result.outputFiles[0]!.contents;
        return {fileName:`web/contracts-${createHash('sha256').update(source).digest('hex')}.js`,source};
      })();
      state.pending.set(name,pending);
      void pending.catch(()=>{if(state.pending.get(name)===pending)state.pending.delete(name);});
    }
    return pending;
  }
  return {
    name:'opaque-contract-runtime',apply:'build',enforce:'pre',
    buildStart(){if(!worker){state.used.clear();state.pending.clear();}},
    async resolveId(source){
      if(source!=='@elysium/contracts')return null;
      const value=await runtime(source);
      return {id:'/'+value.fileName,external:true};
    },
    async generateBundle(){
      if(worker)return;
      for(const name of [...state.used].sort()){
        const value=await runtime(name);
        this.emitFile({type:'asset',fileName:value.fileName,source:value.source});
      }
    },
  };
}
