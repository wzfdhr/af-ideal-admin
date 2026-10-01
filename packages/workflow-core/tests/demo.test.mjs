import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
const fields={leaveType:'personal',startDate:'2026-10-01',startSlot:'am',endDate:'2026-10-02',endSlot:'pm',reason:'Mock 契约验收'}
const setup=()=>{
 const store=new core.R1DemoStore()
 const call=(method,path,user='a-employee',body,key,tenant='tenant-a')=>store.request(method,path,user,tenant,body,key)
 const app=call('get','/applications/leave')
 const draft=call('post','/leave-requests','a-employee',{applicationReleaseId:app.activeReleaseId,fields})
 return {store,call,app,draft}
}
test('development demo completes a two-reviewer path with the same public DTOs',()=>{
 const {call,draft}=setup()
 const running=call('post',`/leave-requests/${draft.id}/submit`,'a-employee',{expectedRevision:1},crypto.randomUUID())
 const first=call('get','/workflow-todos','a-manager-1').list.find(t=>t.requestId===draft.id)
 call('post',`/workflow-tasks/${first.id}/approve`,'a-manager-1',{expectedRevision:first.revision},crypto.randomUUID())
 const second=call('get','/workflow-todos','a-manager-2').list.find(t=>t.requestId===draft.id)
 call('post',`/workflow-tasks/${second.id}/approve`,'a-manager-2',{expectedRevision:second.revision},crypto.randomUUID())
 const complete=call('get',`/leave-requests/${draft.id}`)
 assert.equal(complete.status,'approved');assert.equal(complete.instanceId,running.instanceId)
 assert.deepEqual(complete.history.map(t=>t.action),['start','approve','approve','copy'])
 assert.equal(call('get','/messages/notifications').list.length,1)
 assert.throws(()=>call('get',`/leave-requests/${draft.id}`,'b-employee',undefined,undefined,'tenant-b'),e=>e.status===404)
})
test('demo retry, conflicts, rollback and immutable reads follow the public contract',()=>{
 const {call,draft,app}=setup(),key=crypto.randomUUID()
 const first=call('post',`/leave-requests/${draft.id}/submit`,'a-employee',{expectedRevision:1},key)
 const repeat=call('post',`/leave-requests/${draft.id}/submit`,'a-employee',{expectedRevision:1},key)
 assert.equal(first.instanceId,repeat.instanceId)
 assert.throws(()=>call('post',`/leave-requests/${draft.id}/submit`,'a-employee',{expectedRevision:2},key),e=>e.businessCode==='IDEMPOTENCY_CONFLICT')
 const read=call('get','/applications/leave');read.releases[0].formSnapshot.widgetsConfig[0].name='external mutation'
 assert.notEqual(call('get','/applications/leave').releases[0].formSnapshot.widgetsConfig[0].name,'external mutation')
 const withdrawn=call('post',`/workflow-instances/${first.instanceId}/withdraw`,'a-employee',{expectedRevision:first.revision},crypto.randomUUID())
 assert.equal(withdrawn.status,'withdrawn')
 assert.equal(call('get','/workflow-todos','a-manager-1').total,0)
 assert.equal(call('get',`/leave-requests/${draft.id}`).applicationReleaseId,app.activeReleaseId)
})
