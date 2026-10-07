export interface Timeline {frames:Array<[number,number]>;interpolate:boolean}
export function animationIndex(value:unknown,catalog:string,count:number):Map<string,Timeline>{
 const data=value as {version:number;catalog:string;rows:Array<[string,number]>;timelines:Timeline[]};
 if(!data||data.version!==1||data.catalog!==catalog||!Array.isArray(data.rows)||data.rows.length>1000000||!Array.isArray(data.timelines)||data.timelines.length>100000)throw Error('浏览动画索引无效');
 for(const t of data.timelines)if(!t||typeof t.interpolate!=='boolean'||!Array.isArray(t.frames)||t.frames.length<2||t.frames.length>10000||t.frames.some(f=>!Array.isArray(f)||f.length!==2||!Number.isSafeInteger(f[0])||f[0]<0||f[0]>=count||!Number.isSafeInteger(f[1])||f[1]<1||f[1]>100000))throw Error('浏览动画时间线无效');
 const index=new Map<string,Timeline>();
 for(const row of data.rows){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!/^(item|fluid|aspect)_[a-f0-9]{64}$/.test(row[0])||!Number.isSafeInteger(row[1])||!data.timelines[row[1]]||index.has(row[0]))throw Error('浏览动画条目无效');
  index.set(row[0],data.timelines[row[1]]!);
 }
 return index;
}
