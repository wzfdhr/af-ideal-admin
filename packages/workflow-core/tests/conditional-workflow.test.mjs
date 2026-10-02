import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
import c from '@af-admin/contracts'
const graph=()=>({version:2,nodes:[
 {id:'start',type:'start',name:'开始',config:{}},
 {id:'check',type:'condition',name:'金额判断',config:{condition:{mode:'all',predicates:[{field:'totalAmount',valueType:'decimal',operator:'gte',value:'0.30'}]}}},
 {id:'high',type:'approval',name:'高额审核',config:{approvers:['high-user']}},
 {id:'low',type:'approval',name:'普通审核',config:{approvers:['low-user']}},
 {id:'copy',type:'copy',name:'归档抄送',config:{ccUsers:['observer']}},
 {id:'end',type:'end',name:'结束',config:{}},
],edges:[{id:'1',source:'start',target:'check',label:''},{id:'2',source:'check',target:'high',label:'匹配',branch:'matched'},{id:'3',source:'check',target:'low',label:'默认',branch:'fallback'},{id:'4',source:'high',target:'copy',label:''},{id:'5',source:'low',target:'copy',label:''},{id:'6',source:'copy',target:'end',label:''}]})
test('conditional DAG routes exact money, preserves mutually exclusive merge and advances once through copy',()=>{
 const g=core.validateExecutableWorkflow(graph(),c.EQUIPMENT_FORM)
 for(const [amount,node] of [['0.29','low'],['0.30','high'],['0.31','high']]){
  const next=core.advanceWorkflow(g,undefined,{totalAmount:amount});assert.equal(next.approval.id,node);assert.equal(next.routes[0].branch,node==='high'?'matched':'fallback')
  const done=core.advanceWorkflow(g,node,{totalAmount:amount});assert.equal(done.completed,true);assert.deepEqual(done.copiedUserIds,['observer']);assert.deepEqual(done.routes,[])
 }
 const shuffled=graph();shuffled.nodes.reverse();shuffled.edges.reverse();assert.equal(core.advanceWorkflow(shuffled,undefined,{totalAmount:'0.30'}).approval.id,'high')
 assert.throws(()=>core.advanceWorkflow(g),error=>error.status===422)
})
test('conditional all/any evaluates typed operands, treats missing optional values as false and never short circuits malformed data',()=>{
 const g=graph(),condition=g.nodes[1].config.condition
 condition.predicates.push({field:'quantity',valueType:'integer',operator:'gt',value:2})
 assert.equal(core.advanceWorkflow(g,undefined,{totalAmount:'0.30',quantity:2}).approval.id,'low')
 condition.mode='any';assert.equal(core.advanceWorkflow(g,undefined,{totalAmount:'0.29',quantity:3}).approval.id,'high')
 assert.equal(core.advanceWorkflow(g,undefined,{}).approval.id,'low')
 assert.throws(()=>core.advanceWorkflow(g,undefined,{totalAmount:'0.30',quantity:'oops'}),error=>error.status===422)
 assert.equal(c.evaluateWorkflowCondition({mode:'all',predicates:[{field:'day',valueType:'date',operator:'gte',value:'2028-02-29'}]},{day:'2028-03-01'}),true)
 assert.throws(()=>c.evaluateWorkflowCondition({mode:'all',predicates:[{field:'day',valueType:'date',operator:'eq',value:'2026-02-29'}]},{day:'2026-02-28'}),error=>error.status===422)
})
test('graph and typed binding reject bypasses, loops, missing fallback, wrong types and scripts',()=>{
 for(const alter of [g=>g.edges[2].branch='matched',g=>g.edges.splice(2,1),g=>g.edges[2].target='end',g=>g.edges[3].target='check',g=>g.nodes[1].config.condition.predicates[0].field='unknown',g=>g.nodes[1].config.condition.predicates[0].valueType='integer',g=>g.nodes[1].config.condition='amount>0',g=>g.nodes[1].config.condition.predicates[0].script='eval',g=>g.nodes[2].type='parallel',g=>g.version=4]){
  const g=graph();alter(g);assert.throws(()=>core.validateExecutableWorkflow(g,c.EQUIPMENT_FORM),error=>error.status===422)
 }
 const old={...graph(),version:1};delete old.nodes[1].config.condition;old.edges.forEach(edge=>delete edge.branch)
 assert.throws(()=>core.validateExecutableWorkflow(old),/R1/)
})
test('valid larger registered computed money remains routable and values beyond exact safe cents are rejected',()=>{
 const form=structuredClone(c.EQUIPMENT_FORM);form.widgetsConfig.find(field=>field.uid==='quantity').config.max=1000000;form.widgetsConfig.find(field=>field.uid==='unitPrice').config.max=1000000
 const fields=c.validateBusinessFields(form,{itemName:'大额边界',quantity:1000000,unitPrice:'1000000.00',reason:'既有精确计算范围'}),computed=c.computeBusinessFields(form,fields)
 assert.equal(computed.totalAmount,'1000000000000.00');assert.equal(core.advanceWorkflow(graph(),undefined,{...fields,...computed}).approval.id,'high')
 assert.throws(()=>core.advanceWorkflow(graph(),undefined,{totalAmount:'90071992547409.92'}),error=>error.status===422)
})
