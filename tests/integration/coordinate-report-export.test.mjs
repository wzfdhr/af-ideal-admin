import assert from 'node:assert/strict'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import generator from '../../services/reference-api/dist/report-export-generators.js'

const longitude = { reference: { kind: 'field', id: 'lon' }, key: 'field:lon', label: '经度', valueType: 'coordinate', coordinateAxis: 'longitude', searchable: false, sortable: true }
const latitude = { ...longitude, reference: { kind: 'field', id: 'lat' }, key: 'field:lat', label: '纬度', coordinateAxis: 'latitude' }
const money = { ...longitude, reference: { kind: 'field', id: 'amount' }, key: 'field:amount', label: '金额', valueType: 'decimal' }
delete money.coordinateAxis
const snapshot = {
  version: 1, definitionId: 'coordinate-report', definitionVersionId: 'coordinate-report-v1', definitionVersion: 1,
  schema: { version: 1, name: '坐标明细', source: { kind: 'application-records', applicationId: 'coordinate-app' }, kind: 'detail', metric: 'count', factTime: 'createdAt', timeZone: 'UTC', fields: [longitude, latitude, money].map(field => field.reference) },
  sourceReleaseId: 'coordinate-release', sourceReleaseVersion: 1, policyVersion: 1,
  query: { version: 1, timeZone: 'UTC', dateRange: { from: '2026-10-01', to: '2026-10-12' }, statuses: [], keyword: '', searchFields: [], sort: { field: longitude.reference, direction: 'asc' }, current: 1, pageSize: 20 },
  queriedAt: '2026-10-12T00:00:00.000Z', dataCutoffAt: '2026-10-12T00:00:00.000Z', columns: [longitude, latitude, money],
  rows: [
    { id: 'signed', values: { 'field:lon': '-73.985656', 'field:lat': '-33.868812', 'field:amount': '0.10' } },
    { id: 'boundaries', values: { 'field:lon': '-180', 'field:lat': '90', 'field:amount': '1.20' } },
    { id: 'corrupt', values: { 'field:lon': '180.000001', 'field:lat': '=1+1' } },
    { id: 'hidden', values: { 'field:lon': '-12.345678' }, hiddenFieldKeys: ['field:lon'] },
  ], total: 4,
}

test('coordinate xlsx export retains six-digit signed numeric precision, closed bounds, old money and field redaction', async () => {
  const output = await generator.generateReportExport('xlsx', snapshot)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output.bytes)
  const sheet = workbook.getWorksheet('记录')
  assert.equal(sheet.getCell('A5').value, -73.985656)
  assert.equal(sheet.getCell('B5').value, -33.868812)
  assert.equal(sheet.getCell('A5').numFmt, '0.######')
  assert.equal(sheet.getCell('B5').numFmt, '0.######')
  assert.equal(sheet.getCell('C5').value, 0.1)
  assert.equal(sheet.getCell('C5').numFmt, '0.00')
  assert.equal(sheet.getCell('A6').value, -180)
  assert.equal(sheet.getCell('B6').value, 90)
  assert.equal(sheet.getCell('A7').value, '180.000001')
  assert.equal(sheet.getCell('B7').value, '=1+1')
  assert.equal(sheet.getCell('B7').type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('A8').value, '受限')
  const csv = await generator.generateReportExport('csv', snapshot)
  assert.ok(csv.bytes.toString().includes('-73.985656'))
  assert.ok(!csv.bytes.toString().includes('-12.345678'))
})
