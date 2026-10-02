import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
test('permission delegation stays within effective caller capabilities without granting wildcard authority',()=>{
 assert.doesNotThrow(()=>core.assertDelegation(['workflow:todo','workflow:approve'],['workflow:todo']))
 assert.throws(()=>core.assertDelegation(['workflow:todo'],['system:user:delete']),error=>error.businessCode==='PRIVILEGE_BOUNDS')
 assert.throws(()=>core.assertDelegation(['*'],['*']),error=>error.status===403)
 assert.doesNotThrow(()=>core.assertDelegation(['*'],['system:role:assign']))
})
