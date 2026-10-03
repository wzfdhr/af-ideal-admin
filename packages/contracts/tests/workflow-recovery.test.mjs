import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'
test('assignment commands require a fixed version, explicit target and bounded reason without mutable workflow fields',()=>{
 const value=c.parseTaskTransfer({expectedRevision:1,targetUserId:'user-2',reason:'  交接审批  '});assert.equal(value.reason,'交接审批')
 for(const altered of [{expectedRevision:0},{targetUserId:''},{reason:'a'},{reason:'x'.repeat(501)},{activityId:'replace-group'},{threshold:1},{skipApproval:true}])assert.throws(()=>c.parseTaskTransfer({...value,...altered}),error=>error.status===422)
 const next=c.parseNextRecovery({...value,nodeId:'next',originalAssigneeId:'old'});assert.equal(next.nodeId,'next')
 assert.throws(()=>c.parseNextRecovery({...next,schema:{version:3}}),error=>error.status===422)
})
