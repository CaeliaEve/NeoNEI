import type {Manifest} from '@elysium/contracts';
import {hash, Fault, type Collection, type Row} from './store.ts';
export interface Part {kind: string; path: string; first: string; last: string; rows: number; bytes: number; rawBytes:number; sha256: string}
export interface Directory {id:string; recipes:Array<{id:string;category:string}>; uses:Array<{id:string;category:string}>}
export async function packRows(kind:string, rows:Array<{id:string}>, count=128):Promise<Array<{file:Part;bytes:Uint8Array}>> {
  const result:Array<{file:Part;bytes:Uint8Array}>=[];
  for(let start=0;start<rows.length;){
    let end=Math.min(start+count,rows.length),bytes=new TextEncoder().encode(JSON.stringify(rows.slice(start,end)));
    while(bytes.length>256*1024&&end-start>1){end=start+Math.ceil((end-start)/2);bytes=new TextEncoder().encode(JSON.stringify(rows.slice(start,end)));}
    if(bytes.length>16*1024*1024)throw Error('Interaction record exceeds limit');
    const rawBytes=bytes.length;
    bytes=new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const sha256=await hash(bytes),path=kind+'/'+sha256+'.json.gz';
    result.push({file:{kind,path,first:rows[start]!.id,last:rows[end-1]!.id,rows:end-start,bytes:bytes.length,rawBytes,sha256},bytes});start=end;
  }
  return result;
}

/** Small immutable shared record chunks; no duplication of related objects per recipe. */
export class PackedCatalog {
  readonly manifest:Manifest;
  private files:Map<string,Part[]>;
  private load:(file:Part)=>Promise<Uint8Array>;
  private cache=new Map<string,{rows:Map<string,any>;weight:number}>();
  private pending=new Map<string,Promise<Map<string,any>>>();
  private weight=0;
  private keys:Array<{id:string;category:string}>;
  constructor(manifest:Manifest,files:Part[],load:(file:Part)=>Promise<Uint8Array>,keys:Array<{id:string;category:string}>=[]){
    this.keys=keys;
    this.manifest=manifest;this.load=load;this.files=new Map();
    for(const file of files){const list=this.files.get(file.kind)??[];list.push(file);this.files.set(file.kind,list);}
  }
  private part(file:Part):Promise<Map<string,any>>{
    const hit=this.cache.get(file.path);if(hit){this.cache.delete(file.path);this.cache.set(file.path,hit);return Promise.resolve(hit.rows);}
    let job=this.pending.get(file.path);
    if(!job){job=(async()=>{
      const bytes=await this.load(file);
      if(bytes.length!==file.bytes||await hash(bytes)!==file.sha256)throw new Fault('interaction_integrity','Interaction integrity mismatch');
      const raw=await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if(raw.byteLength!==file.rawBytes||raw.byteLength>16*1024*1024)throw new Fault('interaction_integrity','Interaction length mismatch');
      const data=JSON.parse(new TextDecoder().decode(raw));
      if(!Array.isArray(data)||data.length!==file.rows||data[0]?.id!==file.first||data[data.length-1]?.id!==file.last)throw new Fault('interaction_integrity','Interaction range mismatch');
      const rows=new Map<string,any>(data.map(row=>[row.id,row])),weight=raw.byteLength*4;
      while(this.weight+weight>64*1024*1024&&this.cache.size){const key=this.cache.keys().next().value!;this.weight-=this.cache.get(key)!.weight;this.cache.delete(key);}
      if(weight<=64*1024*1024){this.cache.set(file.path,{rows,weight});this.weight+=weight;}return rows;
    })().finally(()=>this.pending.delete(file.path));this.pending.set(file.path,job);}return job;
  }
  async record<K extends Collection>(kind:K,id:string):Promise<Row<K>>{
    if(kind==='links'&&this.keys.length){const row=await this.directory(id);return {id,recipes:row.recipes.map(r=>r.id),uses:row.uses.map(r=>r.id),topics:(row as Directory&{topics:string[]}).topics} as Row<K>;}
    const files=this.files.get(kind)??[];let low=0,high=files.length;
    while(low<high){const mid=(low+high)>>>1;if(files[mid]!.last<id)low=mid+1;else high=mid;}
    const file=files[low];if(file&&file.first<=id){const row=(await this.part(file)).get(id);if(row)return row;}
    throw new Fault('record_missing','Interaction record missing: '+kind+'/'+id,404);
  }
  async records<K extends Collection>(kind:K,ids:Iterable<string>):Promise<Row<K>[]>{
    const list=[...ids],result:Row<K>[]=[];
    for(let i=0;i<list.length;i+=16)result.push(...await Promise.all(list.slice(i,i+16).map(id=>this.record(kind,id))));return result;
  }
  async *scan<K extends Collection>(kind:K):AsyncGenerator<Row<K>>{for(const file of this.files.get(kind)??[])for(const row of (await this.part(file)).values())yield row;}
  async all<K extends Collection>(kind:K):Promise<Row<K>[]>{const rows:Row<K>[]=[];for await(const row of this.scan(kind))rows.push(row);return rows;}
  async directory(id:string):Promise<Directory>{
    const row=await this.record('directory' as Collection,id) as unknown as Directory&{topics:string[]};
    if(!this.keys.length)return row;
    const resolve=(ids:unknown[])=>ids.map(id=>{const value=typeof id==='number'?this.keys[id]:null;if(!value)throw new Fault('interaction_integrity','Invalid recipe directory ordinal');return value;});
    return {...row,recipes:resolve(row.recipes),uses:resolve(row.uses)};
  }
}
