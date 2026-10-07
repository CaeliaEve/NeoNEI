import test from 'node:test';
import assert from 'node:assert/strict';
test('resident page projection preserves order, filters and group representatives',async()=>{
 const api=await import('../src/browser/resident-index.ts').catch(()=>null);assert.ok(api,'resident index missing');
 const rows=[{id:'a',registry:'m:a',terms:'iron',group:'g'},{id:'b',registry:'m:b',terms:'iron',group:'g'},{id:'c',registry:'n:c',terms:'copper'}];
 const index=new api.ResidentIndex(rows,[{id:'g',collapsed:true,representative:'b'}]);
 assert.deepEqual(index.page('', '',0,10).rows.map(r=>r.id),['b','c']);
 assert.deepEqual(index.page('iron','m',0,10).rows.map(r=>r.id),['b']);
 assert.deepEqual(index.page('', '',1,1).rows.map(r=>r.id),['c']);
});
test('latest frame task coalesces bursts and cancels on dispose',async()=>{
 const api=await import('../src/browser/latest-frame.ts').catch(()=>null);assert.ok(api,'latest frame scheduler missing');
 let callback;let canceled=false;const seen=[];
 const scheduler=api.latestFrame(cb=>{callback=cb;return 1;},()=>{canceled=true;});
 for(let i=0;i<50;i++)scheduler.schedule(()=>seen.push(i));callback();assert.deepEqual(seen,[49]);
 scheduler.schedule(()=>seen.push(99));scheduler.clear();assert.ok(canceled);
});

test('page navigation cannot wait indefinitely for a throttled animation frame',async()=>{
 const {latestFrame}=await import('../src/browser/latest-frame.ts');
 const seen=[];let frame;
 const scheduler=latestFrame(cb=>{frame=cb;return 1;},()=>{});
 for(let i=0;i<100;i++)scheduler.schedule(()=>seen.push(i));
 await new Promise(resolve=>setTimeout(resolve,40));
 assert.deepEqual(seen,[99]);frame();assert.deepEqual(seen,[99]);scheduler.clear();
});

test('native browser frame lookup preserves original dimensions across atlas pages',async()=>{
 const api=await import('../src/browser/native-frame.ts').catch(()=>null);
 assert.ok(api,'native frame mapping missing');
 const manifest={size:64,edge:1024,count:258,dimensions:Array.from({length:258},(_,i)=>i===257?[16,16]:[64,64]),files:[{path:'a'},{path:'b'}]};
 assert.deepEqual(api.nativeFrame(manifest,255),{path:'a',x:960,y:960,width:64,height:64,ticks:1});
 assert.deepEqual(api.nativeFrame(manifest,257),{path:'b',x:64,y:0,width:16,height:16,ticks:1});
 assert.throws(()=>api.nativeFrame(manifest,258));
});

test('cold page publishes identities without waiting for image preparation',async()=>{
 const api=await import('../src/browser/paging.ts').catch(()=>null);assert.ok(api,'nonblocking paging missing');
 let finish; const blocked=new Promise(resolve=>finish=resolve);let warming=false;
 const page=api.pageLoader(async()=>({rows:[{id:'target'}],total:1}),async()=>{warming=true;await blocked;});
 const result=await page('', '',0,1);assert.equal(result.rows[0].id,'target');assert.equal(warming,true);finish();
});

test('shared priority queue drops obsolete work without cancelling a current consumer',async()=>{
 const api=await import('../src/browser/priority-pool.ts').catch(()=>null);assert.ok(api,'priority queue missing');
 const pool=new api.PriorityPool(1);let release;const seen=[];
 const first=pool.run('busy',()=>new Promise(resolve=>release=resolve));
 const old=new AbortController();const obsolete=pool.run('old',async()=>seen.push('old'),old.signal,10).catch(e=>e.name);
 const sharedOld=new AbortController();const a=pool.run('shared',async()=>{seen.push('shared');return 7;},sharedOld.signal,10).catch(e=>e.name);
 const b=pool.run('shared',async()=>{throw Error('duplicate');},undefined,0);
 old.abort();sharedOld.abort();release(1);await first;
 assert.equal(await obsolete,'AbortError');assert.equal(await a,'AbortError');assert.equal(await b,7);assert.deepEqual(seen,['shared']);
});

test('history resolves stable IDs to the current native sprites, preserving recency',async()=>{
 const api=await import('../src/browser/history.ts').catch(()=>null);assert.ok(api,'history resolver missing');
 const saved=[{itemId:'b',residentSprite:999},{itemId:'missing'},{itemId:'a'},{itemId:'b'}];
 const rows=[{id:'a',name:'A',registry:'m:a',sprite:4},{id:'b',name:'B',registry:'m:b',sprite:8}];
 assert.deepEqual(api.resolveHistory(saved,rows).map(x=>[x.itemId,x.residentSprite]),[['b',8],['a',4]]);
});
