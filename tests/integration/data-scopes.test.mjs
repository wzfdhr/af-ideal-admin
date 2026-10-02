import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {before,after,test} from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import contracts from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map(),passwords=new Map()
let server,base,originalAdmins
const ownedMembers=[]
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 originalAdmins=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin')")).rows
 const codes=(await pool.query('SELECT code FROM permission_definitions ORDER BY code')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(codes)])
 server=api.createServer(pool);base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{
 await server.close()
 await pool.query("UPDATE memberships SET status='disabled',deleted_at=now() WHERE user_id=ANY($1::text[])",[ownedMembers])
 for(const original of originalAdmins)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[original.tenant_id,original.user_id,JSON.stringify(original.permissions)])
 await pool.end()
})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID()}={})=>{
 if(!tokens.has(user)){
  const login=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:passwords.get(user)||user})})
  assert.equal(login.status,200);tokens.set(user,(await login.json()).data.token)
 }
 const response=await fetch(`${base}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 return {status:response.status,...await response.json()}
}
const ok=value=>{assert.equal(value.status,200,value.businessCode);return value.data}
const createDepartment=async(name,parentId=null)=>ok(await call('/system/departments',{method:'POST',body:{departmentName:`${name}-${randomUUID()}`,parentId,leader:'合成负责人',sort:0,status:'enabled'}}))
const createMember=async(department)=>{
 const body={username:`scope-user-${randomUUID().slice(0,8)}`,name:'范围合成成员',phone:'15000000001',email:'scope@invalid.example',initialPassword:'Scope-private-fixture-2026',status:'enabled'}
 const member=ok(await call('/system/users',{method:'POST',body}));passwords.set(body.username,body.initialPassword)
 ownedMembers.push(member.id)
 ok(await call(`/system/organization-members/${member.id}/assign`,{method:'POST',body:{departmentId:department.id,positionId:null,expectedRevision:member.revision}}))
 return {...member,username:body.username,revision:member.revision+1}
}
const roleFor=async(permissions)=>ok(await call('/system/roles',{method:'POST',body:{roleName:'数据范围角色',roleKey:`scope-${randomUUID().slice(0,8)}`,roleSort:0,status:'enabled',remark:'',permissions}}))
const ruleFor=async(role)=>ok(await call('/permissions/data-scopes?pageSize=100',{ })).list.find(value=>value.roleId===role.id)
const configure=async(role,scope,departmentIds=[],fields=contracts.MEMBER_SCOPE_FIELDS)=>{
 const old=await ruleFor(role)
 return ok(await call(`/permissions/data-scopes/${role.id}`,{method:'PUT',body:{dataScope:scope,departmentIds,fieldPermissions:fields,expectedRevision:old.revision}}))
}
test('member SQL applies self, department, descendants and tenant-only all across list, detail and write',async()=>{
 const root=await createDepartment('root'),child=await createDepartment('child',root.id),peer=await createDepartment('peer')
 const subject=await createMember(root),same=await createMember(root),descendant=await createMember(child),outside=await createMember(peer)
 const role=await roleFor(['system:user:list','system:user:detail','system:user:update'])
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 let members=ok(await call('/system/users',{user:subject.username})).list
 assert.deepEqual(members.map(value=>value.id),[subject.id])
 assert.equal((await call(`/system/users/${outside.id}`,{user:subject.username})).status,404)
 assert.equal((await call(`/system/users/${outside.id}`,{user:subject.username,method:'PUT',body:{name:'越界写入',expectedRevision:outside.revision}})).status,404)
 await configure(role,'department')
 members=ok(await call('/system/users',{user:subject.username})).list
 assert.ok(members.some(value=>value.id===same.id));assert.ok(!members.some(value=>value.id===descendant.id));assert.ok(!members.some(value=>value.id===outside.id))
 await configure(role,'department-and-children')
 members=ok(await call('/system/users',{user:subject.username})).list
 assert.ok(members.some(value=>value.id===descendant.id));assert.ok(!members.some(value=>value.id===outside.id))
 await configure(role,'all')
 assert.equal(ok(await call(`/system/users/${outside.id}`,{user:subject.username})).id,outside.id)
 assert.equal((await call('/system/users/b-admin',{user:subject.username})).status,404)
})
test('field permissions require the same role row scope and cannot recover hidden fields through filters or writes',async()=>{
 const root=await createDepartment('field-root'),other=await createDepartment('field-other'),subject=await createMember(root),target=await createMember(other)
 const permissions=['system:user:list','system:user:detail','system:user:update','system:user:read-contacts']
 const broad=await roleFor(permissions),own=await roleFor(permissions)
 await configure(broad,'all',[],['username','name','dept','status']);await configure(own,'self',[],contracts.MEMBER_SCOPE_FIELDS)
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[broad.id,own.id],directPermissions:[],expectedRevision:subject.revision}}))
 const ownData=ok(await call(`/system/users/${subject.id}`,{user:subject.username}));assert.equal(ownData.phone,'15000000001')
 const hidden=ok(await call(`/system/users/${target.id}`,{user:subject.username}));assert.equal('phone' in hidden,false);assert.equal('email' in hidden,false)
 const filtered=ok(await call('/system/users?phone=15000000001',{user:subject.username})).list
 assert.ok(!filtered.some(value=>value.id===target.id))
 const write=await call(`/system/users/${target.id}`,{user:subject.username,method:'PUT',body:{phone:'15000000002',expectedRevision:target.revision}})
 assert.equal(write.status,403);assert.equal(write.businessCode,'FIELD_FORBIDDEN')
 await configure(broad,'self')
 assert.equal((await call(`/system/users/${target.id}`,{user:subject.username})).status,404)
})
test('scope configuration is tenant-bound, versioned and cannot be used by a scoped holder to widen its authority',async()=>{
 const dept=await createDepartment('authority'),subject=await createMember(dept)
 const role=await roleFor(['system:user:list','data-permission:view','data-permission:update','data-permission:preview'])
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 const rule=await ruleFor(role),body={dataScope:'all',departmentIds:[],fieldPermissions:['username'],expectedRevision:rule.revision}
 assert.equal((await call(`/permissions/data-scopes/${role.id}`,{user:subject.username,method:'PUT',body})).status,403)
 assert.equal((await call(`/permissions/data-scopes/${role.id}`,{user:'b-admin',method:'PUT',body})).status,404)
 assert.equal((await call(`/permissions/data-scopes/${role.id}`,{method:'PUT',body:{...body,fieldPermissions:['password_hash']}})).status,422)
 const changed=ok(await call(`/permissions/data-scopes/${role.id}`,{method:'PUT',body}))
 assert.equal(changed.revision,rule.revision+1)
 assert.equal((await call(`/permissions/data-scopes/${role.id}`,{method:'PUT',body})).status,409)
 const preview=ok(await call('/permissions/data-scopes/preview',{method:'POST',body:{roleId:role.id,subjectUserId:subject.id}}))
 assert.equal('hiddenRows' in preview,false)
 assert.ok(preview.visibleRows.every(value=>!('phone' in value)&&!('name' in value)))
})
test('data scope field revocation cannot restore private fields from a cached mutation acknowledgement',async()=>{
 const department=await createDepartment('replay'),subject=await createMember(department),target=await createMember(department)
 const role=await roleFor(['system:user:list','system:user:detail','system:user:update'])
 await configure(role,'department',[],['name','username','status'])
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 const body={name:'修改过的合成姓名',expectedRevision:target.revision},key=randomUUID()
 const receipt=ok(await call(`/system/users/${target.id}`,{user:subject.username,method:'PUT',body,key}))
 assert.equal(receipt.id,target.id);assert.equal('name' in receipt,false)
 await configure(role,'department',[],['username','status'])
 const replay=ok(await call(`/system/users/${target.id}`,{user:subject.username,method:'PUT',body,key}))
 assert.deepEqual(replay,receipt)
 const detail=ok(await call(`/system/users/${target.id}`,{user:subject.username}))
 assert.equal('name' in detail,false)
})
test('scoped authorization cannot delegate a direct full grant, a broader role, or expand a bound role through editing',async()=>{
 const dept=await createDepartment('delegation'),other=await createDepartment('delegation-other')
 const subject=await createMember(dept),target=await createMember(dept),outside=await createMember(other)
 const codes=['system:user:create','system:user:list','system:user:detail','system:role:assign','system:role:update','system:role:permissions']
 const manager=await roleFor(codes);await configure(manager,'department')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[manager.id],directPermissions:[],expectedRevision:subject.revision}}))
 const create=await call('/system/users',{user:subject.username,method:'POST',body:{username:`denied-${randomUUID().slice(0,8)}`,name:'越界创建',phone:'',email:'',initialPassword:'Scope-create-denied-2026',status:'enabled'}})
 assert.equal(create.status,403);assert.equal(create.businessCode,'SCOPE_DELEGATION')
 const direct=await call(`/system/users/${target.id}/authorization`,{user:subject.username,method:'POST',body:{roleIds:[],directPermissions:['system:user:list'],expectedRevision:target.revision}})
 assert.equal(direct.status,403);assert.equal(direct.businessCode,'SCOPE_DELEGATION')
 const broad=await roleFor(['system:user:list']);await configure(broad,'all')
 const assign=await call(`/system/users/${target.id}/authorization`,{user:subject.username,method:'POST',body:{roleIds:[broad.id],directPermissions:[],expectedRevision:target.revision}})
 assert.equal(assign.status,403);assert.equal(assign.businessCode,'SCOPE_DELEGATION')
 ok(await call(`/system/users/${outside.id}/authorization`,{method:'POST',body:{roleIds:[broad.id],directPermissions:[],expectedRevision:outside.revision}}))
 const current=ok(await call(`/system/roles/${broad.id}`))
 const edited=await call(`/system/roles/${broad.id}`,{user:subject.username,method:'PUT',body:{roleName:current.roleName,roleKey:current.roleKey,roleSort:current.roleSort,status:current.status,remark:current.remark,permissions:['system:user:list','system:user:detail'],expectedRevision:current.revision}})
 assert.equal(edited.status,403);assert.equal(edited.businessCode,'SCOPE_DELEGATION')
 const preserved=ok(await call(`/system/roles/${broad.id}`));assert.equal(preserved.revision,current.revision);assert.deepEqual(preserved.permissions,['system:user:list'])
})
test('delegating self scope cannot combine one role field grant with another role row grant',async()=>{
 const dept=await createDepartment('delegation-fields'),subject=await createMember(dept),target=await createMember(dept)
 const codes=['system:user:list','system:role:assign']
 const broad=await roleFor(codes),own=await roleFor(codes),grant=await roleFor(['system:user:list'])
 await configure(broad,'all',[],['username','name','dept','status']);await configure(own,'self');await configure(grant,'self')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[broad.id,own.id],directPermissions:[],expectedRevision:subject.revision}}))
 const response=await call(`/system/users/${target.id}/authorization`,{user:subject.username,method:'POST',body:{roleIds:[grant.id],directPermissions:[],expectedRevision:target.revision}})
 assert.equal(response.status,403);assert.equal(response.businessCode,'SCOPE_DELEGATION')
})
test('scope configuration cannot widen fields by combining a broad masked role with a private self role',async()=>{
 const dept=await createDepartment('config-fields'),subject=await createMember(dept),target=await createMember(dept)
 const codes=['system:user:list','data-permission:view','data-permission:update','data-permission:preview']
 const broad=await roleFor(codes),own=await roleFor(codes),receiver=await roleFor(['system:user:list'])
 await configure(broad,'all',[],['username','name','dept','status']);await configure(own,'self')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[broad.id,own.id],directPermissions:[],expectedRevision:subject.revision}}))
 ok(await call(`/system/users/${target.id}/authorization`,{method:'POST',body:{roleIds:[receiver.id],directPermissions:[],expectedRevision:target.revision}}))
 const rule=await ruleFor(receiver)
 const response=await call(`/permissions/data-scopes/${receiver.id}`,{user:subject.username,method:'PUT',body:{dataScope:'self',departmentIds:[],fieldPermissions:contracts.MEMBER_SCOPE_FIELDS,expectedRevision:rule.revision}})
 assert.equal(response.status,403);assert.equal(response.businessCode,'SCOPE_DELEGATION')
 assert.equal((await ruleFor(receiver)).revision,rule.revision)
})
test('narrowing the last full member-data governor rolls back its rule and membership revisions',async()=>{
 const dept=await createDepartment('last-scope-governor'),subject=await createMember(dept)
 const role=await roleFor(['system:user:list','data-permission:view','data-permission:update'])
 await configure(role,'all')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 const admin=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 const previous=(await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id=ANY($1::text[]) AND user_id<>$2 AND status='enabled' RETURNING user_id",[ownedMembers,subject.id])).rows.map(value=>value.user_id)
 await pool.query("UPDATE memberships SET permissions=permissions-'data-permission:update' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
 try{
  const rule=await ruleFor(role)
  const before=(await pool.query("SELECT revision FROM memberships WHERE tenant_id='tenant-a' AND user_id=$1",[subject.id])).rows[0].revision
  const response=await call(`/permissions/data-scopes/${role.id}`,{user:subject.username,method:'PUT',body:{dataScope:'self',departmentIds:[],fieldPermissions:contracts.MEMBER_SCOPE_FIELDS,expectedRevision:rule.revision}})
  assert.equal(response.status,409);assert.equal(response.businessCode,'LAST_ADMINISTRATOR')
  const unchanged=await ruleFor(role);assert.equal(unchanged.revision,rule.revision);assert.equal(unchanged.dataScope,'all')
  assert.equal((await pool.query("SELECT revision FROM memberships WHERE tenant_id='tenant-a' AND user_id=$1",[subject.id])).rows[0].revision,before)
 }finally{
  await pool.query("UPDATE memberships SET permissions=$1 WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(admin)])
  await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id=ANY($1::text[])",[previous])
 }
})
test('preview and bound-member directory also respect the configurator own field permissions',async()=>{
 const dept=await createDepartment('preview-viewer'),subject=await createMember(dept),target=await createMember(dept)
 const viewer=await roleFor(['system:user:list','data-permission:view','data-permission:preview']),receiver=await roleFor(['system:user:list'])
 await configure(viewer,'all',[],['username']);await configure(receiver,'all',[],['username','name'])
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[viewer.id],directPermissions:[],expectedRevision:subject.revision}}))
 ok(await call(`/system/users/${target.id}/authorization`,{method:'POST',body:{roleIds:[receiver.id],directPermissions:[],expectedRevision:target.revision}}))
 const people=ok(await call(`/permissions/data-scopes/${receiver.id}/members`,{user:subject.username}));assert.equal(people.length,1);assert.equal('name' in people[0],false)
 const preview=ok(await call('/permissions/data-scopes/preview',{user:subject.username,method:'POST',body:{roleId:receiver.id,subjectUserId:target.id}}))
 assert.ok(preview.visibleRows.length>0);assert.ok(preview.visibleRows.every(row=>!('name' in row)))
})
test('raw contact authority scoped to self cannot unmask another role full tenant member rows or infer their phone filters',async()=>{
 const dept=await createDepartment('contact-authority'),subject=await createMember(dept),target=await createMember(dept)
 const broad=await roleFor(['system:user:list','system:user:detail']),own=await roleFor(['system:user:list','system:user:detail','system:user:read-contacts'])
 await configure(broad,'all');await configure(own,'self')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[broad.id,own.id],directPermissions:[],expectedRevision:subject.revision}}))
 assert.equal(ok(await call(`/system/users/${subject.id}`,{user:subject.username})).phone,'15000000001')
 const hidden=ok(await call(`/system/users/${target.id}`,{user:subject.username}));assert.equal(hidden.phone,contracts.maskPhone('15000000001'));assert.equal(hidden.contactsMasked,true)
 const filtered=ok(await call('/system/users?phone=15000000001',{user:subject.username})).list
 assert.ok(!filtered.some(value=>value.id===target.id))
})
test('organization and authorization selectors project member fields and reject hidden username filters and department writes',async()=>{
 const dept=await createDepartment('selector-fields'),subject=await createMember(dept),target=await createMember(dept)
 const role=await roleFor(['system:organization:assign','system:role:assign'])
 await configure(role,'all',[],['username'])
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 const organization=ok(await call('/system/organization-members?pageSize=100',{user:subject.username})).list.find(row=>row.id===target.id)
 assert.ok(organization);for(const field of ['name','status','departmentId','positionId','positionName'])assert.equal(field in organization,false)
 const authorization=ok(await call(`/system/authorization-members?keyword=${target.username}`,{user:subject.username})).list
 assert.equal(authorization.length,1);assert.equal('name' in authorization[0],false);assert.equal('status' in authorization[0],false)
 await configure(role,'all',[],[])
 assert.deepEqual(ok(await call(`/system/authorization-members?keyword=${target.username}`,{user:subject.username})).list,[])
 const write=await call(`/system/organization-members/${target.id}/assign`,{user:subject.username,method:'POST',body:{departmentId:dept.id,positionId:null,expectedRevision:target.revision}})
 assert.equal(write.status,403);assert.equal(write.businessCode,'FIELD_FORBIDDEN')
})
test('department placement cannot move a member outside the assigning actor scope or widen an implicit department role',async()=>{
 const dept=await createDepartment('placement'),outside=await createDepartment('placement-outside'),subject=await createMember(dept),target=await createMember(dept)
 const manager=await roleFor(['system:organization:assign','system:user:list','system:user:detail']),bound=await roleFor(['system:user:list','system:user:detail'])
 await configure(manager,'department');await configure(bound,'department')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[manager.id],directPermissions:[],expectedRevision:subject.revision}}))
 const assigned=ok(await call(`/system/users/${target.id}/authorization`,{method:'POST',body:{roleIds:[bound.id],directPermissions:[],expectedRevision:target.revision}}))
 const body={departmentId:outside.id,positionId:null,expectedRevision:assigned.revision}
 const placement=await call(`/system/organization-members/${target.id}/assign`,{user:subject.username,method:'POST',body})
 assert.equal(placement.status,403);assert.equal(placement.businessCode,'SCOPE_DELEGATION')
 const orgAll=await roleFor(['system:organization:assign']);await configure(orgAll,'all')
 const current=ok(await call(`/system/users/${subject.id}/authorization`))
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[manager.id,orgAll.id],directPermissions:[],expectedRevision:current.revision}}))
 const widened=await call(`/system/organization-members/${target.id}/assign`,{user:subject.username,method:'POST',body})
 assert.equal(widened.status,403);assert.equal(widened.businessCode,'SCOPE_DELEGATION')
 const unchanged=ok(await call('/system/organization-members?pageSize=100')).list.find(row=>row.id===target.id)
 assert.equal(unchanged.departmentId,dept.id);assert.equal(unchanged.revision,assigned.revision)
 const child=await createDepartment('placement-allowed-child',dept.id),peer=await createMember(child)
 await configure(manager,'department-and-children')
 const accepted=ok(await call(`/system/organization-members/${target.id}/assign`,{user:subject.username,method:'POST',body:{...body,departmentId:child.id}}))
 assert.equal(accepted.departmentId,child.id);assert.equal(accepted.revision,assigned.revision+1)
 const visible=ok(await call('/system/users?pageSize=100',{user:target.username})).list
 assert.ok(visible.some(row=>row.id===peer.id));assert.ok(!visible.some(row=>row.id===subject.id))
})
test('organization command replay reprojects the canonical receipt after department field permission is revoked',async()=>{
 const dept=await createDepartment('assignment-replay'),subject=await createMember(dept),target=await createMember(dept)
 const role=await roleFor(['system:organization:assign']);await configure(role,'all',[],['username','dept'])
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 const body={departmentId:dept.id,positionId:null,expectedRevision:target.revision},key=randomUUID()
 const receipt=ok(await call(`/system/organization-members/${target.id}/assign`,{user:subject.username,method:'POST',body,key}));assert.equal(receipt.departmentId,dept.id)
 await configure(role,'all',[],['username'])
 const replay=ok(await call(`/system/organization-members/${target.id}/assign`,{user:subject.username,method:'POST',body,key}))
 assert.equal(replay.id,receipt.id);assert.equal(replay.revision,receipt.revision);assert.equal('departmentId' in replay,false);assert.equal('positionId' in replay,false)
 assert.equal((await pool.query("SELECT revision FROM memberships WHERE tenant_id='tenant-a' AND user_id=$1",[target.id])).rows[0].revision,receipt.revision)
 const effects=await pool.query("SELECT count(*) AS total FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='organization.assign' AND actor_id=$2 AND result='success'",[target.id,subject.id])
 assert.equal(Number(effects.rows[0].total),1)
})
test('reparenting a department cannot widen implicit or explicit descendant roles using department edit permission',async()=>{
 for(const explicit of [false,true]){
  const destination=await createDepartment('tree-destination'),source=await createDepartment('tree-source'),peer=await createDepartment('tree-peer')
  const subject=await createMember(explicit?peer:destination),hidden=await createMember(source)
  const role=await roleFor(['system:department:update','system:user:list','system:user:detail'])
  await configure(role,'department-and-children',explicit?[destination.id]:[])
  ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
  assert.equal((await call(`/system/users/${hidden.id}`,{user:subject.username})).status,404)
  const body={departmentName:source.departmentName,parentId:destination.id,leader:source.leader,sort:source.sort,status:source.status,expectedRevision:source.revision}
  const moved=await call(`/system/departments/${source.id}`,{user:subject.username,method:'PUT',body})
  assert.equal(moved.status,403);assert.equal(moved.businessCode,'SCOPE_DELEGATION')
  const unchanged=ok(await call(`/system/departments/${source.id}`));assert.equal(unchanged.parentId,null);assert.equal(unchanged.revision,source.revision)
  assert.equal((await call(`/system/users/${hidden.id}`,{user:subject.username})).status,404)
  ok(await call(`/system/departments/${source.id}`,{method:'PUT',body}))
  assert.equal(ok(await call(`/system/users/${hidden.id}`,{user:subject.username})).id,hidden.id)
 }
})
test('a structural editor can reorganize a subtree it already fully governs without manufacturing new authority',async()=>{
 const root=await createDepartment('tree-owned-root'),destination=await createDepartment('tree-owned-destination',root.id),source=await createDepartment('tree-owned-source',root.id)
 const subject=await createMember(root),recipient=await createMember(destination),target=await createMember(source)
 const editor=await roleFor(['system:department:update','system:user:list','system:user:detail']),bounded=await roleFor(['system:user:list','system:user:detail'])
 await configure(editor,'department-and-children');await configure(bounded,'department-and-children')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[editor.id],directPermissions:[],expectedRevision:subject.revision}}))
 ok(await call(`/system/users/${recipient.id}/authorization`,{method:'POST',body:{roleIds:[bounded.id],directPermissions:[],expectedRevision:recipient.revision}}))
 assert.equal((await call(`/system/users/${target.id}`,{user:recipient.username})).status,404)
 const beforeVersion=(await pool.query("SELECT revision FROM tenants WHERE id='tenant-a'")).rows[0].revision
 const body={departmentName:source.departmentName,parentId:destination.id,leader:source.leader,sort:source.sort,status:source.status,expectedRevision:source.revision},key=randomUUID()
 const moved=ok(await call(`/system/departments/${source.id}`,{user:subject.username,method:'PUT',body,key}))
 assert.equal(moved.parentId,destination.id);assert.equal(moved.revision,source.revision+1)
 assert.equal(ok(await call(`/system/departments/${source.id}`,{user:subject.username,method:'PUT',body,key})).revision,moved.revision)
 assert.equal(ok(await call(`/system/users/${target.id}`,{user:recipient.username})).id,target.id)
 assert.equal((await pool.query("SELECT revision FROM tenants WHERE id='tenant-a'")).rows[0].revision,beforeVersion+1)
 const fact=(await pool.query("SELECT detail FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='department.update' AND result='success'",[source.id])).rows
 assert.equal(fact.length,1);assert.equal(fact[0].detail.parentId,destination.id);assert.equal(fact[0].detail.previousParentId,root.id)
})
test('department deletion refuses live scope-root references until the role is explicitly reconfigured',async()=>{
 const root=await createDepartment('scope-root-reference'),role=await roleFor(['system:user:list'])
 await configure(role,'department-and-children',[root.id])
 const denied=await call(`/system/departments/${root.id}`,{method:'DELETE',body:{expectedRevision:root.revision}})
 assert.equal(denied.status,409);assert.equal(denied.businessCode,'DEPARTMENT_SCOPE_REFERENCED')
 assert.equal(ok(await call(`/system/departments/${root.id}`)).revision,root.revision)
 await configure(role,'self')
 ok(await call(`/system/departments/${root.id}`,{method:'DELETE',body:{expectedRevision:root.revision}}))
})
test('competing tree writes serialize against one revision and cannot commit a scoped import after a privileged move',async()=>{
 const destination=await createDepartment('tree-race-destination'),other=await createDepartment('tree-race-other'),source=await createDepartment('tree-race-source')
 const subject=await createMember(destination),hidden=await createMember(source),role=await roleFor(['system:department:update','system:user:list','system:user:detail'])
 await configure(role,'department-and-children')
 ok(await call(`/system/users/${subject.id}/authorization`,{method:'POST',body:{roleIds:[role.id],directPermissions:[],expectedRevision:subject.revision}}))
 const body={departmentName:source.departmentName,leader:source.leader,sort:source.sort,status:source.status,expectedRevision:source.revision},key=randomUUID()
 const [bounded,privileged]=await Promise.all([
  call(`/system/departments/${source.id}`,{user:subject.username,method:'PUT',body:{...body,parentId:destination.id}}),
  call(`/system/departments/${source.id}`,{method:'PUT',body:{...body,parentId:other.id},key}),
 ])
 assert.ok([403,409].includes(bounded.status));assert.ok(['SCOPE_DELEGATION','REVISION_CONFLICT'].includes(bounded.businessCode))
 const saved=ok(privileged);assert.equal(saved.parentId,other.id);assert.equal(saved.revision,source.revision+1)
 assert.equal(ok(await call(`/system/departments/${source.id}`)).parentId,other.id)
 assert.equal((await call(`/system/users/${hidden.id}`,{user:subject.username})).status,404)
 assert.equal(ok(await call(`/system/departments/${source.id}`,{method:'PUT',body:{...body,parentId:other.id},key})).revision,saved.revision)
 const effects=await pool.query("SELECT count(*) AS total FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action='department.update' AND result='success'",[source.id])
 assert.equal(Number(effects.rows[0].total),1)
})
