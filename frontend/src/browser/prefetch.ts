/** Predict a bounded window from navigation intent, never the pages skipped over. */
export function pagePrefetch() {
 let previous: {key:string;offset:number;time:number;direction:number} | undefined;
 return (query:string,mod:string,offset:number,limit:number,time:number) => {
  const key=JSON.stringify([query,mod,limit]),last=previous;
  const delta=last?.key===key?offset-last.offset:0;
  const direction=Math.sign(delta)||1;
  const elapsed=last?time-last.time:Infinity;
  const continuing=last?.key===key&&elapsed>=0&&elapsed<300&&(!last.direction||last.direction===direction);
  const depth=continuing&&delta!==0?Math.min(4,Math.max(2,Math.ceil(Math.abs(delta)/limit))):1;
  previous={key,offset,time,direction:delta?direction:0};
  return (total:number):number[] => {
   const offsets:number[]=[];
   for(let i=1;i<=depth;i++){const next=offset+direction*limit*i;if(next>=0&&next<total)offsets.push(next);}
   return offsets;
  };
 };
}
