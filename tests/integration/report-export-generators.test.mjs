import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { unzipSync, unzlibSync } from 'fflate'
import generator from '../../services/reference-api/dist/report-export-generators.js'

const { generateReportExport, reportExportFormatAvailable } = generator
const field = (id, label, valueType = 'text', kind = 'field') => ({
  reference: { kind, id },
  key: `${kind}:${id}`,
  label,
  valueType,
  searchable: valueType === 'text',
  sortable: true,
})
const textField = field('description', '事项说明')
const amountField = field('amount', '金额', 'decimal')
const integerField = field('quantity', '数量', 'integer')
const dateField = field('date', '业务日期', 'date')
const timeField = field('createdAt', '创建时间', 'datetime', 'metadata')
const restrictedField = field('applicantName', '申请人', 'text', 'metadata')
const punctuation = '中文记录，逗号,双引号"与\r\n下一行；括号（原样）'
const snapshot = (patch = {}) => ({
  version: 1,
  definitionId: 'report-demo',
  definitionVersionId: 'report-version-2',
  definitionVersion: 2,
  schema: {
    version: 1,
    name: '授权记录明细',
    source: { kind: 'application-records', applicationId: 'application-demo' },
    kind: 'detail',
    metric: 'count',
    factTime: 'createdAt',
    timeZone: 'Asia/Shanghai',
    fields: [
      textField,
      amountField,
      integerField,
      dateField,
      timeField,
      restrictedField,
    ].map((value) => value.reference),
  },
  sourceReleaseId: 'release-demo-3',
  sourceReleaseVersion: 3,
  policyVersion: 1,
  query: {
    version: 1,
    timeZone: 'Asia/Shanghai',
    dateRange: { from: '2026-10-01', to: '2026-10-13' },
    statuses: ['approved'],
    keyword: '中文',
    searchFields: [textField.reference],
    sort: { field: timeField.reference, direction: 'desc' },
    current: 2,
    pageSize: 20,
  },
  queriedAt: '2026-10-13T04:00:00.000Z',
  dataCutoffAt: '2026-10-13T03:59:59.000Z',
  columns: [
    textField,
    amountField,
    integerField,
    dateField,
    timeField,
    restrictedField,
  ],
  rows: [
    {
      id: 'private-binding-id-1',
      values: {
        [textField.key]: punctuation,
        [amountField.key]: '9999999999.99',
        [integerField.key]: 17,
        [dateField.key]: '2026-10-13',
        [timeField.key]: '2026-10-13T04:03:02.125Z',
        [restrictedField.key]: 'PRIVATE_SECRET_不可导出',
      },
      hiddenFieldKeys: [restrictedField.key],
    },
    {
      id: 'private-binding-id-2',
      values: {
        [textField.key]: 'https://example.invalid/?action=download',
        [amountField.key]: '001.20',
        [integerField.key]: 0,
        [dateField.key]: null,
        [timeField.key]: null,
        [restrictedField.key]: '陈明',
      },
    },
  ],
  total: 2,
  ...patch,
})
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const xlsxHashInTimezone = (timeZone, input) =>
  new Promise((resolve, reject) => {
    const script = `const {createHash}=require('node:crypto');
    const {generateReportExport}=require('./services/reference-api/dist/report-export-generators.js');
    let data=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',chunk=>data+=chunk);
    process.stdin.on('end',async()=>{try{const value=await generateReportExport('xlsx',JSON.parse(data));
      process.stdout.write(createHash('sha256').update(value.bytes).digest('hex'));}
      catch(error){console.error(error);process.exitCode=1;}});`
    const child = spawn(process.execPath, ['-e', script], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: { ...process.env, TZ: timeZone },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = '',
      errorOutput = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      errorOutput += chunk
    })
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0 ? resolve(output) : reject(new Error(errorOutput))
    )
    child.stdin.end(JSON.stringify(input))
  })

// A small independent RFC4180 reader checks quoted commas, doubled quotes and embedded CR/LF.
const readCsv = (bytes) => {
  const input = bytes.toString('utf8').replace(/^\uFEFF/, '')
  const rows = [],
    row = []
  let value = '',
    quoted = false
  for (let index = 0; index < input.length; index++) {
    const character = input[index]
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"'
        index++
      } else quoted = !quoted
    } else if (!quoted && character === ',') {
      row.push(value)
      value = ''
    } else if (!quoted && character === '\r' && input[index + 1] === '\n') {
      row.push(value)
      rows.push(row.splice(0))
      value = ''
      index++
    } else value += character
  }
  assert.equal(quoted, false, 'CSV quotes are balanced')
  assert.equal(value, '', 'CSV ends in CRLF')
  return rows
}

// Re-read actual PDF xref objects and Flate streams, then decode its Type0 ToUnicode mapping.
// This checks emitted text without relying on the writer's in-memory source values.
const readPdf = (bytes) => {
  const source = bytes.toString('latin1')
  assert.match(source, /^%PDF-1\.7/)
  assert.match(source, /%%EOF\s*$/)
  const start = Number(/startxref\s+(\d+)\s+%%EOF/.exec(source)[1])
  const xref = source.slice(start)
  const header = /^xref\s+0\s+(\d+)\s+/.exec(xref)
  assert.ok(header, 'PDF has a readable cross-reference table')
  const entries = xref
    .slice(header[0].length)
    .split(/\r?\n/)
    .slice(0, Number(header[1]))
  const offsets = entries.map((entry) => Number(entry.slice(0, 10)))
  const objects = new Map()
  for (let index = 1; index < offsets.length; index++) {
    const end = offsets[index + 1] || start
    // Objects are written in finalization order, so choose the next physical offset.
    const physicalEnd = Math.min(
      start,
      ...offsets.filter((value) => value > offsets[index])
    )
    const objectBytes = bytes.subarray(offsets[index], physicalEnd || end)
    const objectText = objectBytes.toString('latin1')
    assert.match(objectText, new RegExp(`^${index} 0 obj`))
    const marker = objectText.indexOf('stream\n')
    let stream
    if (marker >= 0) {
      const length = Number(/\/Length\s+(\d+)/.exec(objectText)[1])
      const raw = objectBytes.subarray(marker + 7, marker + 7 + length)
      stream = /\/Filter\s*\/FlateDecode/.test(objectText)
        ? Buffer.from(unzlibSync(raw)).toString('latin1')
        : raw.toString('latin1')
    }
    objects.set(index, { text: objectText, stream })
  }
  const font = Array.from(objects.values()).find((value) =>
    /\/Subtype\s*\/Type0\b/.test(value.text)
  )
  assert.ok(font, 'PDF embeds a Unicode Type0 font')
  const cmapId = Number(/\/ToUnicode\s+(\d+) 0 R/.exec(font.text)[1])
  const cmap = objects.get(cmapId).stream
  assert.match(cmap, /begincmap/)
  const unicode = new Map()
  for (const match of cmap.matchAll(
    /<([0-9a-f]{4})>\s*<([0-9a-f]{4})>\s*\[([^\]]*)\]/gi
  )) {
    const first = parseInt(match[1], 16)
    const values = Array.from(match[3].matchAll(/<([0-9a-f ]*)>/gi)).map(
      (value) => value[1].replaceAll(' ', '')
    )
    assert.equal(values.length, parseInt(match[2], 16) - first + 1)
    values.forEach((hex, index) =>
      unicode.set(
        first + index,
        Buffer.from(hex, 'hex').swap16().toString('utf16le')
      )
    )
  }
  const content = Array.from(objects.values())
    .map((value) => value.stream || '')
    .filter((value) => /\bBT\b/.test(value))
  const lines = []
  for (const stream of content)
    for (const block of stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      let text = ''
      for (const hex of block[1].matchAll(/<([0-9a-f]+)>/gi))
        for (let index = 0; index < hex[1].length; index += 4) {
          const character = unicode.get(
            parseInt(hex[1].slice(index, index + 4), 16)
          )
          assert.notEqual(
            character,
            undefined,
            'Every emitted glyph has a Unicode mapping'
          )
          text += character
        }
      lines.push(text)
    }
  const pages = Array.from(objects.values()).filter((value) =>
    /\/Type\s*\/Page\b/.test(value.text)
  ).length
  return { source, objects, pages, lines, text: lines.join('\n') }
}

test('real formats preserve selected field order, masked values, source versions and UTF8 Chinese', async () => {
  const input = snapshot()
  const csv = await generateReportExport('csv', input)
  assert.equal(csv.mimeType, 'text/csv; charset=utf-8')
  assert.equal(csv.fileName, 'report-report-demo-v2.csv')
  assert.deepEqual(Array.from(csv.bytes.subarray(0, 3)), [0xef, 0xbb, 0xbf])
  const csvRows = readCsv(csv.bytes)
  assert.deepEqual(
    csvRows[0],
    input.columns.map((value) => value.label)
  )
  assert.equal(csvRows.length, 3)
  assert.equal(csvRows[1][0], punctuation)
  assert.equal(csvRows[1][1], '9999999999.99')
  assert.equal(csvRows[1][5], '受限')
  assert.equal(csvRows[2][1], '001.20')

  const xlsx = await generateReportExport('xlsx', input)
  assert.equal(xlsx.bytes.subarray(0, 2).toString(), 'PK')
  assert.equal(
    xlsx.mimeType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(xlsx.bytes)
  assert.deepEqual(
    workbook.worksheets.map((value) => value.name),
    ['记录', '口径']
  )
  const sheet = workbook.getWorksheet('记录')
  assert.deepEqual(
    sheet.getRow(4).values.slice(1),
    input.columns.map((value) => value.label)
  )
  assert.equal(sheet.rowCount, input.rows.length + 4)
  assert.equal(sheet.getCell('A5').value, punctuation)
  assert.equal(sheet.getCell('B5').value, 9999999999.99)
  assert.equal(sheet.getCell('C5').value, 17)
  assert.equal(
    sheet.getCell('D5').value.toISOString(),
    '2026-10-13T00:00:00.000Z'
  )
  assert.equal(
    sheet.getCell('E5').value.toISOString(),
    '2026-10-13T12:03:02.125Z'
  )
  assert.equal(sheet.getCell('F5').value, '受限')
  assert.equal(
    sheet.getCell('B6').value,
    '001.20',
    'Noncanonical numeric-looking source strings stay literal'
  )
  assert.equal(sheet.getCell('B6').type, ExcelJS.ValueType.String)
  const nativeEntries = unzipSync(xlsx.bytes)
  const sheetXml = Buffer.from(
    nativeEntries['xl/worksheets/sheet1.xml']
  ).toString('utf8')
  const sharedStringsXml = Buffer.from(
    nativeEntries['xl/sharedStrings.xml']
  ).toString('utf8')
  assert.match(
    sheetXml,
    /<c\b(?=[^>]*r="B6")(?=[^>]*t="s")[^>]*>/,
    'Native OOXML stores 001.20 as a shared string, never a numeric cell'
  )
  assert.match(sharedStringsXml, /<t(?:\s[^>]*)?>001\.20<\/t>/)
  assert.match(
    sharedStringsXml,
    /_x000D_\n/,
    'Native OOXML preserves source CRLF through ST_Xstring escaping'
  )
  const policy = new Map(
    workbook
      .getWorksheet('口径')
      .getRows(3, 100)
      .filter((value) => value.getCell(1).value)
      .map((value) => [value.getCell(1).value, value.getCell(2).value])
  )
  assert.equal(policy.get('报表发布版'), 2)
  assert.equal(policy.get('来源发布版'), 3)
  assert.equal(policy.get('查询时区'), 'Asia/Shanghai')
  assert.equal(policy.get('查询日期结束（含）'), '2026-10-13')
  assert.equal(policy.get('数据截止时刻（UTC）'), input.dataCutoffAt)
  assert.equal(policy.get('导出记录数'), 2)

  const pdf = await generateReportExport('pdf', input)
  assert.equal(pdf.mimeType, 'application/pdf')
  const document = readPdf(pdf.bytes)
  assert.match(document.text, /授权记录明细/)
  assert.match(document.text, /中文记录，逗号,双引号"与/)
  assert.match(document.text, /下一行；括号（原样）/)
  assert.match(document.text, /受限/)
  assert.match(document.text, /2026-10-13T04:03:02\.125Z/)
  assert.match(document.text, /数据截止时刻/)
  assert.ok(document.pages >= 2)
  assert.match(document.source, /NotoSansCJKsc-Regular/)
  assert.doesNotMatch(
    document.source,
    /\/(?:JavaScript|OpenAction|Launch|EmbeddedFiles|URI)\b/
  )
  for (const output of [
    csv.bytes.toString('utf8'),
    ...Object.values(unzipSync(xlsx.bytes)).map((value) =>
      Buffer.from(value).toString('utf8')
    ),
    document.text,
  ]) {
    assert.doesNotMatch(output, /PRIVATE_SECRET|private-binding-id/)
  }
  const output = 'test-results/report-export-generators'
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(`${output}/sample.csv`, csv.bytes),
    writeFile(`${output}/sample.xlsx`, xlsx.bytes),
    writeFile(`${output}/sample.pdf`, pdf.bytes),
  ])
})

test('spreadsheet injection stays literal in headers and text without links or active formulas', async () => {
  const header = field(
    'payload',
    '\t =HYPERLINK("https://example.invalid","打开")'
  )
  const payloads = [
    '=1+1',
    ' +SUM(A1:A2)',
    '\t-1+2',
    '\r\n@SUM(1)',
    '\u0001=1+1',
    '\uFEFF=1+1',
    '普通文本_x0041_与_x0001_',
    { formula: '=1+1', hyperlink: 'https://example.invalid' },
  ]
  const input = snapshot({
    columns: [header],
    rows: payloads.map((value, index) => ({
      id: `private-${index}`,
      values: { [header.key]: value },
    })),
    total: payloads.length,
  })
  const csv = readCsv((await generateReportExport('csv', input)).bytes)
  assert.equal(csv[0][0], `'${header.label}`)
  payloads.forEach((value, index) =>
    assert.equal(
      csv[index + 1][0],
      index < 6
        ? `'${value}`
        : typeof value === 'string'
        ? value
        : JSON.stringify(value)
    )
  )
  const xlsx = await generateReportExport('xlsx', input)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(xlsx.bytes)
  const sheet = workbook.getWorksheet('记录')
  assert.equal(sheet.getCell('A4').value, header.label)
  payloads.forEach((value, index) => {
    const cell = sheet.getCell(`A${index + 5}`)
    assert.equal(cell.type, ExcelJS.ValueType.String)
    assert.equal(
      cell.value,
      typeof value === 'string' ? value : JSON.stringify(value)
    )
  })
  const xml = Object.values(unzipSync(xlsx.bytes))
    .map((value) => Buffer.from(value).toString('utf8'))
    .join('\n')
  assert.doesNotMatch(
    xml,
    /<f(?:\s|>)|<hyperlink(?:\s|>)|TargetMode="External"/
  )
})

test('internal v1 recipe preserves frozen bytes while v2 explains and preserves PostgreSQL timestamp precision', async () => {
  const frozenV1Hashes = {
    csv: 'cff36d7c0c5de0ba5e0ac12935345eed058a465fc73d0d4b22da18e36566d487',
    xlsx: '50dacf0d24b2e18548a91e05a3ed822acecc8073260614660dfde26c04958e9a',
    pdf: 'a5128c9c83f4aff5e617baf65c9aa3ca4aa5f57e542f3f57211df8732484f8fd',
  }
  const formats = ['csv', 'xlsx', 'pdf']
  const old = await Promise.all(
    formats.map((format) =>
      generateReportExport(format, snapshot({ producerVersion: 1 }))
    )
  )
  old.forEach((value, index) =>
    assert.equal(
      sha(value.bytes),
      frozenV1Hashes[formats[index]],
      'Explicit producer v1 retains the frozen missing-version recipe'
    )
  )
  const pgTimestamp = '2026-10-13T07:38:43.773908+00:00'
  const millisecondTimestamp = '2026-10-13T07:38:43.773+00:00'
  const input = snapshot({ producerVersion: 2 })
  input.rows[0].values[timeField.key] = pgTimestamp
  input.rows[1].values[timeField.key] = millisecondTimestamp
  const [csv, xlsx, pdf] = await Promise.all(
    formats.map((format) => generateReportExport(format, input))
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(xlsx.bytes)
  const sheet = workbook.getWorksheet('记录')
  assert.equal(sheet.getCell('E5').type, ExcelJS.ValueType.String)
  assert.equal(
    sheet.getCell('E5').value,
    pgTimestamp,
    'All six PostgreSQL fractional digits and the original offset survive'
  )
  assert.equal(sheet.getCell('E5').numFmt, '@')
  assert.equal(sheet.getCell('E6').type, ExcelJS.ValueType.Date)
  assert.equal(
    sheet.getCell('E6').value.toISOString(),
    '2026-10-13T15:38:43.773Z',
    'Millisecond datetime serial stores query-zone clock components'
  )
  assert.equal(sheet.getCell('E6').numFmt, 'yyyy-mm-dd hh:mm:ss.000')
  assert.deepEqual(
    sheet.getRow(4).values.slice(1),
    input.columns.map((column) => column.label)
  )
  assert.equal(sheet.rowCount, input.rows.length + 4)
  const entries = unzipSync(xlsx.bytes)
  const sheetXml = Buffer.from(entries['xl/worksheets/sheet1.xml']).toString(
    'utf8'
  )
  const sharedStringsXml = Buffer.from(
    entries['xl/sharedStrings.xml']
  ).toString('utf8')
  const stylesXml = Buffer.from(entries['xl/styles.xml']).toString('utf8')
  const pgCell = /<c\b(?=[^>]*r="E5")(?=[^>]*t="s")[^>]*>/.exec(sheetXml)
  assert.ok(
    pgCell,
    'Native OOXML stores the high-precision timestamp as a shared string'
  )
  const styleIndex = Number(/\bs="(\d+)"/.exec(pgCell[0])[1])
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)[1]
  const nativeStyle = Array.from(cellXfs.matchAll(/<xf\b[^>]*>/g))[
    styleIndex
  ][0]
  assert.match(
    nativeStyle,
    /\bnumFmtId="49"/,
    'Native OOXML uses built-in text format @'
  )
  assert.ok(sharedStringsXml.includes(pgTimestamp))
  assert.match(sheet.getCell('A2').value, /数值时间时区 Asia\/Shanghai/)
  assert.match(sheet.getCell('A2').value, /超过毫秒精度时间保留原始带偏移文本/)
  const policy = new Map(
    workbook
      .getWorksheet('口径')
      .getRows(3, 100)
      .filter((row) => row.getCell(1).value)
      .map((row) => [row.getCell(1).value, row.getCell(2).value])
  )
  assert.equal(policy.get('导出生成版本'), 2)
  assert.equal(policy.get('XLSX数值日期时间显示时区'), 'Asia/Shanghai')
  assert.match(
    policy.get('日期时间说明'),
    /可解析且不超过毫秒精度的日期时间按查询时区数值显示/
  )
  assert.match(
    policy.get('日期时间说明'),
    /超过毫秒精度的日期时间保留原始带偏移文本/
  )
  const csvRows = readCsv(csv.bytes)
  assert.equal(csvRows[1][4], pgTimestamp)
  assert.equal(csvRows[2][4], millisecondTimestamp)
  const document = readPdf(pdf.bytes)
  assert.ok(document.text.includes(pgTimestamp))
  assert.ok(document.text.includes(millisecondTimestamp))
  const producerLabel = document.lines.indexOf('导出生成版本')
  assert.ok(producerLabel >= 0)
  assert.equal(document.lines[producerLabel + 1], '2')
  await delay(2100)
  const repeated = await Promise.all(
    formats.map((format) => generateReportExport(format, input))
  )
  repeated.forEach((value, index) =>
    assert.equal(sha(value.bytes), sha([csv, xlsx, pdf][index].bytes))
  )
  await mkdir('test-results/report-export-generators', { recursive: true })
  await Promise.all([
    writeFile(
      'test-results/report-export-generators/producer-v2.csv',
      csv.bytes
    ),
    writeFile(
      'test-results/report-export-generators/producer-v2.xlsx',
      xlsx.bytes
    ),
    writeFile(
      'test-results/report-export-generators/producer-v2.pdf',
      pdf.bytes
    ),
  ])
})

test('PDF wraps long values, supports many columns and emits every row and page number', async () => {
  const columns = Array.from({ length: 12 }, (_, index) =>
    field(`entry${index}`, `字段${index + 1}`)
  )
  const long = '甲乙丙丁中文长文本'.repeat(190)
  const input = snapshot({
    columns,
    rows: Array.from({ length: 4 }, (_, row) => ({
      id: `private-long-${row}`,
      values: Object.fromEntries(
        columns.map((column, index) => [
          column.key,
          index === 0 ? `${long}尾部_${row}` : `唯一值_${row}_${index}`,
        ])
      ),
    })),
    total: 4,
  })
  const pdf = await generateReportExport('pdf', input)
  const document = readPdf(pdf.bytes)
  assert.ok(document.pages >= 5)
  const joined = document.lines
    .filter((line) => /^[甲乙丙丁中文长文本尾部_0-9]+$/.test(line))
    .join('')
  for (let row = 0; row < 4; row++) {
    assert.ok(
      joined.includes(`${long}尾部_${row}`),
      `The complete long source value for row ${row} is present`
    )
    for (let column = 1; column < 12; column++)
      assert.match(document.text, new RegExp(`唯一值_${row}_${column}\\b`))
  }
  for (let page = 1; page <= document.pages; page++)
    assert.match(document.text, new RegExp(`第 ${page} 页`))
  assert.doesNotMatch(document.text, /private-long-/)
  await mkdir('test-results/report-export-generators', { recursive: true })
  await writeFile(
    'test-results/report-export-generators/long-many-columns.pdf',
    pdf.bytes
  )
  const xlsx = await generateReportExport('xlsx', input)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(xlsx.bytes)
  assert.equal(
    workbook.getWorksheet('记录').getCell('A5').value,
    `${long}尾部_0`
  )
  assert.ok(workbook.getWorksheet('记录').getRow(5).height <= 409)
})

test('all formats are byte-identical across separated calls and preserve zero-record exports', async () => {
  const input = snapshot()
  const first = await Promise.all(
    ['csv', 'xlsx', 'pdf'].map((format) => generateReportExport(format, input))
  )
  await delay(2100)
  const second = await Promise.all(
    ['csv', 'xlsx', 'pdf'].map((format) => generateReportExport(format, input))
  )
  first.forEach((value, index) =>
    assert.equal(sha(value.bytes), sha(second[index].bytes))
  )
  const [utcHash, shanghaiHash] = await Promise.all([
    xlsxHashInTimezone('UTC', input),
    xlsxHashInTimezone('Asia/Shanghai', input),
  ])
  assert.equal(
    utcHash,
    shanghaiHash,
    'XLSX bytes do not depend on worker timezone'
  )
  const empty = snapshot({ rows: [], total: 0 })
  assert.equal(
    readCsv((await generateReportExport('csv', empty)).bytes).length,
    1
  )
  assert.match(
    readPdf((await generateReportExport('pdf', empty)).bytes).text,
    /无符合条件的授权记录/
  )
})

test('explicit bounds and unsupported glyph errors prevent silent truncation or replacement squares', async () => {
  const invalid = (patch, format, code) =>
    assert.rejects(
      () => generateReportExport(format, snapshot(patch)),
      (error) => error.name === 'DomainError' && error.businessCode === code
    )
  await invalid({ total: 3 }, 'csv', 'REPORT_EXPORT_SNAPSHOT_INVALID')
  await invalid(
    { producerVersion: 3 },
    'xlsx',
    'REPORT_EXPORT_PRODUCER_VERSION_INVALID'
  )
  await invalid(
    { producerVersion: null },
    'csv',
    'REPORT_EXPORT_PRODUCER_VERSION_INVALID'
  )
  await invalid(
    {
      rows: Array.from({ length: 2001 }, () => snapshot().rows[0]),
      total: 2001,
    },
    'csv',
    'REPORT_EXPORT_ROW_LIMIT'
  )
  await invalid(
    {
      columns: Array.from({ length: 51 }, (_, index) =>
        field(`entry${index}`, '字段')
      ),
    },
    'xlsx',
    'REPORT_EXPORT_COLUMN_LIMIT'
  )
  await invalid(
    {
      rows: [{ id: 'private', values: { [textField.key]: 'a'.repeat(2001) } }],
      total: 1,
    },
    'csv',
    'REPORT_EXPORT_TEXT_LIMIT'
  )
  await invalid(
    {
      rows: [{ id: 'private', values: { [textField.key]: '\ud800' } }],
      total: 1,
    },
    'pdf',
    'REPORT_EXPORT_TEXT_INVALID'
  )
  await invalid(
    {
      rows: [{ id: 'private', values: { [textField.key]: '中文🧑' } }],
      total: 1,
    },
    'pdf',
    'REPORT_EXPORT_GLYPH_UNSUPPORTED'
  )
  await invalid(
    {
      columns: [textField],
      rows: [{ id: 'private', values: { [textField.key]: '\n'.repeat(100) } }],
      total: 1,
    },
    'xlsx',
    'REPORT_EXPORT_LAYOUT_LIMIT'
  )
  const columns = Array.from({ length: 50 }, (_, index) =>
    field(`entry${index}`, '字段')
  )
  const values = Object.fromEntries(
    columns.map((column) => [column.key, '中'.repeat(2000)])
  )
  await invalid(
    {
      columns,
      rows: Array.from({ length: 40 }, (_, index) => ({
        id: `private-${index}`,
        values,
      })),
      total: 40,
    },
    'csv',
    'REPORT_EXPORT_SIZE_LIMIT'
  )
  // Unauthorized raw values are neither emitted nor consulted for glyph/length failures.
  const hidden = snapshot({
    columns: [textField],
    rows: [
      {
        id: 'private',
        values: { [textField.key]: '🧑'.repeat(2001) },
        hiddenFieldKeys: [textField.key],
      },
    ],
    total: 1,
  })
  assert.match(
    readPdf((await generateReportExport('pdf', hidden)).bytes).text,
    /受限/
  )
})

test('format capabilities verify the shipped PDF font and refuse damaged or partial fonts', async (context) => {
  assert.deepEqual(await reportExportFormatAvailable('csv'), {
    available: true,
    reason: null,
  })
  assert.deepEqual(await reportExportFormatAvailable('xlsx'), {
    available: true,
    reason: null,
  })
  assert.deepEqual(await reportExportFormatAvailable('pdf'), {
    available: true,
    reason: null,
  })
  const fs = await import('node:fs/promises')
  const realStat = fs.default.stat
  const realRead = fs.default.readFile
  let partial = false
  const statMock = context.mock.method(fs.default, 'stat', async (...args) => {
    const info = await realStat(...args)
    return new Proxy(info, {
      get(target, property) {
        if (property === 'mtimeMs') return target.mtimeMs + 1000
        if (property === 'size' && partial) return 1
        return Reflect.get(target, property)
      },
    })
  })
  const readMock = context.mock.method(
    fs.default,
    'readFile',
    async (path, ...args) =>
      String(path).endsWith('NotoSansCJKsc-Regular.otf')
        ? Buffer.alloc(16437364)
        : realRead(path, ...args)
  )
  const unavailable = await reportExportFormatAvailable('pdf')
  assert.equal(unavailable.available, false)
  assert.match(unavailable.reason, /完整性校验/)
  await assert.rejects(
    () => generateReportExport('pdf', snapshot()),
    (error) =>
      error.name === 'DomainError' &&
      error.businessCode === 'REPORT_EXPORT_FONT_UNAVAILABLE'
  )
  partial = true
  assert.equal(
    (await reportExportFormatAvailable('pdf')).available,
    false,
    'A partially downloaded font is unavailable before parsing'
  )
  readMock.mock.restore()
  statMock.mock.restore()
  assert.deepEqual(await reportExportFormatAvailable('pdf'), {
    available: true,
    reason: null,
  })
})
