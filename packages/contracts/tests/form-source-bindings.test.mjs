import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'
const form=()=>({version:2,formConfig:{size:'medium',layout:'vertical',labelAlign:'right'},dataSources:[{key:'device-type',name:'设备类别',kind:'registered',registryId:'registered-source'}],widgetsConfig:[{uid:'deviceType',type:'select',name:'设备类别',config:{id:'deviceType',required:true,optionsType:'registered',optionsSourceKey:'device-type',options:[]}}]})
test('form v2 preserves controlled references and immutable choice snapshots, including significant whitespace',()=>{
 const draft=form();assert.deepEqual(c.parseForm(draft),draft)
 const published=form();Object.assign(published.dataSources[0],{registryRevision:1,dictionaryRevision:2,optionsSnapshot:[{label:'设备',value:' exact '} ]})
 assert.equal(c.parseForm(published).dataSources[0].optionsSnapshot[0].value,' exact ')
 assert.equal(c.validateBusinessFields(published,{deviceType:' exact '}).deviceType,' exact ')
 assert.throws(()=>c.validateBusinessFields(published,{deviceType:'fake'}))
})
test('known form formats reject scripts, raw URLs, dangling sources, numeric selection bypasses and prototype field IDs',()=>{
 for(const change of [f=>f.version=3,f=>f.dataSources[0].url='http://localhost/private',f=>f.widgetsConfig[0].config.optionsSourceKey='unknown',f=>f.widgetsConfig[0].config.valueType='integer',f=>{f.widgetsConfig[0].uid='__proto__';f.widgetsConfig[0].config.id='__proto__'},f=>f.dataSources[0].optionsSnapshot=[{label:'forged',value:'x'}]]){
  const bad=form();change(bad);assert.throws(()=>c.parseForm(bad))
 }
 const v1=form();v1.version=1;assert.throws(()=>c.parseForm(v1))
 const published=form();Object.assign(published.dataSources[0],{registryRevision:1,dictionaryRevision:1,optionsSnapshot:[{label:'重复',value:'x'},{label:'重复2',value:'x'}]});assert.throws(()=>c.parseForm(published))
})
