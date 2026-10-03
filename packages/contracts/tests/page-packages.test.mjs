import assert from 'node:assert/strict'
import {test} from 'node:test'
import c from '../dist/index.js'
const sample=()=>{
 const form=structuredClone(c.EQUIPMENT_FORM);form.version=2;form.widgetsConfig.forEach(field=>delete field.config.defaultValue)
 const page=c.createBusinessLowCodePage('page-source-1','可移植设备管理')
 return {format:'af-admin-application',version:3,dependencies:[{key:'form-contract',version:2},{key:'serial-workflow',version:1},{key:'registered-sources',version:1},{key:'page-contract',version:2},{key:'low-code-sources',version:1},{key:'pro-materials',version:1}],application:{name:'设备模板',description:'',businessKind:'generic'},references:{application:'application',form:'form',workflow:'workflow'},people:[{key:'person-1',kind:'approver'},{key:'person-2',kind:'approver'}],sources:[],form,workflow:c.serialWorkflow('person-1','person-2'),pageSources:[{key:'page-source-1',name:'包内业务',kind:'application-records',binding:'application'}],pages:[{key:'page-1',name:'设备管理',schema:page}],redactions:[],checksum:'0'.repeat(64)}
}
test('v3 retains the immutable page contract and all source refs as typed portable symbols',()=>{
 const pkg=sample(),parsed=c.parseApplicationPackage(pkg)
 assert.equal(parsed.version,3);assert.deepEqual(parsed.pages,pkg.pages);assert.deepEqual(parsed.pageSources,pkg.pageSources)
 for(const alter of [p=>p.version=4,p=>p.dependencies=p.dependencies.filter(d=>d.key!=='pro-materials'),p=>p.pageSources[0].binding='source-tenant-release',p=>p.pages[0].schema.materials[0].sourceId='other',p=>p.pageSources.push({...p.pageSources[0],key:'page-source-2'}),p=>p.pages[0].schema.actions[0].script='fetch()',p=>p.pages=[]]){
  const changed=sample();alter(changed);assert.throws(()=>c.parseApplicationPackage(changed),error=>error.status===422)
 }
})
test('page dictionary slots must be complete, explicitly used and cannot masquerade as an application binding',()=>{
 const pkg=sample();pkg.sources=[{key:'source-1',name:'目标字典槽',kind:'dictionary'}];pkg.pageSources.push({key:'page-source-2',name:'目标选项',kind:'registered-dictionary',binding:'source-1'})
 pkg.pages[0].schema.sources.push('page-source-2');pkg.pages[0].schema.materials.push({id:'options',type:'ProTable',name:'选项',sourceId:'page-source-2',span:24,display:'inline'})
 assert.equal(c.parseApplicationPackage(pkg).sources.length,1)
 const missing=structuredClone(pkg);missing.sources=[];assert.throws(()=>c.parseApplicationPackage(missing),error=>error.status===422)
 const incompatible=structuredClone(pkg);incompatible.pageSources[1].binding='application';assert.throws(()=>c.parseApplicationPackage(incompatible),error=>error.status===422)
})

test('v3 package size is measured in UTF-8 bytes before accepting large multibyte payloads',()=>{
 const pkg=sample();pkg.application.description='字'.repeat(90000)
 assert.ok(JSON.stringify(pkg).length<262144);assert.ok(Buffer.byteLength(JSON.stringify(pkg))>262144)
 assert.throws(()=>c.parseApplicationPackage(pkg),error=>error.businessCode==='PACKAGE_TOO_LARGE'||error.code==='PACKAGE_TOO_LARGE')
})
