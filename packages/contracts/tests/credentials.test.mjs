import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '../dist/index.js'
test('self password inputs reject external identity selectors and unsupported or weak values',()=>{
 const body={oldPassword:'legacy-demo-password',newPassword:'New-private-fixture-2026',expectedRevision:1}
 assert.deepEqual(contracts.parsePasswordChange(body),body)
 for(const patch of [{userId:'another-user'},{tenantId:'other'},{expectedRevision:0},{oldPassword:''},{newPassword:'short'},{newPassword:body.oldPassword}])assert.throws(()=>contracts.parsePasswordChange({...body,...patch}),error=>error.status===422)
})
