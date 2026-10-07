import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRecipes} from '../src/catalog/bootstrap.ts';
test('first paint loads only the requested direction while retaining both complete directories',async()=>{
 const links={recipes:Array.from({length:414},(_,i)=>'r'+i),uses:['u0']};const calls=[];
 const catalog={directory:async()=>({links,recipes:[{id:'c',count:414}],uses:[{id:'u',count:1}],related:{categories:[],strings:[],items:[],fluids:[],textures:[],views:[],tracks:[],topics:[]}}),recipe:async id=>{calls.push(id);return {recipe:{id},related:{categories:[],strings:[]}};}};
 catalog.record=async()=>links;
 const result=await initialRecipes(catalog,'item','recipes');
 assert.equal(result.links.recipes.length,414);assert.equal(result.producedBy.categories[0].count,414);
 assert.deepEqual(calls,['r0']);assert.equal(result.usedIn.categories[0].count,1);
});

test('a first recipe is not a complete four-recipe category',async()=>{
 const {categoryDirectoryComplete}=await import('../src/composables/recipe-browser/recipeCategoryState.ts');
 assert.equal(categoryDirectoryComplete(['r0'],4),false);
 assert.equal(categoryDirectoryComplete(['r0','r1','r2','r3'],4),true);
});

test('adjacent recipe pages share aligned detail windows',async()=>{
 const {computeCategoryPackWindow}=await import('../src/composables/recipe-browser/recipeCategoryPackUtils.ts');
 assert.equal(computeCategoryPackWindow({targetStart:101,orderedRecipeCount:308,packWindowSize:8}),96);
 assert.equal(computeCategoryPackWindow({targetStart:102,orderedRecipeCount:308,packWindowSize:8}),96);
});
