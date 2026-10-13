import {test} from 'node:test'
import assert from 'node:assert/strict'
import c from '../dist/index.js'
const draft=()=>({name:'真实发布通知',channel:'notice',title:'{{company}}已发布',content:'请{{person}}阅读公告',variables:[{key:'company',label:'公司',required:true},{key:'person',label:'收件人',required:false,defaultValue:'同事'}],reviewerId:'a-manager-1',deliveryModes:['in-app','websocket']})
test('message templates contain only declared text substitutions and never evaluate expressions or accept forged approval/source fields',()=>{
 const schema=c.parseMessageTemplateDraft(draft());assert.equal(c.renderMessageTemplate(schema,{company:'真实集团'}).title,'真实集团已发布');assert.equal(c.renderMessageTemplate(schema,{company:'真实集团'}).content,'请同事阅读公告')
 assert.deepEqual(c.renderMessageTemplate(schema,{}).missingVariables,['company'])
 for(const change of [p=>p.title='{{fetch()}}',p=>p.content='{{company.secret}}',p=>p.approved=true,p=>p.requestId='private',p=>p.title='{{undeclared}}',p=>p.variables.push({...p.variables[0]}),p=>p.deliveryModes=['websocket']]){const bad=draft();change(bad);assert.throws(()=>c.parseMessageTemplateDraft(bad),error=>error.status===422)}
 assert.throws(()=>c.renderMessageTemplate(schema,{company:'集团',requestId:'private'}),error=>error.status===422)
})
test('audience declares one tenant-owned resolver and cannot mix role, users and arbitrary tenant references',()=>{
 assert.deepEqual(c.parseMessagingAudience({scope:'all'}),{scope:'all'});assert.deepEqual(c.parseMessagingAudience({scope:'role',targetId:'role-1'}),{scope:'role',targetId:'role-1'});assert.deepEqual(c.parseMessagingAudience({scope:'self'}),{scope:'self'})
 for(const input of [{scope:'all',tenantId:'tenant-b'},{scope:'all',targetId:'tenant-b'},{scope:'role',targetId:'r',userIds:['a']},{scope:'users',userIds:['a','a']},{scope:'script',targetId:'exec()'},{scope:'users',userIds:[]}])assert.throws(()=>c.parseMessagingAudience(input),error=>error.status===422)
})
test('sending uses approved version and variables rather than caller-generated content, with explicit timezone and invalid calendar refusal',()=>{
 const send={templateVersionId:'version-1',variables:{company:'真实集团'},audience:{scope:'self'},deliveryModes:['in-app'],scheduledAt:'2026-10-13T20:30:00+08:00'}
 assert.equal(c.parseMessageSendInput(send).scheduledAt,'2026-10-13T12:30:00.000Z')
 for(const change of [p=>p.title='伪造批准内容',p=>p.recipientCount=999,p=>p.scheduledAt='2026-02-30T00:00:00Z',p=>p.scheduledAt='2026-10-13T24:30:00Z',p=>p.scheduledAt='2026-10-13T20:30:00',p=>p.script='fetch()',p=>p.deliveryModes=['websocket']]){const bad=structuredClone(send);change(bad);assert.throws(()=>c.parseMessageSendInput(bad),error=>error.status===422)}
 assert.equal(c.parseMessageSubscription({expectedRevision:0,subscribed:true,deliveryModes:['in-app']}).expectedRevision,0)
 assert.throws(()=>c.parseMessageSubscription({expectedRevision:-1,subscribed:true,deliveryModes:['in-app']}),error=>error.status===422)
 assert.throws(()=>c.parseMessageAnnouncementDraft({title:'公告',content:'内容',audience:{scope:'all'},expiresAt:'2026-02-30T00:00:00Z'}),error=>error.status===422)
})
