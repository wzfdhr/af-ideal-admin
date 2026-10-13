import {test} from 'node:test'
import assert from 'node:assert/strict'
import c from '../dist/index.js'
const input=()=>({menuName:'真实登记页',menuType:'menu',routeKey:'dictSystem',parentId:'default-system',permission:'',sort:2,status:'enabled'})
test('registered menu resources preserve controlled routes and reject executable or weaker declarations',()=>{
 const parsed=c.parseMenuResource(input());assert.equal(parsed.routeKey,'dictSystem');assert.equal(c.MENU_ROUTE_CATALOGUE.find(row=>row.key===parsed.routeKey).componentKey,'SystemDictPage')
 for(const change of [p=>p.url='https://external.invalid',p=>p.componentKey='fetch()',p=>p.routeKey='../../secret',p=>p.permission='*',p=>p.permission='business:create',p=>p.sort=-1,p=>p.menuType='script',p=>p.routeKey='menuSystem']){const bad=input();change(bad);assert.throws(()=>c.parseMenuResource(bad),error=>error.status===422)}
})
test('catalogues and buttons have distinct controlled bindings, while updates require optimistic versions',()=>{
 const directory={...input(),menuType:'catalog',routeKey:undefined,parentId:null};assert.equal(c.parseMenuResource(directory).menuType,'catalog')
 const button={...input(),menuType:'button',routeKey:undefined,permission:'system:dict:create'};assert.equal(c.parseMenuResource(button).permission,'system:dict:create')
 assert.throws(()=>c.parseMenuResource({...button,parentId:null}),error=>error.status===422)
 assert.throws(()=>c.parseMenuResource(input(),true),error=>error.status===422)
 assert.equal(c.parseMenuResource({...input(),expectedRevision:2},true).expectedRevision,2)
 const paths=c.MENU_ROUTE_CATALOGUE.map(row=>row.path);assert.equal(new Set(paths).size,paths.length);assert.ok(c.MENU_ROUTE_CATALOGUE.every(row=>!row.path.includes('://')))
})
