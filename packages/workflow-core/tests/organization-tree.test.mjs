import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'

const department = (id,parentId=null,sort=1,status='enabled') => ({id,parentId,departmentName:id,sort,status,leader:'',revision:1,createdAt:'2026-10-01',updatedAt:'2026-10-01'})
test('organization tree sorts every level without mutating records and rejects malformed hierarchies', () => {
  const input=[department('child-b','root',2),department('root'),department('child-a','root',1),department('first',null,0)]
  const original=structuredClone(input)
  const tree=core.departmentTree(input)
  assert.deepEqual(tree.map(item=>item.id),['first','root'])
  assert.deepEqual(tree[1].children.map(item=>item.id),['child-a','child-b'])
  assert.deepEqual(input,original)
  for(const records of [[department('a'),department('a')],[department('a','missing')],[department('a','b'),department('b','a')],[department('a','a')]])
    assert.throws(()=>core.departmentTree(records),e=>e.businessCode==='ORGANIZATION_CORRUPT')
})
test('parent selection excludes the current subtree and disables descendants of unavailable departments', () => {
  const tree=core.departmentTree([department('root'),department('child','root'),department('grandchild','child'),department('disabled',null,1,'disabled'),department('unavailable','disabled')])
  const choices=core.departmentChoices(tree,'child')
  assert.deepEqual(choices.map(item=>item.value),['disabled','unavailable','root'])
  assert.equal(choices.find(item=>item.value==='unavailable').disabled,true)
  assert.equal(choices.find(item=>item.value==='unavailable').label,'disabled / unavailable')
})
