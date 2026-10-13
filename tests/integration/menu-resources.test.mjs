import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {before,after,test} from 'node:test'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import db from '../../services/reference-api/dist/database.js'
import migration from '../../services/reference-api/dist/migrate.js'
import seed from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
const pool=db.createPool(),tokens=new Map();let server,base,originals,fail=false
before(async()=>{await migration.migrate(pool);await seed.seedDemo(pool);originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN('a-admin','b-admin')")).rows;const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code);await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN('a-admin','b-admin')",[JSON.stringify(all)]);server=api.createServer(pool,point=>{if(fail&&point==='menu:changed'){fail=false;throw Error('Controlled menu rollback')}});base=await server.listen({host:'127.0.0.1',port:0})})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(endpoint,{user='a-admin',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)}
 const response=await fetch(`${origin}/api${endpoint}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}
}
const ok=r=>{assert.equal(r.status,200,r.message);return r.data}
const create=async(body)=>ok(await call('/system/menus',{method:'POST',body}))
const directory=()=>create({menuName:`真实目录-${randomUUID().slice(0,8)}`,menuType:'catalog',parentId:null,permission:'',sort:10,status:'enabled'})
const payload=row=>({menuName:row.menuName,menuType:row.menuType,...(row.routeKey?{routeKey:row.routeKey}:{}),parentId:row.parentId,permission:row.permission,sort:row.sort,status:row.status,expectedRevision:row.revision})
const update=async(row,change={})=>ok(await call(`/system/menus/${row.id}`,{method:'PUT',body:{...payload(row),...change}}))
test('real menu CRUD preserves separate tenant identities and routes only registered components; deletion retains recoverable facts',async()=>{
 assert.ok(ok(await call('/system/menus?menuName=&pageSize=100')).total>0)
 const parent=await directory(),page=await create({menuName:'真实字典入口',menuType:'menu',routeKey:'dictSystem',parentId:parent.id,permission:'',sort:2,status:'enabled'})
 assert.equal(page.path,'/system/dictSystem');assert.equal(page.componentKey,'SystemDictPage');assert.deepEqual(page.permissions,['system:dict:list'])
 const state=ok(await call('/navigation/state'));assert.equal(state.menus.find(node=>node.name===`menu-entry-${parent.id}`).children[0].meta.targetRouteName,'dictSystem')
 assert.equal((await call(`/system/menus/${page.id}`,{user:'b-admin'})).status,404)
 assert.equal((await call(`/system/menus/${parent.id}`,{method:'DELETE',body:{expectedRevision:parent.revision}})).businessCode,'MENU_REFERENCED')
 const deleted=ok(await call(`/system/menus/${page.id}`,{method:'DELETE',body:{expectedRevision:page.revision}}));assert.ok(deleted.deletedAt)
 const restored=ok(await call(`/system/menus/${page.id}/restore`,{method:'POST',body:{expectedRevision:deleted.revision}}));assert.equal(restored.deletedAt,null)
 assert.equal((await pool.query("SELECT id FROM audit_events WHERE tenant_id='tenant-a' AND target_id=$1 AND action IN('menu.create','menu.delete','menu.restore')",[page.id])).rowCount,3)
 await update(restored,{status:'disabled'})
})
test('ancestor disable affects aliases and direct route access; governance entries and malformed graph or bindings stay protected',async()=>{
 const parent=await directory(),child=await create({menuName:'子目录',menuType:'catalog',parentId:parent.id,permission:'',sort:0,status:'enabled'}),page=await create({menuName:'目录内字典',menuType:'menu',routeKey:'dictSystem',parentId:child.id,permission:'',sort:0,status:'enabled'})
 assert.equal((await call(`/system/menus/${parent.id}`,{method:'PUT',body:{...payload(parent),parentId:child.id}})).businessCode,'MENU_CYCLE')
 assert.equal((await call(`/system/menus/${page.id}`,{method:'PUT',body:{...payload(page),routeKey:'userSystem'}})).businessCode,'MENU_BINDING_IMMUTABLE')
 const original=ok(await call('/system/menus/default-dictSystem')),disabled=await update(original,{status:'disabled'})
 try{assert.equal(ok(await call('/navigation/access/dictSystem')).allowed,true);await update(parent,{status:'disabled'});assert.equal(ok(await call('/navigation/access/dictSystem')).allowed,false);assert.equal(ok(await call('/navigation/access/dictSystem',{user:'b-admin'})).allowed,true)}finally{await update(disabled,{status:'enabled'})}
 const protectedRow=ok(await call('/system/menus/default-menuSystem'));assert.equal((await call(`/system/menus/${protectedRow.id}`,{method:'PUT',body:{...payload(protectedRow),status:'disabled'}})).businessCode,'MENU_GOVERNANCE_PROTECTED')
 assert.equal((await call('/system/menus/default-system',{method:'DELETE',body:{expectedRevision:1}})).businessCode,'MENU_GOVERNANCE_PROTECTED')
 assert.equal((await call('/system/menus',{method:'POST',body:{menuName:'脚本菜单',menuType:'menu',routeKey:'dictSystem',parentId:null,permission:'',sort:0,status:'enabled',componentKey:'fetch()'}})).status,422)
})
test('menu mutations are atomic and idempotent, competing revisions have one effect, and revoked permission cannot recover a cached command',async()=>{
 const key=randomUUID(),body={menuName:'故障恢复目录',menuType:'catalog',parentId:null,permission:'',sort:0,status:'enabled'},count=async()=>Number((await pool.query("SELECT count(*) AS n FROM menu_resources WHERE tenant_id='tenant-a'")).rows[0].n),before=await count();fail=true
 assert.equal((await call('/system/menus',{method:'POST',body,key})).status,500);assert.equal(await count(),before)
 const row=ok(await call('/system/menus',{method:'POST',body,key}));assert.deepEqual(ok(await call('/system/menus',{method:'POST',body,key})),row);assert.equal(await count(),before+1)
 const results=await Promise.all([call(`/system/menus/${row.id}`,{method:'PUT',body:{...payload(row),menuName:'编辑一'}}),call(`/system/menus/${row.id}`,{method:'PUT',body:{...payload(row),menuName:'编辑二'}})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409])
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 try{await pool.query("UPDATE memberships SET permissions=permissions-'system:menu:create' WHERE tenant_id='tenant-a' AND user_id='a-admin'");assert.equal((await call('/system/menus',{method:'POST',body,key})).status,403)}finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(permissions)])}
})
test('button visibility declares existing per-page authority without granting API powers; disabled ancestors persist and permissions cannot be redirected',async()=>{
 const parent=await create({menuName:'按钮设备入口',menuType:'menu',routeKey:'businessRecordsList',parentId:null,permission:'',sort:0,status:'enabled'}),button=await create({menuName:'创建记录',menuType:'button',parentId:parent.id,permission:'business:create',sort:0,status:'disabled'})
 assert.ok(ok(await call('/navigation/state')).disabledButtons.some(row=>row.parentRoute==='businessRecordsList'&&row.permission==='business:create'))
 assert.equal((await call(`/system/menus/${button.id}`,{method:'PUT',body:{...payload(button),permission:'system:user:create'}})).businessCode,'MENU_BINDING_IMMUTABLE')
 assert.equal((await call('/system/menus',{method:'POST',body:{menuName:'越权按钮',menuType:'button',parentId:parent.id,permission:'system:menu:update',sort:0,status:'disabled'}})).status,422)
 assert.equal((await call('/system/menus',{user:'a-employee',method:'POST',body:{menuName:'越权目录',menuType:'catalog',parentId:null,permission:'',sort:0,status:'enabled'}})).status,403)
 await update(button,{status:'enabled'})
})
test('persistent navigation survives real API replacement and next request revocation; database rejects cross-tenant edges, cycles and route mutation',async()=>{
 const parent=await directory(),row=await create({menuName:'进程替换字典入口',menuType:'menu',routeKey:'dictSystem',parentId:parent.id,permission:'',sort:0,status:'enabled'})
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
 try{const[ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)});assert.equal(ok(await call(`/system/menus/${row.id}`,{origin:ready.base})).menuName,row.menuName)}finally{const stop=once(child,'exit');child.kill('SIGTERM');await stop}
 await assert.rejects(pool.query("UPDATE menu_resources SET route_key='userSystem' WHERE tenant_id='tenant-a' AND id=$1",[row.id]),error=>error.code==='23514')
 await assert.rejects(pool.query("UPDATE menu_resources SET parent_id=$1 WHERE tenant_id='tenant-a' AND id=$2",[row.id,parent.id]),error=>error.code==='23514')
 await assert.rejects(pool.query("UPDATE menu_resources SET parent_id=$1 WHERE tenant_id='tenant-b' AND id='default-dictSystem'",[parent.id]),error=>error.code==='23503')
 await update(row,{status:'disabled'})
})

test('configuration creator scope filters lists, selectors and raw commands, and a narrowed role cannot recover an earlier global receipt',async()=>{
 const codes=['system:menu:list','system:menu:detail','system:menu:create','system:menu:update','system:menu:delete'],admin=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions,employee=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions,role=`menu-scope-${randomUUID().slice(0,8)}`
 try{
  await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(codes)])
  const authored=ok(await call('/system/menus',{user:'a-employee',method:'POST',body:{menuName:'另一成员的菜单资源',menuType:'catalog',parentId:null,permission:'',sort:0,status:'enabled'}})),key=randomUUID(),body={...payload(authored),menuName:'先前全局授权修改'}
  ok(await call(`/system/menus/${authored.id}`,{method:'PUT',body,key}))
  await pool.query("INSERT INTO roles(tenant_id,id,role_name,role_key) VALUES('tenant-a',$1,'菜单元数据范围',$1)",[role])
  for(const code of codes)await pool.query("INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,$2)",[role,code])
  await pool.query("INSERT INTO role_member_scopes(tenant_id,role_id,data_scope,field_permissions) VALUES('tenant-a',$1,'self','[]'::jsonb)",[role]);await pool.query("INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-admin',$1)",[role]);await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(admin.filter(code=>!codes.includes(code)))])
  assert.equal((await call(`/system/menus/${authored.id}`)).status,404)
  assert.ok(!ok(await call('/system/menus?pageSize=100')).list.some(row=>row.id===authored.id));assert.ok(!ok(await call('/system/menus/catalogue')).parents.some(row=>row.id===authored.id))
  assert.equal((await call(`/system/menus/${authored.id}`,{method:'PUT',body,key})).status,404)
  const shared=payload(ok(await call('/system/menus/default-dictSystem',{user:'a-employee'})));assert.equal((await call('/system/menus/default-dictSystem',{method:'PUT',body:shared})).status,404)
  const owned=await directory();assert.equal(ok(await call(`/system/menus/${owned.id}`)).id,owned.id)
  const ownPage=await create({menuName:'本人字典引用',menuType:'menu',routeKey:'dictSystem',parentId:owned.id,permission:'',sort:0,status:'enabled'})
  assert.equal((await call('/system/menus',{method:'POST',body:{menuName:'不能用个人范围改租户按钮策略',menuType:'button',parentId:ownPage.id,permission:'system:dict:create',sort:0,status:'disabled'}})).businessCode,'MENU_SCOPE_REQUIRED')
 }finally{
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(admin)]);await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(employee)])
  await pool.query("DELETE FROM member_roles WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_member_scopes WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM roles WHERE tenant_id='tenant-a' AND id=$1",[role])
 }
})
