import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'
test('dictionary contract accepts bounded primitive values with explicit state and revision',()=>{
  assert.equal(c.parseDictionary({dictName:'设备类别',dictType:'equipment-type',dictStatus:'enabled',description:''}).dictType,'equipment-type')
  assert.deepEqual(c.parseDictionaryItems({expectedRevision:1,items:[{label:'零',value:0,disabled:false},{label:'否',value:false,disabled:true}]}).items.map(x=>x.value),[0,false])
})
test('dictionary contract rejects unknown keys, reserved types, duplicate values and unsafe payloads',()=>{
  const meta={dictName:'类别',dictType:'valid-type',dictStatus:'enabled',description:''}
  for(const extra of [{tenantId:'other'},{dictType:'dictStatus'},{dictType:'../private'},{dictStatus:'wrong'},{expectedRevision:1}]) assert.throws(()=>c.parseDictionary({...meta,...extra}))
  const item={label:'值',value:'v',disabled:false}
  for(const items of [[item,item],[{...item,value:{path:'/etc'}}],[{...item,value:Infinity}],[{...item,disabled:'false'}],[{...item,script:'execute()'}],Array(201).fill(item)]) assert.throws(()=>c.parseDictionaryItems({expectedRevision:1,items}))
  assert.throws(()=>c.parseDictionary(meta,true))
})
