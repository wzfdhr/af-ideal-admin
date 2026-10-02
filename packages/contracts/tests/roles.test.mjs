import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '../dist/index.js'
test('role inputs reject uncontrolled privileges, unknown future fields and invalid versions',()=>{
 const body={roleName:'审批员',roleKey:'reviewer',roleSort:0,status:'enabled',remark:'',permissions:['workflow:todo','workflow:approve']}
 assert.deepEqual(contracts.parseRole(body).permissions,['workflow:approve','workflow:todo'])
 for(const change of [{permissions:['*']},{permissions:['workflow:todo','workflow:todo']},{permissions:['javascript:alert(1)']},{roleSort:1.5},{status:'future'},{dataScope:'all'}])assert.throws(()=>contracts.parseRole({...body,...change}),error=>error.status===422)
 assert.throws(()=>contracts.parseRole({...body,expectedRevision:0},true),error=>error.status===422)
})
test('role references and direct permissions cannot duplicate identities or create wildcard grants',()=>{
 assert.deepEqual(contracts.roleIds(['b','a']),['a','b'])
 assert.throws(()=>contracts.roleIds(['a','a']),error=>error.status===422)
 assert.throws(()=>contracts.permissionCodes(['*']),error=>error.status===422)
})
