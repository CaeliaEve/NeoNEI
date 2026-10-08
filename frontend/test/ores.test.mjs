import assert from 'node:assert/strict';
import test from 'node:test';
import { Query } from '../../catalog/src/query.ts';

test('ore member pagination reads exact positions and never scans off-page registrations', async () => {
  const group = {id:'oregroup_fixture', name:'oreFixture', members:1000000, order:0};
  const requests = [];
  const catalog = {
    record: async (kind,id) => { assert.equal(kind,'ore-groups'); assert.equal(id,group.id); return group; },
    all: async () => { throw Error('Unbounded collection scan'); },
    records: async (kind,ids) => {
      const keys = [...ids]; requests.push([kind,keys]);
      if (kind !== 'ore-members') { assert.deepEqual(keys,[]); return []; }
      assert.deepEqual(keys,[999998,999999].map(index=>`${group.id}.member_${index.toString(16).padStart(8,'0')}`));
      return keys.map((id,i)=>({id,group:group.id,index:999998+i,template:{registry:'fixture:item',meta:32767,nbt:null,amount:'-4'},display:null}));
    },
  };
  const query = new Query(catalog);
  assert.equal(typeof query.oreMembers,'function','Ore membership paging is missing');
  const result = await query.oreMembers(group.id,999998,20);
  assert.deepEqual(result.rows.map(row=>row.index),[999998,999999]);
  assert.equal(result.total,1000000);
  assert.equal(result.rows[0].template.amount,'-4');
  assert.equal(requests.filter(([kind])=>kind==='ore-members').length,1);
  const beyond = await query.oreMembers(group.id,1000000,20);
  assert.deepEqual(beyond.rows,[]);
});
