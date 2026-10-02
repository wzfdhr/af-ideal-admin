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
import c from '@af-admin/contracts'
const pool=db.createPool(),tokens=new Map();let server,base,originals,failure=null
before(async()=>{
 await migrations.migrate(pool);await seeds.seedDemo(pool)
 originals=(await pool.query("SELECT tenant_id,user_id,permissions FROM memberships WHERE user_id IN ('a-admin','b-admin','a-employee')")).rows
 const all=(await pool.query('SELECT code FROM permission_definitions')).rows.map(r=>r.code)
 await pool.query("UPDATE memberships SET permissions=$1::jsonb WHERE user_id IN ('a-admin','b-admin')",[JSON.stringify(all)])
 await pool.query("UPDATE memberships SET permissions=permissions||$1::jsonb WHERE user_id='a-employee'",[JSON.stringify(Object.values(c.BUSINESS_PERMISSIONS))])
 server=api.createServer(pool,point=>{if(point===failure){failure=null;throw new Error('Controlled parallel rollback')}});base=await server.listen({host:'127.0.0.1',port:0})
})
after(async()=>{await server.close();for(const r of originals)await pool.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[r.tenant_id,r.user_id,JSON.stringify(r.permissions)]);await pool.end()})
const call=async(path,{user='a-admin',method='GET',body,key=randomUUID(),origin=base}={})=>{
 if(!tokens.has(user)){const r=await fetch(`${base}/api/user/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:user,password:user})});assert.equal(r.status,200);tokens.set(user,(await r.json()).data.token)}
 const r=await fetch(`${origin}/api${path}`,{method,headers:{'x-access-token':tokens.get(user),'x-tenant-id':user.startsWith('b-')?'tenant-b':'tenant-a','idempotency-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()}
}
const ok=r=>{assert.equal(r.status,200,r.message);return r.data}
const node=(id,type,config={})=>({id,type,name:id,config}),edge=(id,source,target,extra={})=>({id,source,target,label:'',...extra})
const graph=(mode='all',quorum)=>({version:3,nodes:[node('start','start'),node('fork','parallel',{joinId:'join'}),node('left','approval',{approvers:['a-manager-1']}),node('right','sign',{approvers:['a-manager-2','a-admin'],voting:{mode,...(quorum?{quorum}:{})}}),node('join','join',{forkId:'fork'}),node('final','approval',{approvers:['a-admin']}),node('end','end')],edges:[edge('1','start','fork'),edge('2','fork','left',{channel:'branch-1'}),edge('3','fork','right',{channel:'branch-2'}),edge('4','left','join'),edge('5','right','join'),edge('6','join','final'),edge('7','final','end')]})
const app=async(schema=graph())=>{
 const a=ok(await call('/application-center',{method:'POST',body:{name:'耐久并行领用',code:`parallel-${randomUUID().slice(0,8)}`,template:'equipment'}})),f=ok(await call(`/form-schemas/${a.formDraftId}`)),w=ok(await call(`/workflows/${a.workflowDraftId}`))
 const saved=ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema,expectedRevision:w.revision}}))
 const release=ok(await call(`/applications/${a.id}/releases`,{method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:saved.revision,expectedRevision:a.revision}}))
 return{...a,release}
}
const create=async(a)=>ok(await call('/business/records',{user:'a-employee',method:'POST',body:{applicationReleaseId:a.release.id,fields:{itemName:'并行设备',quantity:1,unitPrice:'10.00',reason:'真实并行活动'}}}))
const submit=async(r,options={})=>call(`/business/records/${r.id}/submit`,{user:'a-employee',method:'POST',body:{expectedRevision:r.revision},...options})
const tasks=async(r,user)=>ok(await call('/workflow-todos',{user})).list.filter(t=>t.requestId===r.id)
const vote=(task,user,action='approve',options={})=>call(`/workflow-tasks/${task.id}/${action}`,{user,method:'POST',body:{expectedRevision:task.revision,...(action==='reject'?{comment:'不同意'}:{})},...options})
test('real parallel branches create simultaneous tasks, all-sign waits for every signature and one durable join creates exactly one successor',async()=>{
 const a=await app(),r=await create(a),key=randomUUID(),started=ok(await submit(r,{key}));assert.deepEqual(ok(await submit(r,{key})),started)
 const first=(await tasks(r,'a-manager-1'))[0],second=(await tasks(r,'a-manager-2'))[0],third=(await tasks(r,'a-admin'))[0]
 assert.ok(first&&second&&third);assert.ok(first.activityId);assert.equal(second.activityId,third.activityId);assert.notEqual(first.activityId,second.activityId)
 assert.equal((await call(`/business/records/${r.id}`,{user:'b-admin'})).status,404)
 ok(await vote(second,'a-manager-2'));assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'running')
 assert.ok((await tasks(r,'a-manager-1')).length===1);assert.equal((await tasks(r,'a-admin'))[0].nodeId,'right')
 const responses=await Promise.all([vote(first,'a-manager-1'),vote(third,'a-admin')]);responses.forEach(ok)
 const next=(await tasks(r,'a-admin'))[0];assert.equal(next.nodeId,'final')
 const detail=ok(await call(`/business/records/${r.id}`,{user:'a-employee'}));assert.equal(detail.history.filter(h=>h.action==='join').length,1)
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND node_id='final'",[first.instanceId])).rowCount,1)
 ok(await vote(next,'a-admin'));assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'approved')
})
test('any-sign approval cancels unprocessed signatures, while rejection waits when another approval is still possible',async()=>{
 const a=await app(graph('any')),r=await create(a);ok(await submit(r))
 const second=(await tasks(r,'a-manager-2'))[0],third=(await tasks(r,'a-admin'))[0]
 ok(await vote(second,'a-manager-2','reject'));assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'running')
 ok(await vote(third,'a-admin'));const left=(await tasks(r,'a-manager-1'))[0];ok(await vote(left,'a-manager-1'))
 const final=(await tasks(r,'a-admin'))[0];ok(await vote(final,'a-admin'))
 const nextRecord=await create(a);ok(await submit(nextRecord));const early=(await tasks(nextRecord,'a-manager-2'))[0],cancelled=(await tasks(nextRecord,'a-admin'))[0]
 ok(await vote(early,'a-manager-2'));assert.equal((await vote(cancelled,'a-admin')).status,409)
 assert.equal((await pool.query('SELECT status FROM workflow_tasks WHERE id=$1',[cancelled.id])).rows[0].status,'cancelled')
})
test('an impossible all-sign vote rejects the whole workflow and withdraw cancels every active group and task',async()=>{
 const a=await app(),r=await create(a);ok(await submit(r));const second=(await tasks(r,'a-manager-2'))[0];ok(await vote(second,'a-manager-2','reject'))
 assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).status,'rejected')
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND status='pending'",[second.instanceId])).rowCount,0)
 const another=await create(a),submitted=ok(await submit(another));ok(await call(`/business/records/${another.id}/withdraw`,{user:'a-employee',method:'POST',body:{expectedRevision:submitted.revision}}))
 assert.equal((await pool.query("SELECT id FROM workflow_activities WHERE instance_id=$1 AND status='waiting'",[submitted.instanceId])).rowCount,0)
})
test('initial branch creation and last-branch join are atomic under controlled faults and recover once with the original receipt key',async()=>{
 const a=await app(),r=await create(a),key=randomUUID();failure='parallel:tasks-created';assert.equal((await submit(r,{key})).status,500)
 assert.equal((await pool.query('SELECT id FROM workflow_instances WHERE request_id=$1',[r.id])).rowCount,0)
 ok(await submit(r,{key}));const first=(await tasks(r,'a-manager-1'))[0],second=(await tasks(r,'a-manager-2'))[0],third=(await tasks(r,'a-admin'))[0]
 ok(await vote(first,'a-manager-1'));ok(await vote(second,'a-manager-2'))
 const decisionKey=randomUUID();failure='parallel:join-arrived';assert.equal((await vote(third,'a-admin','approve',{key:decisionKey})).status,500)
 assert.equal((await tasks(r,'a-admin'))[0].revision,third.revision)
 const result=ok(await vote(third,'a-admin','approve',{key:decisionKey}));assert.deepEqual(ok(await vote(third,'a-admin','approve',{key:decisionKey})),result)
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND node_id='final'",[first.instanceId])).rowCount,1)
})
test('partial branch and voting state survive a real API process replacement and a changed draft never rewrites the active graph',async()=>{
 const a=await app(),r=await create(a);ok(await submit(r));const first=(await tasks(r,'a-manager-1'))[0];ok(await vote(first,'a-manager-1'))
 const w=ok(await call(`/workflows/${a.workflowDraftId}`));w.schema.nodes.find(n=>n.id==='right').config.voting={mode:'any'};ok(await call(`/workflows/${w.id}`,{method:'PUT',body:{schema:w.schema,expectedRevision:w.revision}}))
 const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/organization-api-child.mjs',import.meta.url))],{env:{DATABASE_URL:process.env.DATABASE_URL,APP_MODE:'demo'},stdio:['ignore','ignore','ignore','ipc']})
 try{
  const [ready]=await once(child,'message',{signal:AbortSignal.timeout(5000)}),second=(await tasks(r,'a-manager-2'))[0]
  ok(await vote(second,'a-manager-2','approve',{origin:ready.base}));assert.equal((await tasks(r,'a-admin'))[0].nodeId,'right')
  const third=(await tasks(r,'a-admin'))[0];ok(await vote(third,'a-admin','approve',{origin:ready.base}));assert.equal((await tasks(r,'a-admin'))[0].nodeId,'final')
 }finally{const stopped=once(child,'exit');child.kill('SIGTERM');await stopped}
})

test('nested forks preserve parent branch ownership and emit one join for each group in any completion order',async()=>{
 const g=graph('any');g.nodes.push(node('inner','parallel',{joinId:'inner-join'}),node('inner-join','join',{forkId:'inner'}),node('inner-left','approval',{approvers:['a-manager-1']}),node('inner-right','approval',{approvers:['a-manager-2']}))
 g.edges.find(e=>e.target==='left').target='inner';g.edges.push(edge('i1','inner','inner-left',{channel:'branch-1'}),edge('i2','inner','inner-right',{channel:'branch-2'}),edge('i3','inner-left','inner-join'),edge('i4','inner-right','inner-join'),edge('i5','inner-join','left'))
 const a=await app(g),r=await create(a);ok(await submit(r))
 const all=await pool.query("SELECT node_id FROM workflow_tasks WHERE instance_id=(SELECT id FROM workflow_instances WHERE request_id=$1) AND status='pending'",[r.id]);assert.deepEqual(all.rows.map(x=>x.node_id).sort(),['inner-left','inner-right','right','right'])
 const right=(await tasks(r,'a-admin')).find(t=>t.nodeId==='right');ok(await vote(right,'a-admin'))
 const first=(await tasks(r,'a-manager-1')).find(t=>t.nodeId==='inner-left'),second=(await tasks(r,'a-manager-2')).find(t=>t.nodeId==='inner-right')
 ok(await vote(second,'a-manager-2'));ok(await vote(first,'a-manager-1'))
 const outer=(await tasks(r,'a-manager-1')).find(t=>t.nodeId==='left');assert.ok(outer);ok(await vote(outer,'a-manager-1'))
 const detail=ok(await call(`/business/records/${r.id}`,{user:'a-employee'}));assert.equal(detail.history.filter(h=>h.action==='join').length,2);assert.equal(detail.activities.filter(x=>x.kind==='fork'&&x.status==='completed').length,2)
})
test('quorum signature waits for the exact configured threshold and unassigned or withdrawn signatures cannot process a vote',async()=>{
 const g=graph('quorum',2),sign=g.nodes.find(n=>n.type==='sign');sign.config.approvers=['a-manager-1','a-manager-2','a-admin']
 const a=await app(g),r=await create(a);ok(await submit(r))
 const first=(await tasks(r,'a-manager-1')).find(t=>t.nodeId==='right'),second=(await tasks(r,'a-manager-2'))[0],third=(await tasks(r,'a-admin'))[0]
 ok(await vote(first,'a-manager-1'));assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).activities.find(x=>x.nodeId==='right').pending,2)
 ok(await vote(second,'a-manager-2'));assert.equal((await vote(third,'a-admin')).status,409)
 const current=ok(await call(`/business/records/${r.id}`,{user:'a-employee'}));ok(await call(`/business/records/${r.id}/withdraw`,{user:'a-employee',method:'POST',body:{expectedRevision:current.revision}}))
 const stale=(await pool.query("SELECT id,revision FROM workflow_tasks WHERE instance_id=$1 AND node_id='left'",[first.instanceId])).rows[0]
 assert.equal((await vote(stale,'a-manager-1')).status,409)
})

test('a v3 package rebinds all parallel and signature participants and runs independent durable activities in another tenant',async()=>{
 const a=await app(),current=ok(await call(`/application-center/${a.id}`)),pkg=ok(await call(`/application-center/${a.id}/package`,{method:'POST',body:{expectedRevision:current.revision}}))
 assert.equal(pkg.workflow.version,3);assert.ok(pkg.dependencies.some(d=>d.key==='parallel-workflow'));assert.ok(!JSON.stringify(pkg).includes('a-manager-'))
 const mapping=Object.fromEntries(pkg.people.map(slot=>[slot.key,slot.key===pkg.workflow.nodes.find(n=>n.id==='right').config.approvers[0]?'b-manager-2':'b-manager-1']))
 const imported=ok(await call('/application-packages/import',{user:'b-admin',method:'POST',body:{package:pkg,name:'目标并行',code:`target-parallel-${randomUUID().slice(0,8)}`,bindings:mapping,sourceBindings:{}}})).application
 const f=ok(await call(`/form-schemas/${imported.formDraftId}`,{user:'b-admin'})),w=ok(await call(`/workflows/${imported.workflowDraftId}`,{user:'b-admin'}))
 const release=ok(await call(`/applications/${imported.id}/releases`,{user:'b-admin',method:'POST',body:{formDraftId:f.id,workflowDraftId:w.id,formRevision:f.revision,workflowRevision:w.revision,expectedRevision:imported.revision}}))
 const r=ok(await call('/business/records',{user:'b-admin',method:'POST',body:{applicationReleaseId:release.id,fields:{itemName:'目标设备',quantity:1,reason:'目标并行活动'}}}));ok(await call(`/business/records/${r.id}/submit`,{user:'b-admin',method:'POST',body:{expectedRevision:r.revision}}))
 const firstTasks=await tasks(r,'b-manager-1');assert.equal(firstTasks.length,2)
 const second=(await tasks(r,'b-manager-2'))[0];await Promise.all(firstTasks.map(t=>vote(t,'b-manager-1'))).then(results=>results.forEach(ok));ok(await vote(second,'b-manager-2'))
 const final=(await tasks(r,'b-manager-1'))[0];assert.equal(final.nodeId,'final');ok(await vote(final,'b-manager-1'))
 assert.equal(ok(await call(`/business/records/${r.id}`,{user:'b-admin'})).status,'approved')
 assert.equal((await call(`/business/records/${r.id}`,{user:'a-admin'})).status,404)
})

test('competing keys cannot double-count one signature and concurrent final signatures create one join and one successor',async()=>{
 const a=await app(),r=await create(a);ok(await submit(r));const left=(await tasks(r,'a-manager-1'))[0],second=(await tasks(r,'a-manager-2'))[0],third=(await tasks(r,'a-admin'))[0]
 const competing=await Promise.all([vote(second,'a-manager-2'),vote(second,'a-manager-2')]);assert.deepEqual(competing.map(x=>x.status).sort(),[200,409])
 assert.equal(ok(await call(`/business/records/${r.id}`,{user:'a-employee'})).activities.find(x=>x.nodeId==='right').approved,1)
 ok(await vote(left,'a-manager-1'));ok(await vote(third,'a-admin'))
 const r2=await create(a);ok(await submit(r2));const branch=(await tasks(r2,'a-manager-1'))[0];ok(await vote(branch,'a-manager-1'))
 const signOne=(await tasks(r2,'a-manager-2'))[0],signTwo=(await tasks(r2,'a-admin'))[0]
 const results=await Promise.all([vote(signOne,'a-manager-2'),vote(signTwo,'a-admin')]);results.forEach(ok)
 const detail=ok(await call(`/business/records/${r2.id}`,{user:'a-employee'}));assert.equal(detail.history.filter(x=>x.action==='join').length,1)
 assert.equal((await pool.query("SELECT id FROM workflow_tasks WHERE instance_id=$1 AND node_id='final'",[signOne.instanceId])).rowCount,1)
})
