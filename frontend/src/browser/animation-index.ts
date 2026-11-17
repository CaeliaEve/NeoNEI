export interface Timeline {frames:Array<[number,number]>;interpolate:boolean}
export function animationIndex(value:unknown,catalog:string,count:number):Map<string,Timeline>{
 const data=value as {version:number;catalog:string;rows:Array<[string,number]>;timelines:Timeline[]};
 if(!data||![1,2].includes(data.version)||data.catalog!==catalog||!Array.isArray(data.rows)||data.rows.length>1000000||!Array.isArray(data.timelines)||data.timelines.length>100000)throw Error('浏览动画索引无效');
 for(const t of data.timelines)if(!t||typeof t.interpolate!=='boolean'||!Array.isArray(t.frames)||t.frames.length<2||t.frames.length>10000||t.frames.some(f=>!Array.isArray(f)||f.length!==2||!Number.isSafeInteger(f[0])||f[0]<0||f[0]>=count||!Number.isSafeInteger(f[1])||f[1]<1||f[1]>100000))throw Error('浏览动画时间线无效');
 const index=new Map<string,Timeline>();
 for(const row of data.rows){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!/^(item|fluid|aspect)_[a-f0-9]{64}$/.test(row[0])||!Number.isSafeInteger(row[1])||!data.timelines[row[1]]||index.has(row[0]))throw Error('浏览动画条目无效');
  index.set(row[0],data.timelines[row[1]]!);
 }
 return index;
}

export function animationPrograms(value:unknown,catalog:string):Map<string,string>{
 const data=value as {version:number;catalog:string;programs:Array<[string,string]>;rows:Array<[string,number]>};
 // Archived v1 packs contain finite timelines only. They keep their original
 // schema and identity; a v1 tag never grants access to the new program field.
 if(data?.version===1&&data.catalog===catalog){if('programs' in data)throw Error('旧版浏览包不能声明程序动画');return new Map();}
 if(!data||data.version!==2||data.catalog!==catalog||!Array.isArray(data.programs)||data.programs.length>1000000||!Array.isArray(data.rows))throw Error('浏览程序动画索引无效');
 const timelines=new Set(data.rows.map(row=>row[0])),programs=new Map<string,string>();
 for(const row of data.programs){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!/^(item|fluid|aspect)_[a-f0-9]{64}$/.test(row[0])
   ||typeof row[1]!=='string'||!/^asset_[a-f0-9]{64}$/.test(row[1])||programs.has(row[0])||timelines.has(row[0]))throw Error('浏览程序动画条目无效');
  programs.set(row[0],row[1]);
 }return programs;
}
