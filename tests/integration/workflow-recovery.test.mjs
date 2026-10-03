import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { before,after,test } from 'node:test'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import notification from '../../services/reference-api/dist/notification.js'
import c from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map();let server,base,originals,failure=null
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee','a-manager-1','a-manager-2')")).rows
 const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(all)])
 await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id='a-employee'",[JSON.stringify(Object.values(c.BUSINESS_PERMISSIONS))])
 await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id IN ('a-manager-1','a-manager-2')",[JSON.stringify(['workflow:transfer'])])
 server=api.createServer(pool,point=>{if(point===failure){failure=null;throw new Error('Controlled assignment rollback')}});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const r of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[r.tenant_id,r.user_id,JSON.stringify(r.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){const r=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(r.status,200);tokens.set(user,(await r.json()).data.token)}
 const r=await fetch(`${origin}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()}
}
const ok=r=>{assert.equal(r.status,200,r.message);return r.data}
const create=async()=>{
 const a=ok(await call('/application-center',{method:'POST',body:{name:'交接恢复验收',code:`recover-${randomUUID().slice(0,8)}`,template:'equipment'}})),f=ok(await call(`/form-schemas/${a.formDraftId}`)),w=ok(await call(`/workflows/${a.workflowDraftId}`))
 const release=ok(await call(`/applications/${a.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:a.revision}}))
 const r=ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'真实交接',quantity:1,reason:'不可变原流程'}}}));ok(await call(`/business/records/${r.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:r.revision}}));return{app:a,record:r,release}
}
const task=async(r,user)=>ok(await call('/workflow-todos',{user})).list.find(t=>t.requestId===r.id)
const transfer=(t,target,user='a-manager-1',options={})=>call(`/workflow-tasks/${t.id}/transfer`,{user,method:'POST',body:{expectedRevision:t.revision,targetUserId:target,reason:'真实交接原因'},...options})
const approve=(t,user,options={})=>call(`/workflow-tasks/${t.id}/approve`,{user,method:'POST',body:{expectedRevision:t.revision},...options})
test('owned assignment transfers one task and original slot, the former reviewer immediately loses actions but retains permitted history',async()=>{
 const {record:r}=await create(),first=await task(r,'a-manager-1'),key=randomUUID(),receipt=ok(await transfer(first,'a-admin','a-manager-1',{key}));assert.deepEqual(ok(await transfer(first,'a-admin','a-manager-1',{key})),receipt)
 assert.equal(await task(r,'a-manager-1'),undefined);const replacement=await task(r,'a-admin');assert.equal(replacement.id,first.id);assert.equal(replacement.revision,first.revision+1)
 assert.equal((await approve(first,'a-manager-1')).status,404)
 const history=ok(await call(`/business/records/${r.id}`,{user:'a-manager-1'})).history;assert.equal(history.filter(h=>h.action==='transfer').length,1)
 const row=(await pool.query('SELECT original_assignee_id,assignee_id FROM workflow_tasks WHERE id=$1',[first.id])).rows[0];assert.equal(row.original_assignee_id,'a-manager-1');assert.equal(row.assignee_id,'a-admin')
 ok(await approve(replacement,'a-admin'));assert.ok(await task(r,'a-manager-2'))
 assert.equal((await call(`/workflow-tasks/${replacement.id}/assignment-candidates`,{user:'b-admin'})).status,404)
})
test('self, foreign, unavailable and stale transfers are refused; a controlled fault rolls back task, immutable assignment, history and outbox',async()=>{
 const {record:r}=await create(),first=await task(r,'a-manager-1')
 for(const target of ['a-employee','b-manager-1','missing'])assert.equal((await transfer(first,target)).status,target==='a-employee'?422:404)
 await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
 try{assert.equal((await transfer(first,'a-manager-2')).status,409)}finally{await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")}
 const key=randomUUID();failure='assignment:stored';assert.equal((await transfer(first,'a-admin','a-manager-1',{key})).status,500)
 assert.equal((await task(r,'a-manager-1')).revision,first.revision);assert.equal((await pool.query('SELECT id FROM workflow_assignment_events WHERE task_id=$1',[first.id])).rowCount,0)
 const results=await Promise.all([transfer(first,'a-admin','a-manager-1',{key}),transfer(first,'a-manager-2')]);assert.deepEqual(results.map(x=>x.status).sort(),[200,404])
 assert.equal((await pool.query('SELECT id FROM workflow_assignment_events WHERE task_id=$1',[first.id])).rowCount,1)
})
test('a manager recovers a disabled current assignee and frozen next-node override creates the new real task only after the original decision',async()=>{
 const {record:r,release}=await create(),first=await task(r,'a-manager-1')
 await pool.query("UPDATE memberships SET permissions=permissions-'workflow:approve' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
 try{
  assert.equal((await approve(first,'a-manager-1')).status,409)
  const inspected=ok(await call('/workflow-exceptions?current=1&pageSize=100')).list.find(x=>x.id===first.id);assert.ok(inspected.nextSlots.some(x=>x.originalAssigneeId==='a-manager-2'))
  const body={expectedRevision:first.revision,nodeId:inspected.nextSlots[0].nodeId,originalAssigneeId:'a-manager-2',targetUserId:'a-admin',reason:'恢复不可用的下一审批人'},key=randomUUID()
  const restored=ok(await call(`/workflow-tasks/${first.id}/recover-next`,{method:'POST',body,key}));assert.deepEqual(ok(await call(`/workflow-tasks/${first.id}/recover-next`,{method:'POST',body,key})),restored)
  assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND node_id=$2",[first.instanceId,body.nodeId])).rowCount,0)
  ok(await approve(first,'a-manager-1'));const next=await task(r,'a-admin');assert.equal(next.nodeId,body.nodeId);assert.equal((await pool.query('SELECT original_assignee_id FROM workflow_tasks WHERE id=$1',[next.id])).rows[0].original_assignee_id,'a-manager-2')
  assert.deepEqual(ok(await call(`/applications/${release.applicationId}`)).releases.find(x=>x.id===release.id).workflowSnapshot,release.workflowSnapshot)
  ok(await approve(next,'a-admin'));assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'approved')
 }finally{const original=originals.find(x=>x.user_id==='a-manager-2');await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-2'",[JSON.stringify(original.permissions.concat('workflow:transfer'))])}
 const another=(await create()).record,old=await task(another,'a-manager-1');await pool.query("UPDATE memberships SET permissions=permissions-'workflow:approve' WHERE tenant_id='tenant-a' AND user_id='a-manager-1'")
 try{ok(await call(`/workflow-tasks/${old.id}/recover`,{method:'POST',body:{expectedRevision:old.revision,targetUserId:'a-admin',reason:'恢复失权的当前分配'}}));assert.ok(await task(another,'a-admin'))}finally{const original=originals.find(x=>x.user_id==='a-manager-1');await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",[JSON.stringify(original.permissions.concat('workflow:transfer'))])}
})
test('assignment state survives actual API replacement and immutable facts cannot be changed or deleted',async()=>{
 const {record:r}=await create(),first=await task(r,'a-manager-1');ok(await transfer(first,'a-admin'))
 const event=(await pool.query('SELECT id FROM workflow_assignment_events WHERE task_id=$1',[first.id])).rows[0]
 await assert.rejects(pool.query('UPDATE workflow_assignment_events SET reason=$1 WHERE id=$2',['伪造历史',event.id]),error=>error.code==='23514');await assert.rejects(pool.query('DELETE FROM workflow_assignment_events WHERE id=$1',[event.id]),error=>error.code==='23514')
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
 try{const[ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)}),replacement=await task(r,'a-admin');ok(await approve(replacement,'a-admin',{origin:ready.base}));assert.ok(await task(r,'a-manager-2'))}finally{const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
})

test('a transferred signature keeps the fixed threshold and forbids a second slot for an existing voter',async()=>{
 const a=ok(await call('/application-center',{method:'POST',body:{name:'会签交接',code:`signed-transfer-${randomUUID().slice(0,8)}`,template:'equipment'}})),f=ok(await call(`/form-schemas/${a.formDraftId}`)),w=ok(await call(`/workflows/${a.workflowDraftId}`))
 const schema={version:3,nodes:[{id:'start',type:'start',name:'开始',config:{}},{id:'sign',type:'sign',name:'联合签署',config:{approvers:['a-manager-1','a-manager-2'],voting:{mode:'all'}}},{id:'end',type:'end',name:'结束',config:{}}],edges:[{id:'1',source:'start',target:'sign',label:''},{id:'2',source:'sign',target:'end',label:''}]}
 const saved=ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema,expectedRevision:w.revision}})),release=ok(await call(`/applications/${a.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:saved.revision,expectedRevision:a.revision}}))
 const r=ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'会签设备',quantity:1,reason:'原票位保留'}}}));ok(await call(`/business/records/${r.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:r.revision}}))
 const first=await task(r,'a-manager-1'),second=await task(r,'a-manager-2');assert.equal((await transfer(first,'a-manager-2')).businessCode,'DUPLICATE_SIGNATURE')
 ok(await transfer(first,'a-admin'));const replacement=await task(r,'a-admin');ok(await approve(replacement,'a-admin'))
 assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'running')
 assert.equal((await pool.query('SELECT threshold FROM workflow_activities WHERE id=$1',[first.activityId])).rows[0].threshold,2)
 ok(await approve(second,'a-manager-2'));assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'approved')
})
test('recovery can replace a referenced tombstoned future identity but never exposes it as a normal eligible target',async()=>{
 const {record:r}=await create(),first=await task(r,'a-manager-1')
 await pool.query("UPDATE memberships SET deleted_at=now(),status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
 try{
  const row=ok(await call('/workflow-exceptions?current=1&pageSize=100')).list.find(item=>item.id===first.id);assert.ok(row.nextSlots.some(slot=>slot.assignedUserId==='a-manager-2'))
  const slot=row.nextSlots[0],candidates=ok(await call(`/workflow-tasks/${first.id}/assignment-candidates?mode=recover-next&nodeId=${slot.nodeId}&originalAssigneeId=${slot.originalAssigneeId}`));assert.ok(!candidates.some(person=>person.id==='a-manager-2'))
  const body={expectedRevision:first.revision,targetUserId:'a-admin',reason:'恢复归档身份的引用',nodeId:slot.nodeId,originalAssigneeId:slot.originalAssigneeId}
  ok(await call(`/workflow-tasks/${first.id}/recover-next`,{method:'POST',body}));ok(await approve(first,'a-manager-1'));assert.ok(await task(r,'a-admin'))
 }finally{await pool.query("UPDATE memberships SET deleted_at=NULL,status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")}
})
test('member scope controls candidate enumeration and raw transfer targets, including scoped current permissions',async()=>{
 const {record:r}=await create(),first=await task(r,'a-manager-1'),role=`scope-transfer-${randomUUID().slice(0,8)}`,deptA=`${role}-a`,deptB=`${role}-b`
 const members=(await pool.query("SELECT user_id,department_id,permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id IN ('a-manager-1','a-manager-2','a-admin')")).rows
 try{
  await pool.query("INSERT INTO departments(tenant_id,id,department_name) VALUES('tenant-a',$1,'转交A'),('tenant-a',$2,'转交B')",[deptA,deptB])
  await pool.query("UPDATE memberships SET department_id=$1 WHERE tenant_id='tenant-a' AND user_id IN ('a-manager-1','a-admin')",[deptA]);await pool.query("UPDATE memberships SET department_id=$1 WHERE tenant_id='tenant-a' AND user_id='a-manager-2'",[deptB])
  await pool.query("UPDATE memberships SET permissions=permissions-'workflow:transfer' WHERE tenant_id='tenant-a' AND user_id='a-manager-1'")
  await pool.query("INSERT INTO roles(tenant_id,id,role_name,role_key) VALUES('tenant-a',$1,'范围转交角色',$1)",[role])
  await pool.query("INSERT INTO role_permissions(tenant_id,role_id,permission_code) VALUES('tenant-a',$1,'workflow:transfer')",[role])
  await pool.query("INSERT INTO role_member_scopes(tenant_id,role_id,data_scope,field_permissions) VALUES('tenant-a',$1,'department','[\"name\"]'::jsonb)",[role])
  await pool.query("INSERT INTO role_scope_departments(tenant_id,role_id,department_id) VALUES('tenant-a',$1,$2)",[role,deptA])
  await pool.query("INSERT INTO member_roles(tenant_id,user_id,role_id) VALUES('tenant-a','a-manager-1',$1)",[role])
  const candidates=ok(await call(`/workflow-tasks/${first.id}/assignment-candidates`,{user:'a-manager-1'}));assert.ok(candidates.some(person=>person.id==='a-admin'));assert.ok(!candidates.some(person=>person.id==='a-manager-2'))
  assert.equal((await transfer(first,'a-manager-2')).status,404);ok(await transfer(first,'a-admin'))
 }finally{
  await pool.query("DELETE FROM member_roles WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_scope_departments WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_member_scopes WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM role_permissions WHERE tenant_id='tenant-a' AND role_id=$1",[role]);await pool.query("DELETE FROM roles WHERE tenant_id='tenant-a' AND id=$1",[role])
  for(const member of members)await pool.query("UPDATE memberships SET department_id=$1,permissions=$2::jsonb WHERE tenant_id='tenant-a' AND user_id=$3",[member.department_id,JSON.stringify(member.permissions),member.user_id])
  await pool.query("DELETE FROM departments WHERE tenant_id='tenant-a' AND id=ANY($1::text[])",[[deptA,deptB]])
 }
})

test('next recovery follows the actual last parallel branch into its join and restores a future assignee without changing completed votes',async()=>{
 const a=ok(await call('/application-center',{method:'POST',body:{name:'汇合后恢复',code:`join-recovery-${randomUUID().slice(0,8)}`,template:'equipment'}})),f=ok(await call(`/form-schemas/${a.formDraftId}`)),w=ok(await call(`/workflows/${a.workflowDraftId}`))
 const n=(id,type,config={})=>({id,type,name:id,config}),e=(id,source,target,extra={})=>({id,source,target,label:'',...extra})
 const schema={version:3,nodes:[n('start','start'),n('fork','parallel',{joinId:'join'}),n('a','approval',{approvers:['a-manager-1']}),n('b','approval',{approvers:['a-manager-2']}),n('join','join',{forkId:'fork'}),n('final','approval',{approvers:['a-admin']}),n('end','end')],edges:[e('1','start','fork'),e('2','fork','a',{channel:'branch-1'}),e('3','fork','b',{channel:'branch-2'}),e('4','a','join'),e('5','b','join'),e('6','join','final'),e('7','final','end')]}
 const saved=ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema,expectedRevision:w.revision}})),release=ok(await call(`/applications/${a.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:saved.revision,expectedRevision:a.revision}}))
 const r=ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'恢复并行',quantity:1,reason:'实际汇合前沿'}}}));ok(await call(`/business/records/${r.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:r.revision}}))
 const first=await task(r,'a-manager-1'),second=await task(r,'a-manager-2');ok(await approve(first,'a-manager-1'))
 const admin=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 await pool.query("UPDATE memberships SET permissions=permissions-'workflow:approve' WHERE tenant_id='tenant-a' AND user_id='a-admin'")
 try{
  assert.equal((await approve(second,'a-manager-2')).status,409)
  const issue=ok(await call('/workflow-exceptions?current=1&pageSize=100')).list.find(row=>row.id===second.id);assert.equal(issue.nextSlots[0].nodeId,'final')
  const body={expectedRevision:second.revision,targetUserId:'a-manager-1',reason:'恢复汇合后的实际审批',nodeId:'final',originalAssigneeId:'a-admin'},key=randomUUID()
  failure='assignment:override-stored';assert.equal((await call(`/workflow-tasks/${second.id}/recover-next`,{method:'POST',body,key})).status,500)
  assert.equal((await pool.query('SELECT node_id FROM workflow_assignment_overrides WHERE instance_id=$1',[second.instanceId])).rowCount,0)
  ok(await call(`/workflow-tasks/${second.id}/recover-next`,{method:'POST',body,key}));ok(await approve(second,'a-manager-2'))
  const final=await task(r,'a-manager-1');assert.equal(final.nodeId,'final');ok(await approve(final,'a-manager-1'))
  const detail=ok(await call(`/business/records/${r.id}`,{user:'a-employee'}));assert.equal(detail.status,'approved');assert.equal(detail.history.filter(row=>row.action==='join').length,1)
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(admin)])}
})

test('generic transfer notifications are actually delivered once and cannot preserve historical access after review permission is revoked', async () => {
 const {record:r}=await create(),first=await task(r,'a-manager-1')
 ok(await transfer(first,'a-admin'))
 let remaining=1
 while(remaining) remaining=await notification.processOutbox(pool,undefined,100)
 await notification.processOutbox(pool)
 const link=`/business/records/${r.id}`
 const delivered=await pool.query("SELECT id FROM notifications WHERE tenant_id='tenant-a' AND recipient_id='a-admin' AND link=$1 AND title='有新的转交审批待办'",[link])
 assert.equal(delivered.rowCount,1,'the actual worker must deliver the transferred generic-business task')
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-1'")).rows[0].permissions
 try {
  await pool.query("UPDATE memberships SET permissions=permissions-'workflow:todo'-'workflow:approve'-'workflow:reject' WHERE tenant_id='tenant-a' AND user_id='a-manager-1'")
  assert.equal((await call(`/business/records/${r.id}`,{user:'a-manager-1'})).status,404)
 } finally {
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-1'",[JSON.stringify(permissions)])
 }
})

test('transfer racing approval cannot both change the same approval slot', async () => {
 const {record:r}=await create(),first=await task(r,'a-manager-1')
 const results=await Promise.all([transfer(first,'a-admin'),approve(first,'a-manager-1')])
 assert.equal(results.filter(result=>result.status===200).length,1)
 assert.ok(results.some(result=>[404,409].includes(result.status)))
 const current=(await pool.query('SELECT status,assignee_id,original_assignee_id FROM workflow_tasks WHERE id=$1',[first.id])).rows[0]
 const effects=await pool.query("SELECT action FROM workflow_history WHERE instance_id=$1 AND action IN ('transfer','approve')",[first.instanceId])
 assert.equal(effects.rowCount,1)
 assert.equal(current.original_assignee_id,'a-manager-1')
 assert.equal(current.status==='approved',current.assignee_id==='a-manager-1')
 assert.equal((await pool.query('SELECT id FROM workflow_assignment_events WHERE task_id=$1',[first.id])).rowCount,current.status==='approved'?0:1)
})

test('withdrawal racing transfer leaves no live approval and rejects recovery of the terminated instance', async () => {
 const {record:r}=await create(),first=await task(r,'a-manager-1')
 const current=ok(await call(`/business/records/${r.id}`,{user:'a-employee'}))
 const results=await Promise.all([
  transfer(first,'a-admin'),
  call(`/workflow-instances/${first.instanceId}/withdraw`,{user:'a-employee',method:'POST',body:{expectedRevision:current.revision,comment:'撤回交接竞争'}}),
 ])
 assert.equal(results[1].status,200)
 assert.ok([200,409].includes(results[0].status))
 assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'withdrawn')
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND status='pending'",[first.instanceId])).rowCount,0)
 assert.equal((await call(`/workflow-tasks/${first.id}/recover`,{method:'POST',body:{expectedRevision:first.revision,targetUserId:'a-manager-2',reason:'终态不能恢复'}})).status,409)
})

test('a next-slot override survives API replacement and recovery permission independently opens the authorized menu', async () => {
 const {record:r,release}=await create(),first=await task(r,'a-manager-1')
 const permissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")).rows[0].permissions
 let child
 try {
  await pool.query("UPDATE memberships SET permissions=permissions-'workflow:approve' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
  const issue=ok(await call('/workflow-exceptions?current=1&pageSize=100')).list.find(row=>row.id===first.id)
  const slot=issue.nextSlots[0]
  ok(await call(`/workflow-tasks/${first.id}/recover-next`,{method:'POST',body:{expectedRevision:first.revision,targetUserId:'a-admin',reason:'进程重启保留覆盖',nodeId:slot.nodeId,originalAssigneeId:slot.originalAssigneeId}}))
  child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
  const [ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)})
  ok(await approve(first,'a-manager-1',{origin:ready.base}))
  const replacement=await task(r,'a-admin')
  assert.equal(replacement.nodeId,slot.nodeId)
  ok(await approve(replacement,'a-admin',{origin:ready.base}))
  assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee',origin:ready.base})).status,'approved')
  assert.deepEqual(ok(await call(`/applications/${release.applicationId}`)).releases.find(row=>row.id===release.id).workflowSnapshot,release.workflowSnapshot)
 } finally {
  if(child){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-manager-2'",[JSON.stringify(permissions)])
 }
 const adminPermissions=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-admin'")).rows[0].permissions
 try {
  await pool.query("UPDATE memberships SET permissions='[\"workflow:recover\"]'::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'")
  const menu=ok(await call('/user/menu'))
  assert.ok(menu.some(entry=>entry.children?.some(page=>page.name==='workflowCenter')))
  assert.equal((await call('/workflow-todos')).status,403)
  ok(await call('/workflow-exceptions'))
 } finally {
  await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-admin'",[JSON.stringify(adminPermissions)])
 }
})
