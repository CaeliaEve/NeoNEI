import fs from 'node:fs/promises';
import path from 'node:path';
import {decodeTable} from '@elysium/contracts';
import {packRows} from '../catalog/src/interaction.ts';
import {hash} from '../catalog/src/store.ts';
import {gzipSync} from 'node:zlib';
const [root,out]=process.argv.slice(2);
if(!root||!out)throw Error('Supply Catalog directory and new output directory');
await fs.mkdir(out,{recursive:false});
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),files=[];
const summary=new Map(),keys=[],categories=[];let total=0;
async function read(file){const bytes=await fs.readFile(path.join(root,file.path));if(await hash(bytes)!==file.sha256)throw Error('Source hash '+file.path);return decodeTable(bytes,file.kind).records;}
async function write(kind,rows){
 await fs.mkdir(path.join(out,kind),{recursive:true});
 for(const part of await packRows(kind,rows,kind==='recipes'?16:128)){await fs.writeFile(path.join(out,part.file.path),part.bytes);files.push(part.file);}
}
for(const file of manifest.files.filter(f=>f.kind==='index'))for(const row of await read(file)){summary.set(row.id,keys.length);let category=categories.indexOf(row.category);if(category<0){category=categories.length;categories.push(row.category);}keys.push([row.id,category]);}
const kinds=['browse','groups','index','links','recipes','items','fluids','strings','textures','tracks','views','categories','topics'];
for(const kind of kinds){
 let count=0;
 for(const file of manifest.files.filter(f=>f.kind===kind)){
  const rows=await read(file);if(kind!=='links')await write(kind,rows);count+=rows.length;
  if(kind==='links')await write('directory',rows.map(row=>({id:row.id,topics:row.topics,...Object.fromEntries(['recipes','uses'].map(direction=>[direction,row[direction].map(id=>{
   const ordinal=summary.get(id);if(ordinal===undefined)throw Error('Missing linked recipe '+id);return ordinal;
  })]))})));
 }
 if(count!==manifest.counts[kind])throw Error('Record count '+kind);total+=count;console.log(kind,count,'complete');
}
files.sort((a,b)=>a.kind.localeCompare(b.kind)||a.first.localeCompare(b.first));
const keyBytes=gzipSync(JSON.stringify({categories,keys})),keyHash=await hash(keyBytes);
await fs.writeFile(path.join(out,'keys-'+keyHash+'.gz'),keyBytes);
const result={version:1,catalog:manifest.id,keys:{path:'keys-'+keyHash+'.gz',bytes:keyBytes.length,sha256:keyHash},files};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(result));
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify({catalog:manifest.id,records:total,files:files.length+1,bytes:keyBytes.length+files.reduce((n,f)=>n+f.bytes,0),keys:result.keys,rawBytes:files.reduce((n,f)=>n+f.rawBytes,0),directoryLinksVerified:true},null,2));
console.log(await fs.readFile(path.join(out,'receipt.json'),'utf8'));
