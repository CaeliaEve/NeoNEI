import type {JavaRandom} from './native-random.ts';

/** Java player ticks, then int->float. Do not reduce to a pretend 600s loop
 * before casting: the native shader performs mod(time2,12000) afterwards. */
export function cosmicTime(milliseconds:number):number{
  if(!Number.isFinite(milliseconds)||milliseconds<0||!Number.isSafeInteger(Math.floor(milliseconds/50)))throw Error('Invalid native shader clock');
  return Math.fround(Number(BigInt.asIntN(32,BigInt(Math.floor(milliseconds/50)))));
}
export function eternalPulse(random:JavaRandom){
  const scale=random.nextGaussian()*0.15+0.95,offset=(1-scale)/2;
  return {scale,offset,translate:offset*16};
}

/** Only these reviewed loaded shader sources are implemented. Source records
 * select a profile; they never provide GLSL to compile in the browser. */
export const cosmicProfiles=Object.freeze({
  avaritia:Object.freeze({version:'1.77',vertex:'31a4078eeb6694f0625813f2d88aa152ddd84a38763da03e1ebdd81c0a476824',fragment:'275a574e59940cf966078b38e66aa0de00e1dbee280013b47692f4264943f34d',redMask:false}),
  eternal:Object.freeze({version:'1.2.3',vertex:'31a4078eeb6694f0625813f2d88aa152ddd84a38763da03e1ebdd81c0a476824',fragment:'c074f2a43a76204d5a31ea7aeba4cbd06dda5000997c5bd5119913f532d148b4',redMask:true}),
});

/* Avaritia cosmic shaders, Copyright (c) 2015-2018 Spiteful Fox.
 * The MIT License (MIT)
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Inventory GLSL 300 ES port of the installed 1.77/1.2.3 programs. Native
 * UV-space derivatives are retained while sampling small independent regions
 * with their native mip chain. No full Minecraft atlas is uploaded/downloaded.
 */
export const cosmicVertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 at;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
uniform mat4 modelView,projection;
uniform mat3 normalTransform;
uniform float activeLights;
uniform vec4 sceneColor,materialAmbient,materialDiffuse;
uniform vec4 lightPosition[2],lightAmbient[2],lightDiffuse[2];
uniform vec3 attenuation[2],spotDirection[2];
uniform float spotCutoff[2],spotCosCutoff[2],spotExponent[2];
out vec3 position;
out vec2 nativeUV;
out vec4 primary;
void processLight(int i,vec3 n,vec3 eyePosition,inout vec4 ambient,inout vec4 diffuse){
  float amount=1.0;vec3 direction;
  if(spotCutoff[i]==180.0&&lightPosition[i].w==0.0){direction=normalize(lightPosition[i].xyz);}
  else{
    vec3 delta=lightPosition[i].xyz-eyePosition;float distance=length(delta);direction=normalize(delta);
    amount=1.0/(attenuation[i].x+attenuation[i].y*distance+attenuation[i].z*distance*distance);
    if(spotCutoff[i]!=180.0){
      float dotSpot=dot(-direction,normalize(spotDirection[i]));
      amount*=dotSpot<spotCosCutoff[i]?0.0:pow(dotSpot,spotExponent[i]);
    }
  }
  ambient+=lightAmbient[i]*amount;diffuse+=lightDiffuse[i]*max(0.0,dot(n,direction))*amount;
}
void main(){
  vec4 eye=modelView*vec4(at,1.0);gl_Position=projection*eye;
  vec3 n=normalize(normalTransform*normal);vec4 ambient=vec4(0.0),diffuse=vec4(0.0);
  if(activeLights>0.0)processLight(0,n,eye.xyz/eye.w,ambient,diffuse);
  if(activeLights>1.0)processLight(1,n,eye.xyz/eye.w,ambient,diffuse);
  primary=clamp(sceneColor+ambient*materialAmbient+diffuse*materialDiffuse,0.0,1.0);
  nativeUV=uv;position=eye.xyz;
}`;

export const cosmicFragment=`#version 300 es
precision highp float;
precision highp int;
#define M_PI 3.1415926535897932384626433832795
uniform sampler2D source0,source1,source2,source3,source4,source5,source6,source7,source8,source9,source10;
uniform vec4 sourceRect[11];
uniform float sourceLodBias[11];
uniform bool alphaTest;uniform int alphaFunc;uniform float alphaRef;
uniform vec3 lightlevel;
uniform float time2,yaw,pitch,externalScale,lightmix,opacity;
uniform mat2 cosmicuvs[10];
uniform bool redMask;
in vec3 position;
in vec2 nativeUV;
in vec4 primary;
out vec4 pixel;
vec4 sampleNative(int i,vec2 nativeCoord){
  vec2 local=(nativeCoord-sourceRect[i].xy)*sourceRect[i].zw;
  vec2 dx=dFdx(nativeCoord)*sourceRect[i].zw*exp2(sourceLodBias[i]),dy=dFdy(nativeCoord)*sourceRect[i].zw*exp2(sourceLodBias[i]);
  if(i==0)return textureGrad(source0,local,dx,dy);
  if(i==1)return textureGrad(source1,local,dx,dy);
  if(i==2)return textureGrad(source2,local,dx,dy);
  if(i==3)return textureGrad(source3,local,dx,dy);
  if(i==4)return textureGrad(source4,local,dx,dy);
  if(i==5)return textureGrad(source5,local,dx,dy);
  if(i==6)return textureGrad(source6,local,dx,dy);
  if(i==7)return textureGrad(source7,local,dx,dy);
  if(i==8)return textureGrad(source8,local,dx,dy);
  if(i==9)return textureGrad(source9,local,dx,dy);
  return textureGrad(source10,local,dx,dy);
}
float rand2d(vec2 x){return fract(sin(mod(dot(x,vec2(12.9898,78.233)),3.14))*43758.5453);}
mat4 rotationMatrix(vec3 axis,float angle){
  axis=normalize(axis);float s=sin(angle),c=cos(angle),oc=1.0-c;
  return mat4(oc*axis.x*axis.x+c,oc*axis.x*axis.y-axis.z*s,oc*axis.z*axis.x+axis.y*s,0.0,
    oc*axis.x*axis.y+axis.z*s,oc*axis.y*axis.y+c,oc*axis.y*axis.z-axis.x*s,0.0,
    oc*axis.z*axis.x-axis.y*s,oc*axis.y*axis.z+axis.x*s,oc*axis.z*axis.z+c,0.0,
    0.0,0.0,0.0,1.0);
}
void main(){
  vec4 light=primary,mask=sampleNative(0,nativeUV);light.rgb*=lightlevel;
  float correctTime=mod(time2,12000.0),oneOverExternalScale=1.0/externalScale;
  int uvtiles=16;vec4 col=vec4(0.1,0.0,0.0,1.0);float pulse=mod(correctTime,400.0)/400.0;
  col.g=sin(pulse*M_PI*2.0)*0.075+0.225;col.b=cos(pulse*M_PI*2.0)*0.05+0.3;
  vec4 dir=normalize(vec4(-position,0.0));float sb=sin(pitch),cb=cos(pitch);
  dir=normalize(vec4(dir.x,dir.y*cb-dir.z*sb,dir.y*sb+dir.z*cb,0.0));
  float sa=sin(-yaw),ca=cos(-yaw);dir=normalize(vec4(dir.z*sa+dir.x*ca,dir.y,dir.z*ca-dir.x*sa,0.0));
  for(int i=0;i<16;i++){
    int mult=16-i,j=i+7,k=j+1;
    float rand1=float(j*j*4321+j*8)*2.0,rand2=float(k*k*k*239+k*37)*3.6,rand3=rand1*347.4+rand2*63.4;
    vec3 axis=normalize(vec3(sin(rand1),sin(rand2),cos(rand3)));vec4 ray=dir*rotationMatrix(axis,mod(rand3,2.0*M_PI));
    float rawu=0.5+atan(ray.z,ray.x)/(2.0*M_PI),rawv=0.5+asin(ray.y)/M_PI;
    float scale=float(mult)*0.5+2.75,u=rawu*scale*externalScale;
    float v=(rawv+correctTime*0.0002*oneOverExternalScale)*scale*0.6*externalScale;
    int tu=int(mod(floor(u*float(uvtiles)),float(uvtiles))),tv=int(mod(floor(v*float(uvtiles)),float(uvtiles)));
    int symbol=int(rand2d(vec2(float(tu),float(tv)+float(i)*10.0))*101.0);
    int rotation=int(mod(pow(float(tu),float(tv))+float(tu)+3.0+float(tv*i),8.0));bool flip=false;
    if(rotation>=4){rotation-=4;flip=true;}
    if(symbol>=0&&symbol<10){
      float ru=clamp(mod(u,1.0)*float(uvtiles)-float(tu),0.0,1.0),rv=clamp(mod(v,1.0)*float(uvtiles)-float(tv),0.0,1.0);
      if(flip)ru=1.0-ru;float oru=ru,orv=rv;
      if(rotation==1){oru=1.0-rv;orv=ru;}else if(rotation==2){oru=1.0-ru;orv=1.0-rv;}else if(rotation==3){oru=rv;orv=1.0-ru;}
      float umin=cosmicuvs[symbol][0][0],umax=cosmicuvs[symbol][1][0],vmin=cosmicuvs[symbol][0][1],vmax=cosmicuvs[symbol][1][1];
      vec2 uv=vec2(umin*(1.0-oru)+umax*oru,vmin*(1.0-orv)+vmax*orv);
      vec4 tcol=sampleNative(symbol+1,uv);
      float a=tcol.r*(0.5+(1.0/float(mult))*1.0)*(1.0-smoothstep(0.15,0.48,abs(rawv-0.5)));
      float r=mod(rand1,29.0)/29.0*0.3+0.4,g=mod(rand2,35.0)/35.0*0.4+0.6,b=mod(rand1,17.0)/17.0*0.3+0.7;
      col=col+vec4(r,g,b,1.0)*a;
    }
  }
  col.rgb*=light.rgb*lightmix+vec3(1.0-lightmix);
  col.a*=(redMask?mask.r:mask.a)*opacity;pixel=clamp(col,0.0,1.0);
  if(alphaTest){bool keep=false;
    if(alphaFunc==513)keep=pixel.a<alphaRef;else if(alphaFunc==514)keep=pixel.a==alphaRef;
    else if(alphaFunc==515)keep=pixel.a<=alphaRef;else if(alphaFunc==516)keep=pixel.a>alphaRef;
    else if(alphaFunc==517)keep=pixel.a!=alphaRef;else if(alphaFunc==518)keep=pixel.a>=alphaRef;
    else if(alphaFunc==519)keep=true;
    if(!keep)discard;
  }
}`;
