import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
import contracts from '@af-admin/contracts'
test('R1 development actor, tenant contexts and approval candidates read current per-tenant permissions',()=>{
 const store=new core.R1DemoStore(),permissions=new Map()
 const baseline=(id)=>contracts.demoIdentities.find(identity=>identity.id===id).permissions
 store.setPermissionProvider((id,tenant)=>permissions.get(`${id}:${tenant}`)||baseline(id))
 permissions.set('cross-tenant-employee:tenant-a',['system:department:list'])
 permissions.set('cross-tenant-employee:tenant-b',['system:position:list'])
 const info=store.request('get','/user/info','cross-tenant-employee','tenant-a')
 assert.deepEqual(info.tenants.find(tenant=>tenant.tenantId==='tenant-b').permissions,['system:position:list'])
 assert.deepEqual(store.request('get','/tenants/tenant-b/context','cross-tenant-employee','tenant-a').permissions,['system:position:list'])
 permissions.set('a-manager-1:tenant-a',[])
 assert.equal(store.request('get','/tenants/tenant-a/members','a-admin','tenant-a').find(member=>member.id==='a-manager-1').canApprove,false)
 assert.throws(()=>store.request('get','/workflow-todos','a-manager-1','tenant-a'),error=>error.status===403)
})
