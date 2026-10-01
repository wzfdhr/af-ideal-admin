import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
import contracts from '@af-admin/contracts'
test('organization Mock shares strict public commands while keeping tenants, references and versions isolated',()=>{
 const store=new core.OrganizationDemoStore([{id:'admin',name:'Admin',tenantIds:['a','b']},{id:'employee',name:'Employee',tenantIds:['a']}])
 const actor={userId:'admin',tenantId:'a',permissions:[...Object.values(contracts.DEPARTMENT_PERMISSIONS),...Object.values(contracts.POSITION_PERMISSIONS)]}
 const call=(method,path,body,key=crypto.randomUUID(),identity=actor)=>store.request(method,path,identity,body,key)
 const body={departmentName:'Parent',leader:'',sort:1,status:'enabled'},key=crypto.randomUUID()
 const parent=call('post','/system/departments',body,key)
 assert.equal(call('post','/system/departments',body,key).id,parent.id)
 const child=call('post','/system/departments',{...body,departmentName:'Child',parentId:parent.id})
 assert.throws(()=>call('put',`/system/departments/${parent.id}`,{...body,parentId:child.id,expectedRevision:1}),error=>error.status===409)
 assert.equal(call('get','/system/departments/tree').find(item=>item.id===parent.id).children[0].id,child.id)
 assert.throws(()=>call('get',`/system/departments/${parent.id}`,undefined,undefined,{...actor,tenantId:'b'}),error=>error.status===404)
 assert.throws(()=>call('get','/system/positions',undefined,undefined,{...actor,userId:'employee',permissions:[]}),error=>error.status===403)
 const position=call('post','/system/positions',{departmentId:child.id,positionName:'岗位',status:'enabled'})
 const assigned=call('post','/system/organization-members/employee/assign',{departmentId:child.id,positionId:position.id,expectedRevision:1})
 assert.equal(assigned.revision,2)
 assert.equal(call('get','/system/organization-members').list.find(member=>member.id==='employee').positionName,'岗位')
 assert.throws(()=>call('delete',`/system/positions/${position.id}`,{expectedRevision:1}),error=>error.status===409)
 assert.throws(()=>call('post','/system/organization-members/employee/assign',{departmentId:parent.id,positionId:position.id,expectedRevision:2}),error=>error.status===422)
 assert.equal(call('get','/system/organization-members').list.find(member=>member.id==='employee').revision,2)
 call('post','/system/organization-members/employee/assign',{departmentId:parent.id,positionId:null,expectedRevision:2})
 call('delete',`/system/positions/${position.id}`,{expectedRevision:1})
 const update=call('put',`/system/departments/${child.id}`,{...body,departmentName:'Updated',parentId:parent.id,expectedRevision:1})
 assert.equal(update.revision,2)
 assert.equal('expectedRevision' in update,false)
 assert.throws(()=>call('delete',`/system/departments/${child.id}`,{expectedRevision:1}),error=>error.status===409)
 call('delete',`/system/departments/${child.id}`,{expectedRevision:2})
 const roots=call('get','/system/departments/tree');roots[0].departmentName='external mutation'
 assert.notEqual(call('get','/system/departments/tree')[0].departmentName,'external mutation')
})
