/** Reviewed Java 8 inventory randomness. Keep raw state, the Gaussian cache,
 * native double arithmetic and one advancement per draw, not per timer tick. */
export interface RandomState {seed:string;haveGaussian:boolean;gaussian:string}
const word=new DataView(new ArrayBuffer(8)),mask=(1n<<48n)-1n,multiplier=0x5deece66dn;
export function doubleBits(value:number):string{
  word.setFloat64(0,value,false);return word.getBigUint64(0,false).toString(16).padStart(16,'0');
}
export function nativeDouble(bits:string):number{
  if(!/^[0-9a-f]{16}$/.test(bits))throw Error('Invalid native Gaussian bits');
  word.setBigUint64(0,BigInt('0x'+bits),false);const value=word.getFloat64(0,false);
  if(!Number.isFinite(value))throw Error('Non-finite native Gaussian cache');return value;
}
function high(value:number):number{word.setFloat64(0,value,false);return word.getInt32(0,false);}
function withHigh(value:number,hi:number):number{word.setFloat64(0,value,false);word.setInt32(0,hi,false);return word.getFloat64(0,false);}

/*
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this software is freely
 * granted, provided that this notice is preserved.
 *
 * fdlibm e_log.c, __ieee754_log; translated from the Sun/OpenLibm source.
 * The expression order and split constants match Java 8 StrictMath's fdlibm.
 * Reference: https://github.com/JuliaMath/openlibm/blob/master/src/e_log.c
 */
const ln2Hi=nativeDouble('3fe62e42fee00000'),ln2Lo=nativeDouble('3dea39ef35793c76'),two54=nativeDouble('4350000000000000');
const Lg1=nativeDouble('3fe5555555555593'),Lg2=nativeDouble('3fd999999997fa04'),Lg3=nativeDouble('3fd2492494229359');
const Lg4=nativeDouble('3fcc71c51d8e78af'),Lg5=nativeDouble('3fc7466496cb03de'),Lg6=nativeDouble('3fc39a09d078c69f'),Lg7=nativeDouble('3fc2f112df3e5244');
export function nativeLog(x:number):number{
  word.setFloat64(0,x,false);let hx=word.getInt32(0,false);const lx=word.getUint32(4,false);let k=0;
  if(hx<0x00100000){
    if(((hx&0x7fffffff)|lx)===0)return -Infinity;
    if(hx<0)return NaN;
    k-=54;x*=two54;hx=high(x);
  }
  if(hx>=0x7ff00000)return x+x;
  k+=(hx>>20)-1023;hx&=0x000fffff;let i=(hx+0x95f64)&0x100000;
  x=withHigh(x,hx|(i^0x3ff00000));k+=i>>20;const f=x-1;
  if((0x000fffff&(2+hx))<3){
    if(f===0)return k===0?0:k*ln2Hi+k*ln2Lo;
    const R=f*f*(0.5-0.33333333333333333*f);
    return k===0?f-R:k*ln2Hi-((R-k*ln2Lo)-f);
  }
  const s=f/(2+f),z=s*s,w=z*z;i=hx-0x6147a;const j=0x6b851-hx;
  const t1=w*(Lg2+w*(Lg4+w*Lg6)),t2=z*(Lg1+w*(Lg3+w*(Lg5+w*Lg7))),R=t2+t1;
  i|=j;
  if(i>0){const hfsq=0.5*f*f;return k===0?f-(hfsq-s*(hfsq+R)):k*ln2Hi-((hfsq-(s*(hfsq+R)+k*ln2Lo))-f);}
  return k===0?f-s*(f-R):k*ln2Hi-((s*(f-R)-k*ln2Lo)-f);
}

/** Correctly rounded positive binary64 square root. An integer midpoint
 * comparison avoids relying on an implementation-dependent Math.sqrt result. */
export function nativeSqrt(value:number):number{
  if(value===0||value===Infinity)return value;
  if(value<0||Number.isNaN(value))return NaN;
  word.setFloat64(0,value,false);const raw=word.getBigUint64(0,false),encoded=Number((raw>>52n)&2047n);
  const fraction=raw&((1n<<52n)-1n),mantissa=encoded===0?fraction:fraction+(1n<<52n);
  const exponent=encoded===0?-1074:encoded-1023-52;
  const outputExponent=Math.floor((mantissa.toString(2).length-1+exponent)/2);
  const radicand=mantissa<<BigInt(exponent-2*outputExponent+104);
  let root=1n<<BigInt(Math.ceil(radicand.toString(2).length/2));
  for(;;){const next=(root+radicand/root)>>1n;if(next>=root)break;root=next;}
  if(4n*radicand>4n*root*root+4n*root+1n)root++;
  return Number(root)*2**(outputExponent-52);
}

export class JavaRandom {
  private seed:bigint;
  private haveGaussian:boolean;
  private gaussian:number;
  constructor(state:RandomState){
    if(!/^(0|[1-9][0-9]{0,14})$/.test(state.seed)||BigInt(state.seed)>mask||typeof state.haveGaussian!=='boolean')throw Error('Invalid native Random state');
    this.seed=BigInt(state.seed);this.haveGaussian=state.haveGaussian;this.gaussian=nativeDouble(state.gaussian);
  }
  static seeded(seed:bigint):JavaRandom{
    if(seed<-(1n<<63n)||seed>(1n<<63n)-1n)throw Error('Native Random constructor seed exceeds signed long');
    return new JavaRandom({seed:((seed^multiplier)&mask).toString(),haveGaussian:false,gaussian:'0000000000000000'});
  }
  private next(bits:number):number{this.seed=(this.seed*multiplier+11n)&mask;return Number(this.seed>>BigInt(48-bits));}
  nextDouble():number{return (this.next(26)*2**27+this.next(27))/2**53;}
  nextGaussian():number{
    if(this.haveGaussian){this.haveGaussian=false;return this.gaussian;}
    let v1:number,v2:number,s:number;
    do{v1=2*this.nextDouble()-1;v2=2*this.nextDouble()-1;s=v1*v1+v2*v2;}while(s>=1||s===0);
    const factor=nativeSqrt(-2*nativeLog(s)/s);
    this.gaussian=v2*factor;this.haveGaussian=true;return v1*factor;
  }
  snapshot():RandomState{return {seed:this.seed.toString(),haveGaussian:this.haveGaussian,gaussian:doubleBits(this.gaussian)};}
}

/** One stream per captured native Random identity. It survives icon unmounts
 * and is released with the Catalog; equal time/texture never shares a draw. */
export class RandomStreams {
  private readonly streams=new Map<number,{id:string;random:JavaRandom;release:()=>void}>();
  private closed=false;
  get(id:string,stream:number,state:RandomState,reserve:(bytes:number)=>()=>void):JavaRandom{
    if(this.closed||!Number.isInteger(stream)||stream<1||stream>4096)throw Error('Invalid native Random stream');
    const found=this.streams.get(stream);
    if(found){if(found.id!==id)throw Error('Native Random stream authority changed');return found.random;}
    const random=new JavaRandom(state),release=reserve(512);this.streams.set(stream,{id,random,release});return random;
  }
  close():void{if(this.closed)return;this.closed=true;for(const entry of this.streams.values())entry.release();this.streams.clear();}
}
