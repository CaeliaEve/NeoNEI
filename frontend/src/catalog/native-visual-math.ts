/** Reviewed native float and matrix operations. No guessed animation period. */
const word=new DataView(new ArrayBuffer(8)),f=Math.fround;
export function nativeFloat(bits:string):number{
  if(!/^[0-9a-f]{8}$/.test(bits))throw Error('Invalid native visual float');
  word.setUint32(0,Number.parseInt(bits,16),false);const value=word.getFloat32(0,false);
  if(!Number.isFinite(value))throw Error('Non-finite native visual float');return value;
}
export function nativeVector(values:readonly string[]):Float32Array{return Float32Array.from(values,nativeFloat);}
/** Direct signed long -> float, including ties which Number(long) would lose. */
export function javaLongFloat(value:bigint):number{
  if(value<-(1n<<63n)||value>(1n<<63n)-1n)throw Error('Native clock exceeds signed long');
  const sign=value<0n?-1:1;if(value<0n)value=-value;
  const shift=value.toString(2).length-24;if(shift<=0)return f(Number(value)*sign);
  const divisor=1n<<BigInt(shift),half=divisor>>1n;let high=value/divisor;
  const low=value%divisor;if(low>half||(low===half&&(high&1n)===1n))high++;
  return f(sign*Number(high)*2**shift);
}
/** Convert the actual binary64 elapsed milliseconds to native integer units. */
export function nativeSysUnits(milliseconds:number,resolution:bigint):bigint{
  if(!Number.isFinite(milliseconds)||milliseconds<0||resolution<=0n)throw Error('Invalid native inventory clock');
  word.setFloat64(0,milliseconds,false);const raw=word.getBigUint64(0,false),exponent=Number((raw>>52n)&2047n);
  const fraction=raw&((1n<<52n)-1n),mantissa=exponent===0?fraction:fraction+(1n<<52n);
  const power=(exponent===0?-1022:exponent-1023)-52;
  const numerator=mantissa*resolution,result=power>=0?(numerator<<BigInt(power))/1000n:numerator/(1000n<<BigInt(-power));
  if(result>(1n<<63n)-1n)throw Error('Native clock exceeds signed long');return result;
}
function javaInt(value:number):number{return value>=2147483647?2147483647:value<=-2147483648?-2147483648:Math.trunc(value);}
export function nativeCos(value:number,sine:Float32Array):number{
  if(sine.length!==65536||!Number.isFinite(value))throw Error('Invalid native MathHelper cosine');
  return sine[javaInt(f(f(f(value)*f(10430.378))+f(16384)))&65535]!;
}
export function keyAngle(milliseconds:number,resolution:bigint,sine:Float32Array):number{
  if(sine.length!==65536)throw Error('Invalid native MathHelper lookup');
  const phase=f(f(javaLongFloat(nativeSysUnits(milliseconds,resolution))/f(90))/f(20));
  const index=javaInt(f(phase*f(10430.378)))&65535;
  return f(f(sine[index]!-f(55))*f(50));
}
export type Matrix=Float32Array;
export function identity():Matrix{return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
export function multiply(a:Matrix,b:Matrix):Matrix{
  const result=new Float32Array(16);
  for(let column=0;column<4;column++)for(let row=0;row<4;row++){
    let sum=0;for(let k=0;k<4;k++)sum=f(sum+f(a[k*4+row]!*b[column*4+k]!));result[column*4+row]=sum;
  }return result;
}
export function translation(x:number,y:number,z:number):Matrix{const result=identity();result[12]=x;result[13]=y;result[14]=z;return result;}
export function scaling(x:number,y:number,z:number):Matrix{const result=identity();result[0]=x;result[5]=y;result[10]=z;return result;}
export function rotationZ(degrees:number):Matrix{
  const radians=degrees*Math.PI/180,c=f(Math.cos(radians)),s=f(Math.sin(radians));
  return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);
}
export function rotationY(degrees:number):Matrix{
  const radians=degrees*Math.PI/180,c=f(Math.cos(radians)),s=f(Math.sin(radians));
  return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);
}
export function rotationX(degrees:number):Matrix{
  const radians=degrees*Math.PI/180,c=f(Math.cos(radians)),s=f(Math.sin(radians));
  return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);
}
/** Inverse-transpose of the model-view 3x3, in column-major order. */
export function normalMatrix(m:Matrix):Matrix{
  const a=m[0]!,b=m[4]!,c=m[8]!,d=m[1]!,e=m[5]!,f=m[9]!,g=m[2]!,h=m[6]!,i=m[10]!;
  const A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;
  if(!Number.isFinite(det)||det===0)throw Error('Singular native inventory transform');
  return new Float32Array([A,(c*h-b*i),(b*f-c*e),B,(a*i-c*g),(c*d-a*f),C,(b*g-a*h),(a*e-b*d)].map(x=>x/det));
}
