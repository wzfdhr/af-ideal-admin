import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'
const input={code:'device-options',name:'设备选项',kind:'dictionary',dictionaryId:'dict-owned',status:'enabled',description:''}
test('registered data source contract is closed, typed and versioned',()=>{
  assert.deepEqual(c.parseFormDataSource(input),input)
  assert.equal(c.parseFormDataSource({...input,expectedRevision:2},true).expectedRevision,2)
  for(const payload of [{...input,url:'http://localhost/private'},{...input,kind:'sql'},{...input,headers:{Authorization:'secret'}},{...input,tenantId:'foreign'},{...input,script:'execute()'},{...input,code:'../private'},{...input,status:'unknown'}])assert.throws(()=>c.parseFormDataSource(payload))
  assert.throws(()=>c.parseFormDataSource(input,true))
})
