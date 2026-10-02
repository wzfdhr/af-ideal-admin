import assert from 'node:assert/strict'
import {test} from 'node:test'
import contracts from '../dist/index.js'
test('application commands reject foreign identity, executable templates, malformed identifiers and unbounded text',()=>{
 const body={name:'受控应用',code:'expense-app',description:'',template:'blank'}
 assert.equal(contracts.parseApplicationCreate(body).code,'expense-app')
 for(const changed of [{tenantId:'foreign'},{template:'script'},{code:'../leave'},{description:'x'.repeat(501)},{name:''}])assert.throws(()=>contracts.parseApplicationCreate({...body,...changed}),error=>error.status===422)
})
test('copy commands carry source and draft versions without allowing release or runtime-data injection',()=>{
 const body={name:'独立副本',code:'copied-app',expectedRevision:2,formRevision:3,workflowRevision:4}
 assert.equal(contracts.parseApplicationCopy(body).workflowRevision,4)
 for(const changed of [{expectedRevision:0},{formRevision:1.1},{releaseId:'foreign'},{records:[]},{permissions:['*']}])assert.throws(()=>contracts.parseApplicationCopy({...body,...changed}),error=>error.status===422)
})
