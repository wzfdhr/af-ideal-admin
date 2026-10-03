import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '../dist/index.js'
test('timer retry cannot mutate planned time, thresholds, scripts or a partial assignment mapping',()=>{
 const body={expectedRevision:2,reason:'恢复有效计划'}
 assert.deepEqual(contracts.parseWorkflowTimerRetry(body),body)
 for(const extra of [{dueAt:'now'},{script:'approve()'},{threshold:1},{targetUserId:'user'},{nodeId:'arbitrary'},{originalAssigneeId:'old'},{reason:'a'},{expectedRevision:0}])assert.throws(()=>contracts.parseWorkflowTimerRetry({...body,...extra}),error=>error.status===422)
 assert.equal(contracts.parseWorkflowTimerRetry({...body,nodeId:'approval',targetUserId:'user',originalAssigneeId:'old'}).targetUserId,'user')
})
