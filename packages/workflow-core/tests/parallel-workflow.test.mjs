import assert from 'node:assert/strict'
import { test } from 'node:test'
import core from '../dist/index.js'
import c from '@af-admin/contracts'
const node=(id,type,config={})=>({id,type,name:id,config})
const edge=(id,source,target,extra={})=>({id,source,target,label:'',...extra})
const graph=()=>({version:3,nodes:[node('start','start'),node('fork','parallel',{joinId:'join'}),node('a','approval',{approvers:['user-a']}),node('b','sign',{approvers:['user-b','user-c'],voting:{mode:'all'}}),node('join','join',{forkId:'fork'}),node('end','end')],edges:[edge('1','start','fork'),edge('2','fork','a',{channel:'branch-1'}),edge('3','fork','b',{channel:'branch-2'}),edge('4','a','join'),edge('5','b','join'),edge('6','join','end')]})
test('parallel graphs retain explicit paired regions and exact all/any/quorum semantics',()=>{
 assert.equal(core.validateExecutableWorkflow(graph(),c.EQUIPMENT_FORM).version,3)
 const sign=graph().nodes.find(n=>n.type==='sign')
 assert.equal(core.votingThreshold(sign),2)
 sign.config.voting={mode:'any'};assert.equal(core.votingThreshold(sign),1)
 sign.config.voting={mode:'quorum',quorum:1};assert.equal(core.votingThreshold(sign),1)
 assert.equal(core.votingOutcome(2,1,1),'waiting');assert.equal(core.votingOutcome(2,2,0),'approved');assert.equal(core.votingOutcome(2,1,0),'rejected')
 assert.deepEqual([...core.selectedParallelNodeIds(graph(),{})].sort(),['a','b','end','fork','join','start'])
 assert.throws(()=>core.advanceWorkflow(graph(),undefined,{}),/耐久活动/)
})
test('nested parallel regions and conditions remain separate and must reach their own joins',()=>{
 const g=graph();g.nodes.push(node('inner','parallel',{joinId:'inner-join'}),node('inner-join','join',{forkId:'inner'}),node('c','approval',{approvers:['user-c']}),node('d','approval',{approvers:['user-d']}))
 g.edges.find(e=>e.target==='a').target='inner';g.edges.push(edge('i1','inner','c',{channel:'branch-1'}),edge('i2','inner','d',{channel:'branch-2'}),edge('i3','c','inner-join'),edge('i4','d','inner-join'),edge('i5','inner-join','a'))
 assert.equal(core.validateExecutableWorkflow(g,c.EQUIPMENT_FORM).nodes.length,10)
 const x=structuredClone(g);x.edges.find(e=>e.source==='c').target='join';assert.throws(()=>core.validateExecutableWorkflow(x),error=>error.status===422)
})
test('cross-branch activity sharing, malformed pairing, early end, cycles and invalid voting never publish',()=>{
 for(const change of [g=>g.edges.find(e=>e.source==='a').target='b',g=>g.edges.find(e=>e.source==='a').target='end',g=>g.nodes.find(n=>n.id==='join').config.forkId='other',g=>g.edges.find(e=>e.source==='join').target='fork',g=>g.edges.find(e=>e.channel==='branch-2').channel='branch-1',g=>g.nodes.find(n=>n.type==='sign').config.voting.quorum=3,g=>g.nodes.find(n=>n.type==='sign').config.approvers=['user-b'],g=>g.version=4]){const g=graph();change(g);assert.throws(()=>core.validateExecutableWorkflow(g),error=>error.status===422)}
})
