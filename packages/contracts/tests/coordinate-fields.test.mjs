import assert from 'node:assert/strict'
import { test } from 'node:test'
import c from '../dist/index.js'

const field = (uid, axis) => ({ uid, type: 'input', name: uid, config: { id: uid, valueType: 'coordinate', coordinateAxis: axis, required: true } })
const schema = () => ({ version: 2, formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' }, dataSources: [], widgetsConfig: [field('lon', 'longitude'), field('lat', 'latitude')] })
const invalid = (run) => assert.throws(run, error => error.status === 422)

test('coordinate input uses exact microdegree bounds and canonical strings across JSON save/reopen', () => {
  for (const [lon, lat] of [['-180', '-90'], ['180', '90'], ['-73.985656', '40.748433'], ['0', '-0.000000'], ['179.999999', '-89.999999']]) {
    const parsed = c.parseForm(schema())
    const saved = c.validateBusinessFields(parsed, { lon, lat })
    assert.equal(typeof saved.lon, 'string')
    assert.equal(saved.lon, lon)
    assert.equal(saved.lat, lat === '-0.000000' ? '0' : lat)
    assert.deepEqual(c.validateBusinessFields(JSON.parse(JSON.stringify(parsed)), JSON.parse(JSON.stringify(saved))), saved)
  }
  assert.deepEqual(c.validateBusinessFields(schema(), { lon: '-73.980000', lat: '40.000000' }), { lon: '-73.98', lat: '40' })
  assert.deepEqual(c.validateBusinessFields(schema(), {}, false), {})
  invalid(() => c.validateBusinessFields(schema(), {}))
  assert.equal(c.normalizeCoordinate('-0.000001', 'latitude'), '-0.000001')
})

test('coordinate rejects coercion, whitespace, scripts, exponent, excessive precision and out of range values', () => {
  for (const value of [1, -1, NaN, Infinity, true, [], {}, 'NaN', 'Infinity', '+1', '01', '1e2', ' 1', '1 ', '1\n', '1\r', '1\t', '1.0000000', '.1', '1.', '1junk', 'alert(1)', '-180.000001', '180.000001', '-999']) {
    invalid(() => c.validateBusinessFields(schema(), { lon: value, lat: '0' }, false))
  }
  for (const value of ['90.000001', '-90.000001', '180']) invalid(() => c.validateBusinessFields(schema(), { lon: '0', lat: value }))
  assert.equal(c.normalizeCoordinate('0', 'unknown'), undefined)
})

test('coordinate declaration is closed and explicit v2 only; defaults normalize without mutating caller', () => {
  for (const change of [s => s.version = 1, s => delete s.widgetsConfig[0].config.coordinateAxis, s => s.widgetsConfig[0].config.coordinateAxis = 'x', s => s.widgetsConfig[0].config.coordinateAxis = ['longitude'], s => s.widgetsConfig[0].config.valueType = ['coordinate'], s => s.widgetsConfig[0].type = 'textarea', s => s.widgetsConfig[0].config.min = 0, s => s.widgetsConfig[0].config.max = 180, s => s.widgetsConfig[0].config.precision = 6, s => s.widgetsConfig[0].config.valueType = 'decimal', s => s.widgetsConfig[0].config.defaultValue = '-180.000001', s => s.widgetsConfig[0].config.defaultValue = 0]) {
    const s = schema(); change(s); invalid(() => c.parseForm(s))
  }
  const s = schema(); s.widgetsConfig[0].config.defaultValue = '-0.000000'
  assert.equal(c.parseForm(s).widgetsConfig[0].config.defaultValue, '0')
  assert.equal(s.widgetsConfig[0].config.defaultValue, '-0.000000')
})

test('coordinates cannot drive existing form comparisons, monetary calculations or workflow predicates', () => {
  for (const change of [s => s.widgetsConfig[0].config.validation = { compare: { field: 'lat', operator: 'eq' } }, s => s.widgetsConfig[0].config.validation = { minLength: 1 }, s => s.widgetsConfig[1].config.behavior = { visibleWhen: { field: 'lon', operator: 'eq', value: '-1' } }, s => s.formConfig.computedFields = [{ id: 'total', operation: 'quantity-times-price', quantity: 'lon', price: 'lat' }]]) {
    const s = schema(); change(s); invalid(() => c.parseForm(s))
  }
  assert.deepEqual(c.workflowConditionFields(schema()), [])
  for (const valueType of ['text', 'integer', 'decimal']) {
    invalid(() => c.validateWorkflowConditionBindings({ version: 2, nodes: [{ id: 'condition', config: { condition: { mode: 'all', predicates: [{ field: 'lon', valueType, operator: 'eq', value: valueType === 'integer' ? 0 : '0' }] } } }], edges: [] }, schema()))
  }
})

test('existing nonnegative quantity and exact two-decimal money semantics remain intact', () => {
  const input = { itemName: '设备', quantity: '3', unitPrice: '0.10', reason: '使用' }
  assert.equal(c.computeBusinessFields(c.EQUIPMENT_FORM, c.validateBusinessFields(c.EQUIPMENT_FORM, input)).totalAmount, '0.30')
  for (const patch of [{ quantity: '-1' }, { unitPrice: '-1.00' }, { unitPrice: '1.000001' }]) invalid(() => c.validateBusinessFields(c.EQUIPMENT_FORM, { ...input, ...patch }))
})
