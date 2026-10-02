import assert from 'node:assert/strict'
import {test} from 'node:test'
import contracts from '../dist/index.js'
test('data scopes are controlled enums and fields rather than external owner selectors or expressions',()=>{
 const body={dataScope:'self',departmentIds:[],fieldPermissions:['username','name'],expectedRevision:1}
 assert.equal(contracts.parseMemberScope(body).dataScope,'self')
 for(const change of [{dataScope:'script'},{ownerUserIds:['a-admin']},{fieldPermissions:['password_hash']},{departmentIds:['outside']},{fieldPermissions:['name','name']},{expectedRevision:0}])assert.throws(()=>contracts.parseMemberScope({...body,...change}),error=>error.status===422)
 assert.deepEqual(contracts.parseMemberScope({...body,dataScope:'department-and-children',departmentIds:['b','a']}).departmentIds,['a','b'])
})
