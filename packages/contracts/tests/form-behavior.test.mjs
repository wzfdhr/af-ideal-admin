import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'
const field=(uid,type,config={})=>({uid,type,name:uid,config:{id:uid,label:uid,...config}})
const schema=()=>({version:2,formConfig:{size:'medium',layout:'vertical',labelAlign:'right'},dataSources:[],widgetsConfig:[
 field('kind','select',{required:true,optionsType:'fixed',options:[{label:'内部',value:'internal'},{label:'外部',value:'external'}]}),
 field('email','input',{maxLength:254,validation:{minLength:6,format:'email'},behavior:{visibleWhen:{field:'kind',operator:'eq',value:'external'},requiredWhen:{field:'kind',operator:'eq',value:'external'}}}),
 field('start','date-picker',{required:true}),field('end','date-picker',{required:true,validation:{compare:{field:'start',operator:'gte'}}}),
 field('amount','input',{valueType:'integer'}),field('limit','input',{valueType:'integer',validation:{compare:{field:'amount',operator:'gte'}}}),
]})
const valid={kind:'internal',start:'2028-02-29',end:'2028-03-01',amount:'2',limit:'3'}
const invalid=fn=>assert.throws(fn,error=>error.status===422)
test('calendar validation rejects impossible days and observes Gregorian leap years',()=>{
 for(const date of ['0000-01-01','2026-02-29','2026-04-31','1900-02-29','2026-13-01','2026-1-1'])assert.equal(c.isCalendarDate(date),false,date)
 for(const date of ['2000-02-29','2028-02-29','2026-12-31'])assert.equal(c.isCalendarDate(date),true,date)
 invalid(()=>c.validateBusinessFields(schema(),{...valid,start:'2026-02-30'}))
})
test('visibility, conditional required and comparison are authoritative on drafts and complete submits',()=>{
 assert.deepEqual(c.validateBusinessFields(schema(),valid),{...valid,amount:2,limit:3})
 invalid(()=>c.validateBusinessFields(schema(),{...valid,email:'hidden@example.test'},false))
 const external={...valid,kind:'external'}
 assert.equal(c.validateBusinessFields(schema(),external,false).email,undefined)
 invalid(()=>c.validateBusinessFields(schema(),external))
 invalid(()=>c.validateBusinessFields(schema(),{...external,email:'x'}))
 assert.equal(c.validateBusinessFields(schema(),{...external,email:'a@example.test'}).email,'a@example.test')
 for(const changes of [{end:'2028-02-28'},{limit:'1'}]) invalid(()=>c.validateBusinessFields(schema(),{...valid,...changes},false))
 assert.deepEqual(c.validateBusinessFields(schema(),{end:'2028-03-01'},false),{end:'2028-03-01'})
 invalid(()=>c.validateBusinessFields(schema(),{kind:'internal',end:'2028-03-01'}))
})
test('fixed format presets reject credentials, plain HTTP, malformed email and phone without accepting scripts',()=>{
 assert.equal(c.textValidationError({format:'https-url'},'https://example.test/path'),undefined)
 for(const value of ['http://example.test','https://u:p@example.test','javascript:alert(1)'])assert.ok(c.textValidationError({format:'https-url'},value))
 assert.ok(c.textValidationError({format:'email'},'not-mail'))
 assert.ok(c.textValidationError({format:'phone'},'letters'))
 assert.equal(c.textValidationError({format:'phone'},'+86 13800000000'),undefined)
 assert.ok(c.textValidationError({minLength:5},'abcd'))
})
test('closed rules reject unknown, wrong typed, cyclic, hidden target and script definitions',()=>{
 const variants=[
  s=>s.widgetsConfig[1].config.validation={regex:'(.)*'},
  s=>s.widgetsConfig[1].config.validation={format:'script'},
  s=>s.widgetsConfig[1].config.validation={minLength:255},
  s=>s.widgetsConfig[1].config.validation={minLength:'6'},
  s=>s.widgetsConfig[1].config.required='true',
  s=>s.widgetsConfig[1].config.maxLength=-1,
  s=>s.widgetsConfig[1].config.behavior={visibleWhen:{field:'missing',operator:'eq',value:'x'}},
  s=>s.widgetsConfig[1].config.behavior={visibleWhen:{field:'email',operator:'eq',value:'x'}},
  s=>s.widgetsConfig[0].config.behavior={visibleWhen:{field:'email',operator:'neq',value:'x'}},
  s=>s.widgetsConfig[1].config.behavior={visibleWhen:{field:'kind',operator:'eval',value:'external'}},
  s=>s.widgetsConfig[1].config.behavior={visibleWhen:{field:'kind',operator:'eq',value:1}},
  s=>s.widgetsConfig[1].config.validation={compare:{field:'email',operator:'eq'}},
  s=>s.widgetsConfig[3].config.validation={compare:{field:'email',operator:'gte'}},
  s=>s.widgetsConfig[1].config.validation={compare:{field:'kind',operator:'gte'}},
  s=>s.widgetsConfig[1].config.disabled=true,
  s=>s.version=3,
 ]
 for(const change of variants){const s=schema();change(s);invalid(()=>c.parseForm(s))}
 const s=schema();s.widgetsConfig.push(field('confirm','input',{validation:{compare:{field:'email',operator:'eq'}}}));invalid(()=>c.parseForm(s))
})
test('integer conditions match normalized draft strings and old fixed leave rejects new behavior rules',()=>{
 const s=schema();s.widgetsConfig[1].config.behavior={visibleWhen:{field:'amount',operator:'eq',value:2}}
 assert.equal(c.formFieldState(s.widgetsConfig[1].config,{amount:'02'}).visible,true)
 const values={...valid,amount:'02',email:'valid@example.test'};assert.equal(c.validateBusinessFields(s,values).email,values.email)
 s.widgetsConfig[1].config.behavior.visibleWhen.value='2';invalid(()=>c.parseForm(s))
 const leave=structuredClone(c.LEAVE_FORM);assert.ok(leave)
 leave.version=2;leave.widgetsConfig[0].config.validation={compare:{field:'startSlot',operator:'eq'}}
 invalid(()=>c.validateLeaveForm(leave))
})
