import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {canonical,decodeTable} from '@elysium/contracts';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=item=>canonical([item.registry,item.meta??0,item.nbt??null]);
export function matchOrder(items,native){
 const lookup=new Map(),ids=[],seen=new Set(),unmatched=[],ambiguous=[];
 for(const item of items){const key=identity(item),values=lookup.get(key)??[];values.push(item.id);lookup.set(key,values);}
 native.forEach((item,index)=>{const matches=lookup.get(identity(item))??[];
  if(!matches.length)unmatched.push({index,registry:item.registry,meta:item.meta});
  else if(matches.length!==1)ambiguous.push({index,matches});
  else if(!seen.has(matches[0])){ids.push(matches[0]);seen.add(matches[0]);}
 });return {ids,unmatched,ambiguous};
}
export function sortNative(rows,ids){const rank=new Map(ids.map((id,i)=>[id,i]));return [...rows].sort((a,b)=>(rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity)||(a.order??Infinity)-(b.order??Infinity)||(a.id<b.id?-1:a.id>b.id?1:0));}

export function typedNbt(bytes){
 let offset=0;const types=['end','byte','short','int','long','float','double','byte_array','string','list','compound','int_array'];
 const take=n=>{if(n<0||offset+n>bytes.length)throw Error('Truncated NBT');const value=bytes.subarray(offset,offset+n);offset+=n;return value;};
 const int=()=>take(4).readInt32BE(),str=()=>{
  const raw=take(take(2).readUInt16BE());let value='';
  // Java DataInput uses modified UTF-8, including encoded NUL and UTF-16 surrogate pairs.
  for(let i=0;i<raw.length;){const a=raw[i++];let code;
   if(a<128)code=a;else if((a&224)===192)code=((a&31)<<6)|(raw[i++]&63);else if((a&240)===224)code=((a&15)<<12)|((raw[i++]&63)<<6)|(raw[i++]&63);else throw Error('Invalid modified UTF-8');
   value+=String.fromCharCode(code);
  }return value;
 };
 const node=(type,depth=0)=>{
  if(depth>64||type<1||type>11)throw Error('Invalid NBT type/depth');let value;
  if(type===1)value=String(take(1).readInt8());
  if(type===2)value=String(take(2).readInt16BE());
  if(type===3)value=String(int());
  if(type===4)value=String(take(8).readBigInt64BE());
  if(type===5||type===6)value=take(type===5?4:8).toString('hex');
  if(type===7)value=take(int()).toString('base64');
  if(type===8)value=str();
  if(type===9){const element=take(1)[0],length=int();if(length<0||length>1000000)throw Error('Invalid NBT list');return {type:'list',element:types[element],value:Array.from({length},()=>node(element,depth+1))};}
  if(type===10){value={};for(let child;(child=take(1)[0])!==0;){const name=str();Object.defineProperty(value,name,{value:node(child,depth+1),enumerable:true});}}
  if(type===11){const length=int();if(length<0||length>1000000)throw Error('Invalid NBT array');value=Array.from({length},()=>String(int()));}
  return {type:types[type],value};
 };
 const type=take(1)[0];str();const result=node(type);if(offset!==bytes.length)throw Error('Trailing NBT data');return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,csvFile,nbtFile,out]=process.argv.slice(2);if(!out||fs.existsSync(out))throw Error('Supply Catalog, CSV, NBT and new output JSON');
 const csvBytes=fs.readFileSync(csvFile),nbtBytes=fs.readFileSync(nbtFile),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const csv=csvBytes.toString('latin1').trim().split(/\r?\n/).slice(1).map(line=>line.split(',').slice(0,4));
 const stacks=typedNbt(gunzipSync(nbtBytes)).value.list.value;
 if(csv.length!==stacks.length)throw Error('CSV and NBT snapshots contain different row counts');
 const nbtPresenceChanges=[];
 const native=stacks.map((entry,i)=>{const stack=entry.value,[registry,id,meta,hasNbt]=csv[i];
  // ItemStack.writeToNBT narrows damage to a signed short; CSV retains actualDamage's full integer.
  if(Number(stack.id.value)!==Number(id)||Number(stack.Damage.value)!==((Number(meta)<<16)>>16))throw Error('CSV/NBT snapshots differ at '+i);
  if(!!stack.tag!==(hasNbt==='true'))nbtPresenceChanges.push({index:i,registry,csv:hasNbt==='true',nbt:!!stack.tag});
  return {registry,meta:Number(meta),nbt:stack.tag??null};
 });
 const items=manifest.files.filter(f=>f.kind==='items').flatMap(file=>{const bytes=fs.readFileSync(path.join(root,file.path));if(digest(bytes)!==file.sha256)throw Error('Catalog integrity mismatch');return decodeTable(bytes,'items').records;});
 const result=matchOrder(items,native);if(result.ambiguous.length)throw Error('Ambiguous native identity mapping');
 const value={version:1,catalog:manifest.id,captured:native.length,matched:result.ids.length,unmatched:result.unmatched,ids:result.ids,nbtPresenceChanges,
  evidence:[csvFile,nbtFile].map(file=>({path:file,sha256:digest(fs.readFileSync(file))})),policy:'native-matched-subsequence-then-catalog-extras'};
 fs.writeFileSync(out,JSON.stringify(value));console.log(JSON.stringify({captured:value.captured,matched:value.matched,unmatched:value.unmatched.length,out}));
}
