import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRecipes} from '../src/catalog/bootstrap.ts';
test('first paint loads only the requested direction while retaining both complete directories',async()=>{
 const links={recipes:Array.from({length:414},(_,i)=>'r'+i),uses:['u0']};const calls=[];
 const catalog={directory:async()=>({links,recipes:[{id:'c',count:414}],uses:[{id:'u',count:1}],related:{categories:[],strings:[],items:[],fluids:[],textures:[],topics:[]}}),recipe:async id=>{calls.push(id);return {recipe:{id},related:{categories:[],strings:[]}};}};
 catalog.record=async()=>links;
 const result=await initialRecipes(catalog,'item','recipes');
 assert.equal(result.links.recipes.length,414);assert.equal(result.producedBy.categories[0].count,414);
 assert.deepEqual(calls,['r0']);assert.equal(result.usedIn.categories[0].count,1);
 });
