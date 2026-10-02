import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
import contracts from '@af-admin/contracts'
const setup=()=>{
 const codes=contracts.PLATFORM_PERMISSION_CATALOGUE.map(value=>value.code)
 const store=new core.RoleDemoStore([{id:'admin',username:'admin',name:'Admin',tenantIds:['a','b'],permissions:codes},{id:'member',username:'member',name:'Member',tenantIds:['a'],permissions:[]}])
 const call=(method,path,body,key=crypto.randomUUID(),user='admin',tenant='a')=>store.request(method,path,user,tenant,body,key)
 return {store,call,codes}
}
const input={roleName:'目录角色',roleKey:'directory-role',roleSort:0,status:'enabled',remark:'',permissions:['system:department:list']}
test('role Mock follows scoped commands, rollback, permission union, version changes and idempotent replay',()=>{
 const {store,call}=setup(),key=crypto.randomUUID(),role=call('post','/system/roles',input,key)
 assert.equal(call('post','/system/roles',input,key).id,role.id)
 assert.throws(()=>call('get',`/system/roles/${role.id}`,undefined,undefined,'admin','b'),error=>error.status===404)
 const member=call('post','/system/users/member/authorization',{roleIds:[role.id],directPermissions:['leave:read:self'],expectedRevision:1})
 assert.equal(member.revision,2)
 assert.ok(store.permissions('member','a').includes('system:department:list'))
 assert.ok(store.permissions('member','a').includes('leave:read:self'))
 call('put',`/system/roles/${role.id}`,{...input,permissions:[],expectedRevision:1})
 assert.equal(store.permissionVersion('member','a'),3)
 assert.ok(!store.permissions('member','a').includes('system:department:list'))
 assert.throws(()=>call('put',`/system/roles/${role.id}`,{...input,expectedRevision:1}),error=>error.status===409)
 assert.throws(()=>call('delete',`/system/roles/${role.id}`,{expectedRevision:2}),error=>error.businessCode==='ROLE_REFERENCED')
 call('post','/system/users/member/authorization',{roleIds:[],directPermissions:[],expectedRevision:3})
 call('delete',`/system/roles/${role.id}`,{expectedRevision:2})
 assert.throws(()=>call('get',`/system/roles/${role.id}`),error=>error.status===404)
})
test('role Mock denies wildcard, privilege escalation and last governance loss without corrupting state',()=>{
 const {call,store}=setup()
 assert.throws(()=>call('post','/system/roles',{...input,permissions:['*']}),error=>error.status===422)
 assert.throws(()=>call('post','/system/roles',{...input,permissions:['not-registered:run']}),error=>error.status===422)
 assert.throws(()=>call('post','/system/users/admin/authorization',{roleIds:[],directPermissions:[],expectedRevision:1}),error=>error.businessCode==='LAST_ADMINISTRATOR')
 assert.ok(store.permissions('admin','a').includes('system:role:assign'))
 const limited=call('post','/system/roles',{...input,roleKey:'limited',permissions:Object.values(contracts.ROLE_PERMISSIONS)})
 call('post','/system/users/member/authorization',{roleIds:[limited.id],directPermissions:[],expectedRevision:1})
 assert.throws(()=>call('post','/system/roles',{...input,permissions:['system:user:delete']},undefined,'member'),error=>error.businessCode==='PRIVILEGE_BOUNDS')
})
