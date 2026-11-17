import type { Nbt } from '@elysium/contracts';

/** Minecraft 1.7.10 NBTBase.hashCode for cache routing only. It intentionally
 * differs from canonical content identity and is not an equality substitute. */
export function nativeNbtHash(tag:Nbt):number{
  let nodes=0;
  const textHash=(text:string):number=>{
    let hash=0;for(let at=0;at<text.length;at++)hash=(Math.imul(hash,31)+text.charCodeAt(at))|0;return hash;
  };
  const longHash=(bits:bigint):number=>Number(BigInt.asIntN(32,bits^(bits>>32n)));
  const hash=(value:Nbt,depth:number):number=>{
    if(++nodes>65536||depth>48)throw new Error('Native NBT hash exceeds its budget');
    switch(value.type){
      case 'byte':return 1^Number(value.value);
      case 'short':return 2^Number(value.value);
      case 'int':return 3^Number(value.value);
      case 'long':return 4^longHash(BigInt(value.value));
      case 'float':{
        let bits=Number.parseInt(value.value,16)|0;
        if((bits&0x7f800000)===0x7f800000&&(bits&0x007fffff)!==0)bits=0x7fc00000;
        return 5^bits;
      }
      case 'double':{
        let bits=BigInt('0x'+value.value);
        if((bits&0x7ff0000000000000n)===0x7ff0000000000000n&&(bits&0x000fffffffffffffn)!==0n)bits=0x7ff8000000000000n;
        return 6^longHash(bits);
      }
      case 'byte_array':{
        if(value.value.length>350000)throw new Error('Native NBT hash exceeds its byte-array budget');
        const bytes=atob(value.value);let result=1;
        for(let at=0;at<bytes.length;at++){const byte=bytes.charCodeAt(at);result=(Math.imul(result,31)+(byte>=128?byte-256:byte))|0;}
        return 7^result;
      }
      case 'string':
        if(value.value.length>131072)throw new Error('Native NBT hash exceeds its string budget');
        return 8^textHash(value.value);
      case 'list':{
        let result=1;for(const cell of value.value)result=(Math.imul(result,31)+hash(cell,depth+1))|0;
        return 9^result; // The native list hash omits its declared element type.
      }
      case 'compound':{
        let result=0;for(const [key,cell] of Object.entries(value.value))result=(result+(textHash(key)^hash(cell,depth+1)))|0;
        return 10^result;
      }
      case 'int_array':{
        if(value.value.length>65536)throw new Error('Native NBT hash exceeds its int-array budget');
        let result=1;for(const integer of value.value)result=(Math.imul(result,31)+Number(integer))|0;
        return 11^result;
      }
      default:throw new Error('Unknown native NBT tag type');
    }
  };
  return hash(tag,0);
}

/** NBTPrimitive.getFloat. Integer narrowing must not pass through a rounded
 * JS double first; NaN payloads and signed zero remain explicit bit strings. */
export function nativeNbtFloatBits(tag:Nbt|undefined):string{
  if(!tag)return '00000000';
  if(tag.type==='float')return tag.value;
  const bytes=new DataView(new ArrayBuffer(8));let value:number;
  if(tag.type==='double'){
    const raw=BigInt('0x'+tag.value),exponent=(raw>>52n)&2047n,payload=raw&((1n<<52n)-1n);
    if(exponent===2047n){const sign=Number((raw>>32n)&0x80000000n);
      const bits=payload===0n?0x7f800000:0x7fc00000|Number((payload>>29n)&0x7fffffn);
      return ((sign|bits)>>>0).toString(16).padStart(8,'0');
    }
    bytes.setBigUint64(0,raw);value=bytes.getFloat64(0);
  }else if(tag.type==='byte'||tag.type==='short'||tag.type==='int'||tag.type==='long'){
    const integer=BigInt(tag.value),negative=integer<0n,magnitude=negative?-integer:integer;
    const shift=Math.max(0,magnitude.toString(2).length-24);let leading=magnitude>>BigInt(shift);
    if(shift){const rest=magnitude-(leading<<BigInt(shift)),half=1n<<BigInt(shift-1);
      if(rest>half||rest===half&&(leading&1n)!==0n)leading++;
    }
    value=(negative?-1:1)*Number(leading)*2**shift;
  }else return '00000000';
  bytes.setFloat32(0,value);return bytes.getUint32(0).toString(16).padStart(8,'0');
}

/** Minecraft 1.7.10 NBTPrimitive.getInt, including floor and Java narrowing. */
export function nativeNbtInt(tag:Nbt|undefined):number{
  if(!tag)return 0;
  if(tag.type==='byte'||tag.type==='short'||tag.type==='int'||tag.type==='long')return Number(BigInt.asIntN(32,BigInt(tag.value)));
  if(tag.type!=='float'&&tag.type!=='double')return 0;
  const data=new DataView(new ArrayBuffer(8));let value:number;
  if(tag.type==='float'){data.setUint32(0,Number.parseInt(tag.value,16));value=data.getFloat32(0);}
  else{data.setBigUint64(0,BigInt('0x'+tag.value));value=data.getFloat64(0);}
  const narrowed=Number.isNaN(value)?0:Math.max(-2147483648,Math.min(2147483647,Math.trunc(value)));
  return (value<(tag.type==='float'?Math.fround(narrowed):narrowed)?narrowed-1:narrowed)|0;
}

/** Minecraft NBTBase.equals on distinct owned trees. This NEVER replaces content identity.
 * Callers must retain tagged-vs-untagged separately: an empty compound is a tag.
 * Typed records come from the strict contract decoder and the Compiler's NBT gates.
 */
export function nativeNbtEqual(left: Nbt | null | undefined, right: Nbt | null | undefined): boolean {
  const bytes = new DataView(new ArrayBuffer(8));
  const floating = (value: string, double: boolean): number => {
    if (!(double ? /^[0-9a-f]{16}$/ : /^[0-9a-f]{8}$/).test(value)) throw new Error('Invalid native NBT float bits');
    if (double) { bytes.setBigUint64(0, BigInt('0x' + value)); return bytes.getFloat64(0); }
    bytes.setUint32(0, Number.parseInt(value, 16)); return bytes.getFloat32(0);
  };
  let nodes = 0;
  const equal = (a: Nbt | null | undefined, b: Nbt | null | undefined, depth: number): boolean => {
    if (++nodes > 65536 || depth > 48) throw new Error('Native NBT comparison exceeds its budget');
    if (a == null || b == null) return a == null && b == null;
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'float': return b.type === 'float' && floating(a.value, false) === floating(b.value, false);
      case 'double': return b.type === 'double' && floating(a.value, true) === floating(b.value, true);
      case 'list': return b.type === 'list' && a.element === b.element && a.value.length === b.value.length
        && a.value.every((item, index) => equal(item, b.value[index], depth + 1));
      case 'compound': {
        if (b.type !== 'compound') return false;
        const keys = Object.keys(a.value);
        return keys.length === Object.keys(b.value).length && keys.every(key => Object.prototype.hasOwnProperty.call(b.value, key)
          && equal(a.value[key], b.value[key], depth + 1));
      }
      case 'int_array': return b.type === 'int_array' && a.value.length === b.value.length
        && a.value.every((value, index) => value === b.value[index]);
      case 'byte': case 'short': case 'int': case 'long': case 'string': case 'byte_array': return a.value === b.value;
      default: throw new Error('Unknown native NBT tag type');
    }
  };
  return equal(left, right, 0);
}
