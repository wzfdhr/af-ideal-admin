import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'
const base=()=>structuredClone(c.EQUIPMENT_FORM)
test('definition comparison ignores object key order and never mutates either immutable input',()=>{
 const before=base(),after=base(),field=after.widgetsConfig[0]
 field.config=Object.fromEntries(Object.entries(field.config).reverse())
 const original=JSON.stringify([before,after])
 assert.deepEqual(c.compareFormDefinitions(before,after),{fields:[],sources:[],settings:[],total:0})
 assert.equal(JSON.stringify([before,after]),original)
})
test('field identity alignment detects added removed reordered and changed field configurations',()=>{
 const before=base(),after=base()
 after.widgetsConfig[0].config.label='资产名称'
 after.widgetsConfig.splice(3,1)
 after.widgetsConfig.unshift({uid:'project',type:'input',name:'项目',config:{id:'project',label:'项目',required:true}})
 const diff=c.compareFormDefinitions(before,after)
 assert.equal(diff.fields.find(item=>item.key==='project').kind,'added')
 assert.equal(diff.fields.find(item=>item.key==='reason').kind,'removed')
 const changed=diff.fields.find(item=>item.key==='itemName')
 assert.deepEqual(changed.properties.find(item=>item.property==='label'),{property:'label',before:'设备名称',after:'资产名称'})
 assert.deepEqual(changed.properties.find(item=>item.property==='position'),{property:'position',before:1,after:2})
 assert.equal(diff.fields.find(item=>item.key==='quantity').kind,'changed')
})
test('options array order, structured behavior, rule removal and layout/formula configuration are real differences',()=>{
 const before=base();before.version=2
 const after=base();after.version=2
 before.widgetsConfig[0].config.validation={minLength:3}
 after.widgetsConfig[0].config.behavior={requiredWhen:{field:'quantity',operator:'gte',value:2}}
 assert.throws(()=>c.compareFormDefinitions(before,after),error=>error.status===422)
 after.widgetsConfig[0].config.behavior.requiredWhen.operator='eq'
 after.formConfig.layout='horizontal';delete after.formConfig.computedFields
 const diff=c.compareFormDefinitions(before,after)
 assert.equal(diff.settings.find(item=>item.property==='layout').after,'horizontal')
 assert.equal(diff.settings.find(item=>item.property==='computedFields').after,undefined)
 assert.equal(diff.fields.find(item=>item.key==='itemName').properties.find(item=>item.property==='validation').after,undefined)
 const schema={version:2,formConfig:{size:'medium',layout:'vertical',labelAlign:'right'},dataSources:[],widgetsConfig:[{uid:'type',type:'select',name:'类别',config:{optionsType:'fixed',options:[{label:'A',value:'a'},{label:'B',value:'b'}]}}]}
 const reordered=structuredClone(schema);reordered.widgetsConfig[0].config.options.reverse()
 assert.deepEqual(c.compareFormDefinitions(schema,reordered).fields[0].properties.map(item=>item.property),['options'])
})
test('source snapshots and references compare by declared key without hiding binding or snapshot differences',()=>{
 const before=base();before.version=2
 before.dataSources=[{key:'devices',name:'设备来源',kind:'registered',registryId:'source-one',registryRevision:1,dictionaryRevision:2,optionsSnapshot:[{label:'A',value:'a'}]}]
 before.widgetsConfig.push({uid:'deviceType',type:'select',name:'类别',config:{optionsType:'registered',optionsSourceKey:'devices',options:[]}})
 const after=structuredClone(before);after.dataSources[0].registryRevision=2;after.dataSources[0].optionsSnapshot[0].label='新A'
 const diff=c.compareFormDefinitions(before,after)
 assert.equal(diff.fields.length,0);assert.equal(diff.sources[0].kind,'changed')
 assert.deepEqual(diff.sources[0].properties.map(item=>item.property),['optionsSnapshot','registryRevision'])
})
test('future or malformed definitions fail explicitly instead of returning a false no-change result',()=>{
 for(const change of [s=>s.version=3,s=>s.widgetsConfig[0].config.script='run()',s=>s.widgetsConfig.push(s.widgetsConfig[0])]){
  const altered=base();change(altered);assert.throws(()=>c.compareFormDefinitions(base(),altered),error=>error.status===422)
 }
})
