import assert from 'node:assert/strict'
import {test} from 'node:test'
import c from '../dist/index.js'

test('a v2 generated business page binds all five actions to fixed material targets without scripts or arbitrary URLs',()=>{
 const schema=c.createBusinessLowCodePage('source-1','设备业务页')
 assert.equal(schema.version,2)
 assert.deepEqual(c.parseLowCodePage(schema),schema)
 assert.deepEqual([...new Set(schema.actions.map(action=>action.type))].sort(),['navigate','openModal','query','refreshBlock','submit'].sort())
 for(const alter of [p=>p.version=3,p=>p.sources.push('source-1'),p=>p.actions[0].targetId='missing',p=>p.actions[0].script='run()',p=>p.materials[0].props={url:'https://example.invalid'},p=>p.actions.find(a=>a.type==='navigate').route='javascript:alert(1)',p=>p.actions.find(a=>a.operation==='start').operation='approve']){
  const value=structuredClone(schema);alter(value);assert.throws(()=>c.parseLowCodePage(value),error=>error.status===422)
 }
})
test('registered sources have bounded identity and cannot turn into a client-selected HTTP proxy',()=>{
 const input={code:'equipment-source',name:'设备来源',kind:'application-records',resourceId:'release-1',status:'enabled'}
 assert.equal(c.parseLowCodeSource(input).resourceId,'release-1')
 for(const extra of [{url:'https://example.invalid'},{headers:{token:'credential'}},{method:'post'},{kind:'script'},{tenantId:'other'}])assert.throws(()=>c.parseLowCodeSource({...input,...extra}),error=>error.status===422)
})
test('runtime input and version strategy reject permissions, tenant overrides, unknown operations and invalid rollout ranges',()=>{
 assert.equal(c.parseLowCodeRuntimeInput({releaseId:'page-release',params:{current:1,pageSize:20,keyword:'设备'}}).releaseId,'page-release')
 for(const extra of [{schema:{version:2}},{permissionCode:'*'},{tenantId:'other'},{url:'https://example.invalid'},{params:{applicantId:'other'}}])assert.throws(()=>c.parseLowCodeRuntimeInput({releaseId:'page-release',...extra}),error=>error.status===422)
 for(const percent of [-1,101,0.5,'10'])assert.throws(()=>c.parseLowCodeRollout({expectedRevision:1,releaseId:'one',rolloutReleaseId:'two',percent}),error=>error.status===422)
 assert.equal(c.parseLowCodeRollout({expectedRevision:1,releaseId:'one',rolloutReleaseId:'two',percent:100}).percent,100)
})
