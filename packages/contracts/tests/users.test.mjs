import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '../dist/index.js'
const body={username:'member-fixture',name:'成员',phone:'15000000001',email:'fixture@invalid.example',initialPassword:'Private-fixture-password-2026',status:'enabled'}
test('user creation rejects privilege fields, malformed contacts, unsupported status and short private credentials',()=>{
  assert.equal(contracts.parseUserCreate(body).username,body.username)
  for(const patch of [{permissions:['*']},{role:'admin'},{initialPassword:'short'},{phone:'masked-***'},{email:'bad-email'},{status:'future-status'},{name:' '}])
    assert.throws(()=>contracts.parseUserCreate({...body,...patch}),error=>error.status===422)
})
test('partial member edits preserve omitted contacts and masking never returns the original complete contact',()=>{
  assert.deepEqual(contracts.parseUserUpdate({name:'新姓名',expectedRevision:3}),{expectedRevision:3,name:'新姓名'})
  assert.throws(()=>contracts.parseUserUpdate({expectedRevision:3}),error=>error.status===422)
  assert.throws(()=>contracts.parseUserUpdate({name:'X',username:'changed',expectedRevision:3}),error=>error.status===422)
  assert.notEqual(contracts.maskPhone(body.phone),body.phone)
  assert.notEqual(contracts.maskEmail(body.email),body.email)
  assert.equal(contracts.maskPhone(''),'')
  assert.equal(contracts.maskEmail(''),'')
})
