import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
test('credential development memory validates old values, isolates versions and never reapplies an old replay',()=>{
 let changes=0,last=''
 const store=new core.CredentialDemo('initial-demo',(value)=>{last=value;changes++})
 const first={oldPassword:'initial-demo',newPassword:'New-private-fixture-2026',expectedRevision:1},key=crypto.randomUUID()
 assert.throws(()=>store.change({...first,oldPassword:'wrong'},key,'a'),error=>error.businessCode==='OLD_PASSWORD_INVALID')
 assert.equal(store.state().credentialRevision,1)
 assert.equal(store.change(first,key,'a').credentialRevision,2)
 store.change({oldPassword:first.newPassword,newPassword:'Second-private-fixture-2026',expectedRevision:2},crypto.randomUUID(),'b')
 assert.equal(store.change(first,key,'a').credentialRevision,2)
 assert.equal(changes,2);assert.equal(last,'Second-private-fixture-2026');assert.equal(store.state().credentialRevision,3)
 assert.throws(()=>store.change(first,crypto.randomUUID(),'b'),error=>error.status===409)
})
