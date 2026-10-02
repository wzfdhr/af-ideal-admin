import assert from 'node:assert/strict'
import {test} from 'node:test'
import c from '../dist/index.js'
const sample=()=>({format:'af-admin-application',version:1,dependencies:[{key:'form-contract',version:1},{key:'serial-workflow',version:1}],application:{name:'受控定义',description:'',businessKind:'generic'},references:{application:'application',form:'form',workflow:'workflow'},people:[{key:'person-1',kind:'approver'}],form:{...structuredClone(c.EQUIPMENT_FORM),widgetsConfig:structuredClone(c.EQUIPMENT_FORM.widgetsConfig).map(widget=>{delete widget.config.defaultValue;return widget})},workflow:{version:1,nodes:[{id:'start',type:'start',name:'开始',config:{}},{id:'approve',type:'approval',name:'审核',config:{approvers:['person-1'],formId:'form'}},{id:'end',type:'end',name:'结束',config:{}}],edges:[{id:'1',source:'start',target:'approve',label:''},{id:'2',source:'approve',target:'end',label:''}]},redactions:[],checksum:'a'.repeat(64)})
test('portable package parser preserves registered calculations and accepts only symbolic application references',()=>{
 const parsed=c.parseApplicationPackage(sample());assert.equal(parsed.workflow.nodes[1].config.formId,'form');assert.equal(parsed.form.formConfig.computedFields[0].operation,'quantity-times-price')
 for(const mutate of [p=>{p.version=2},p=>{p.dependencies[0].key='execute-user-script'},p=>{p.references.form='tenant-form-id'},p=>{p.people[0].key='actual-user-id'},p=>{p.workflow.nodes[1].config.approvers=['foreign-person']},p=>{p.form.widgetsConfig[0].config.defaultValue='private actual data'},p=>{p.password='secret'}]){
  const pkg=sample();mutate(pkg);assert.throws(()=>c.parseApplicationPackage(pkg),error=>error.status===422)
 }
})
