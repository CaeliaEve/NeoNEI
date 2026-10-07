import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodeTable} from '@elysium/contracts';
const [root,out]=process.argv.slice(2);
if(!root||!out||fs.existsSync(out))throw Error('Supply Catalog root and NEW output directory');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
function read(kind){return manifest.files.filter(f=>f.kind===kind).flatMap(f=>{
 const bytes=fs.readFileSync(path.join(root,f.path));
 if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Integrity: '+f.path);
 return decodeTable(bytes,kind).records;
});}
const assets=new Set(read('views').flatMap(v=>v.elements.filter(e=>e.kind==='sprite'||e.kind==='clip').map(e=>e.asset)));
const frames=new Map();
for(const t of read('textures'))if(assets.has(t.id))for(const f of t.frames)frames.set(JSON.stringify([f.path,f.x,f.y,f.width,f.height]),f);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify({catalog:manifest.id,root,frames:[...frames.values()],files:manifest.files.filter(f=>f.kind==='image')}));
console.log(JSON.stringify({frames:frames.size}));
