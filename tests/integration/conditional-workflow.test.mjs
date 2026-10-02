import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import db from '../../services/reference-api/dist/database.js'
import migrations from '../../services/reference-api/dist/migrate.js'
import seeds from '../../services/reference-api/dist/seed.js'
import api from '../../services/reference-api/dist/index.js'
import c from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map()
let server,base,originals,failure=null
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee')")).rows
 const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(row=>row.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(all)])
 await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE user_id='a-employee'",[JSON.stringify(Object.values(c.BUSINESS_PERMISSIONS))])
 server=api.createServer(pool,point=>{if(point===failure){failure=null;throw new Error('Controlled condition rollback')}});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const row of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[row.tenant_id,row.user_id,JSON.stringify(row.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',tenant=user.startsWith('b-')?'tenant-b':'tenant-a',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){const response=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(response.status,200);tokens.set(user,(await response.json()).data.token)}
 const response=await fetch(`${origin}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':tenant,'idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,...await response.json()}
}
const ok=r=>{assert.equal(r.status,200,r.message);return r.data}
const graph=(formId,late=false)=>({version:2,nodes:[
 {id:'start',type:'start',name:'开始',config:{}},...(late?[{id:'common',type:'approval',name:'初审',config:{approvers:['a-manager-1'],formId}}]:[]),
 {id:'amount',type:'condition',name:'金额分流',config:{condition:{mode:'all',predicates:[{field:'totalAmount',valueType:'decimal',operator:'gte',value:'100.00'}]}}},
 {id:'high',type:'approval',name:'高额审核',config:{approvers:['a-manager-2'],formId}},{id:'low',type:'approval',name:'普通审核',config:{approvers:['a-manager-1'],formId}},{id:'end',type:'end',name:'结束',config:{}},
],edges:[{id:'1',source:'start',target:late?'common':'amount',label:''},...(late?[{id:'extra',source:'common',target:'amount',label:''}]:[]),{id:'2',source:'amount',target:'high',label:'高额',branch:'matched'},{id:'3',source:'amount',target:'low',label:'普通',branch:'fallback'},{id:'4',source:'high',target:'end',label:''},{id:'5',source:'low',target:'end',label:''}]})
const createApp=async(late=false)=>{
 const app=ok(await call('/application-center',{method:'POST',body:{name:'真实条件领用',code:`cond-${randomUUID().slice(0,8)}`,template:'equipment'}}))
 const f=ok(await call(`/form-schemas/${app.formDraftId}`)),w=ok(await call(`/workflows/${app.workflowDraftId}`))
 const saved=ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema:graph(f.id,late),expectedRevision:w.revision}}))
 const release=ok(await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:saved.revision,expectedRevision:app.revision}}))
 return {...app,release}
}
const createRecord=async(app,price='100.00')=>ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:app.release.id,fields:{itemName:'真实设备',quantity:1,unitPrice:price,reason:'条件事务验收'}}}))
const submit=async(record,options={})=>call(`/business/records/${record.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:record.revision},...options})
const task=async(record,user)=>ok(await call('/workflow-todos',{user})).list.find(item=>item.requestId===record.id)
test('real money branches select only the right reviewer and record one server-generated route on idempotent submission',async()=>{
 const app=await createApp()
 for(const [amount,user,branch] of [['99.99','a-manager-1','默认分支'],['100.00','a-manager-2','匹配分支']]){
  const record=await createRecord(app,amount),key=randomUUID()
  const submitted=ok(await submit(record,{key}));assert.deepEqual(ok(await submit(record,{key})),submitted)
  const active=await task(record,user);assert.ok(active)
  const wrong=user==='a-manager-1'?'a-manager-2':'a-manager-1';assert.equal(await task(record,wrong),undefined)
  const detail=ok(await call(`/business/records/${record.id}`,{user:'a-employee'}));assert.equal(detail.history.filter(item=>item.action==='route').length,1);assert.ok(detail.history.find(item=>item.action==='route').comment.endsWith(branch))
  assert.ok(!detail.history.find(item=>item.action==='route').comment.includes(amount))
  assert.equal((await call(`/business/records/${record.id}`,{user:'b-admin'})).status,404)
  ok(await call(`/workflow-tasks/${active.id}/approve`,{user,method:'POST',body:{expectedRevision:active.revision}}))
  assert.equal(ok(await call(`/business/records/${record.id}`,{user:'a-employee'})).status,'approved')
 }
})
test('late condition failures roll back approval and routing, then independent concurrent keys create exactly one next task and route',async()=>{
 const app=await createApp(true),record=await createRecord(app);ok(await submit(record))
 const initial=await task(record,'a-manager-1'),body={expectedRevision:initial.revision},key=randomUUID()
 await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
 try{assert.equal((await call(`/workflow-tasks/${initial.id}/approve`,{user:'a-manager-1',method:'POST',body,key})).status,409)}finally{await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")}
 assert.equal((await task(record,'a-manager-1')).revision,initial.revision)
 failure='decision:condition-recorded'
 assert.equal((await call(`/workflow-tasks/${initial.id}/approve`,{user:'a-manager-1',method:'POST',body,key})).status,500)
 assert.equal((await pool.query("SELECT id FROM workflow_history WHERE instance_id=$1 AND action='route'",[initial.instanceId])).rowCount,0)
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND node_id='high'",[initial.instanceId])).rowCount,0)
 const responses=await Promise.all([key,randomUUID()].map(command=>call(`/workflow-tasks/${initial.id}/approve`,{user:'a-manager-1',method:'POST',body,key:command})))
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
 assert.equal((await pool.query("SELECT id FROM workflow_history WHERE instance_id=$1 AND action='route'",[initial.instanceId])).rowCount,1)
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND node_id='high'",[initial.instanceId])).rowCount,1)
 const next=await task(record,'a-manager-2');ok(await call(`/workflow-tasks/${next.id}/approve`,{user:'a-manager-2',method:'POST',body:{expectedRevision:next.revision}}))
})
test('a pinned late route survives draft changes and actual API process replacement, then withdraw cancels the selected task',async()=>{
 const app=await createApp(true),record=await createRecord(app);ok(await submit(record))
 const w=ok(await call(`/workflows/${app.workflowDraftId}`));w.schema.nodes.find(node=>node.id==='amount').config.condition.predicates[0].value='1000.00'
 ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema:w.schema,expectedRevision:w.revision}}))
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
 try{
  const [ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)}),first=await task(record,'a-manager-1')
  ok(await call(`/workflow-tasks/${first.id}/approve`,{user:'a-manager-1',method:'POST',body:{expectedRevision:first.revision},origin:ready.base}))
  assert.ok(await task(record,'a-manager-2'))
 }finally{const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
 const detail=ok(await call(`/business/records/${record.id}`,{user:'a-employee'}))
 ok(await call(`/business/records/${record.id}/withdraw`,{user:'a-employee',method:'POST',body:{expectedRevision:detail.revision}}))
 assert.equal(await task(record,'a-manager-2'),undefined)
})
test('publication rejects unknown fields, missing default routes and an approval bypass without changing the active release',async()=>{
 const app=await createApp(),w=ok(await call(`/workflows/${app.workflowDraftId}`)),f=ok(await call(`/form-schemas/${app.formDraftId}`));let revision=w.revision
 for(const change of [g=>g.nodes.find(node=>node.id==='amount').config.condition.predicates[0].field='tenantId',g=>g.edges.find(edge=>edge.branch==='fallback').target='end',g=>g.edges=g.edges.filter(edge=>edge.branch!=='fallback')]){
  const schema=graph(f.id);change(schema);revision=ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema,expectedRevision:revision}})).revision
  const current=ok(await call(`/applications/${app.id}`))
  assert.equal((await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:revision,expectedRevision:current.revision}})).status,422)
  assert.equal(ok(await call(`/applications/${app.id}`)).activeReleaseId,app.release.id)
 }
})

test('conditional packages declare the engine dependency, rebind branch reviewers and execute the target tenant without unused source permissions',async()=>{
 const app=await createApp(),current=ok(await call(`/application-center/${app.id}`))
 const pkg=ok(await call(`/application-center/${app.id}/package`,{method:'POST',body:{expectedRevision:current.revision}}))
 assert.equal(pkg.version,2);assert.deepEqual(pkg.sources,[]);assert.ok(pkg.dependencies.some(item=>item.key==='conditional-workflow'&&item.version===1));assert.equal(pkg.workflow.version,2)
 assert.ok(!JSON.stringify(pkg).includes('a-manager-'))
 const mappings=Object.fromEntries(pkg.people.map(slot=>[slot.key,slot.key===pkg.workflow.nodes.find(node=>node.id==='high').config.approvers[0]?'b-manager-2':'b-manager-1']))
 const old=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-b' AND user_id='b-admin'")).rows[0].permissions
 await pool.query("UPDATE memberships SET permissions=permissions-'form-source:list'-'form-source:read'-'system:dict:read' WHERE tenant_id='tenant-b' AND user_id='b-admin'")
 try{
  const receipt=ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body:{package:pkg,name:'目标条件应用',code:`target-cond-${randomUUID().slice(0,8)}`,bindings:mappings,sourceBindings:{}}}))
  const imported=receipt.application
  const f=ok(await call(`/form-schemas/${imported.formDraftId}`,{user:'b-admin'})),w=ok(await call(`/workflows/${imported.workflowDraftId}`,{user:'b-admin'}))
  const release=ok(await call(`/applications/${imported.id}/releases`,{user:'b-admin',method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:imported.revision}}))
  const record=ok(await call('/business/records',{user:'b-admin',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'目标设备',quantity:1,unitPrice:'100.00',reason:'独立条件运行'}}}))
  ok(await call(`/business/records/${record.id}/submit`,{user:'b-admin',method:'POST',body:{expectedRevision:record.revision}}))
  const active=await task(record,'b-manager-2');assert.ok(active)
  ok(await call(`/workflow-tasks/${active.id}/approve`,{user:'b-manager-2',method:'POST',body:{expectedRevision:active.revision}}))
  assert.equal(ok(await call(`/business/records/${record.id}`,{user:'b-admin'})).status,'approved')
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-b' AND user_id='b-admin'",[JSON.stringify(old)])}
})

test('an unavailable reviewer on an unselected branch does not block a valid selected path, while the selected unavailable path is refused',async()=>{
 const app=await createApp(),low=await createRecord(app,'99.99'),high=await createRecord(app,'100.00')
 await pool.query("UPDATE memberships SET status='disabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")
 try{
  ok(await submit(low));assert.ok(await task(low,'a-manager-1'))
  assert.equal((await submit(high)).status,422)
  assert.equal((await pool.query('SELECT id FROM workflow_instances WHERE request_id=$1',[high.id])).rowCount,0)
 }finally{await pool.query("UPDATE memberships SET status='enabled' WHERE tenant_id='tenant-a' AND user_id='a-manager-2'")}
})

test('self-approval is refused on the selected path while an unselected applicant reviewer does not invalidate another path',async()=>{
 const old=(await pool.query("SELECT permissions FROM memberships WHERE tenant_id='tenant-a' AND user_id='a-employee'")).rows[0].permissions
 await pool.query("UPDATE memberships SET permissions=permissions || $1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(['workflow:approve','workflow:reject','workflow:todo'])])
 try{
  const app=await createApp(),w=ok(await call(`/workflows/${app.workflowDraftId}`)),f=ok(await call(`/form-schemas/${app.formDraftId}`))
  w.schema.nodes.find(node=>node.id==='high').config.approvers=['a-employee']
  const updated=ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema:w.schema,expectedRevision:w.revision}})),current=ok(await call(`/applications/${app.id}`))
  app.release=ok(await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:updated.revision,expectedRevision:current.revision}}))
  const low=await createRecord(app,'99.99'),high=await createRecord(app,'100.00')
  ok(await submit(low));assert.ok(await task(low,'a-manager-1'))
  const denied=await submit(high);assert.equal(denied.status,422);assert.equal(denied.businessCode,'SELF_APPROVAL')
  assert.equal((await pool.query('SELECT id FROM workflow_instances WHERE request_id=$1',[high.id])).rowCount,0)
 }finally{await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE tenant_id='tenant-a' AND user_id='a-employee'",[JSON.stringify(old)])}
})

test('a valid larger computed amount in a customized form reaches the high branch without narrowing the existing calculation range',async()=>{
 const app=await createApp(),f=ok(await call(`/form-schemas/${app.formDraftId}`)),w=ok(await call(`/workflows/${app.workflowDraftId}`)),current=ok(await call(`/applications/${app.id}`))
 f.schema.widgetsConfig.find(field=>field.uid==='quantity').config.max=1000000;f.schema.widgetsConfig.find(field=>field.uid==='unitPrice').config.max=1000000
 const saved=ok(await call(`/form-schemas/${f.id}`,{method:'PUT',body:{schema:f.schema,expectedRevision:f.revision}}))
 const release=ok(await call(`/applications/${app.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:saved.revision,workflowRevision:w.revision,expectedRevision:current.revision}}))
 const record=ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'大额边界',quantity:1000000,unitPrice:'1000000.00',reason:'金额域保持'}}}))
 ok(await submit(record));assert.ok(await task(record,'a-manager-2'))
 assert.equal(ok(await call(`/business/records/${record.id}`,{user:'a-employee'})).computedFields.totalAmount,'1000000000000.00')
})
