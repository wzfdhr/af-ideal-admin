import assert from 'node:assert/strict'
import {test} from 'node:test'
import c from '../dist/index.js'
test('equipment fields normalize decimal values and compute exact registered money while rejecting false totals',()=>{
 const fields=c.validateBusinessFields(c.EQUIPMENT_FORM,{itemName:'设备',quantity:'3',unitPrice:'0.10',reason:'使用'})
 assert.equal(fields.quantity,3);assert.equal(fields.unitPrice,'0.10');assert.equal(c.computeBusinessFields(c.EQUIPMENT_FORM,fields).totalAmount,'0.30')
 for(const changed of [{quantity:[3]},{unitPrice:'1e3'},{unitPrice:'0.001'},{totalAmount:'0.00'},{quantity:0}])assert.throws(()=>c.validateBusinessFields(c.EQUIPMENT_FORM,{...fields,...changed}),error=>error.status===422)
 assert.deepEqual(c.validateBusinessFields(c.EQUIPMENT_FORM,{},false),{})
 assert.throws(()=>c.validateBusinessFields(c.EQUIPMENT_FORM,{}),error=>error.status===422)
})
test('generic calculation rules reject scripts, missing dependencies, duplicate output ids and future formats',()=>{
 for(const changed of [{operation:'eval:script'},{quantity:'absent'},{id:'quantity'}]){
  const schema=structuredClone(c.EQUIPMENT_FORM);Object.assign(schema.formConfig.computedFields[0],changed)
  assert.throws(()=>c.parseForm(schema),error=>error.status===422)
 }
 assert.throws(()=>c.parseForm({...c.EQUIPMENT_FORM,version:99}),error=>error.status===422)
 const schema=structuredClone(c.EQUIPMENT_FORM);schema.widgetsConfig[0].config.readonly=true;schema.widgetsConfig[0].config.defaultValue='受控值'
 assert.throws(()=>c.validateBusinessFields(schema,{itemName:'覆盖只读',quantity:1,reason:'使用'}),error=>error.status===422)
 assert.equal(c.validateBusinessFields(schema,{quantity:1,reason:'使用'}).itemName,'受控值')
})
