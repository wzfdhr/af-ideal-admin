import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import { createRequire } from 'node:module'

const PDFDocument = createRequire(import.meta.url)('pdfkit')
import { unzipSync, unzlibSync } from 'fflate'
import contracts from '@af-admin/contracts'

const { default: generator } = await import(
  process.env.AUDIT_EXPORT_GENERATOR_MODULE ||
    new URL(
      '../../services/reference-api/dist/audit-export-generators.js',
      import.meta.url
    ).href
)
const { generateAuditExport, auditExportFormatAvailable } = generator
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fact = (id = 'fact-1', patch = {}) => ({
  id,
  source: 'server',
  projectionVersion: 1,
  module: 'report-export',
  action: 'report-export.created',
  eventType: 'export',
  result: 'success',
  operator: { id: 'reader-1', name: '张三，逗号,双引号"与\r\n下一行' },
  target: { type: 'report-export', id: 'job-1' },
  occurredAt: '2026-10-13T04:03:02.125Z',
  traceId: `trace-${id}`,
  detail: {
    definitionVersionId: 'definition-v1',
    format: 'csv',
    attempt: 0,
    archived: false,
  },
  visibleFields: ['operator.id', 'operator.name'],
  hiddenFields: [],
  ...patch,
})
const snapshot = (patch = {}) => ({
  version: 1,
  producerVersion: 1,
  projectionVersion: 1,
  source: 'server',
  query: contracts.parseAuditQuery({
    timeZone: 'America/New_York',
    from: '2026-10-01',
    to: '2026-10-13',
    current: 4,
    pageSize: 20,
  }),
  queriedAt: '2026-10-14T00:00:00.000Z',
  dataCutoffAt: '2026-10-14T00:00:00.000Z',
  rows: [
    fact(),
    fact('fact-2', {
      module: 'future-module',
      action: 'future-action',
      eventType: 'operation',
      operator: { id: null, name: null },
      target: { type: 'resource', id: null },
      detail: {},
      visibleFields: [],
      hiddenFields: ['operator.id', 'operator.name'],
    }),
  ],
  total: 2,
  ...patch,
})
const invalid = async (value, code = undefined, format = 'csv') =>
  assert.rejects(
    () => generateAuditExport(format, value),
    (error) =>
      error.name === 'DomainError' &&
      (code === undefined || error.businessCode === code)
  )

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

test('real CSV has BOM/RFC4180 facts, explicit timezone and restricted cells, retaining zero and false', async () => {
  const input = snapshot(),
    result = await generateAuditExport('csv', input)
  assert.equal(result.mimeType, 'text/csv; charset=utf-8')
  assert.match(result.fileName, /^audit-v1-[a-f0-9]{16}\.csv$/)
  assert.deepEqual([...result.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf])
  const rows = readCsv(result.bytes),
    headers = rows[0]
  assert.equal(rows.length, 3)
  assert.equal(headers.length, 17)
  assert.equal(
    rows[1][headers.indexOf('事实时间（UTC原始ISO）')],
    input.rows[0].occurredAt
  )
  assert.equal(
    rows[1][headers.indexOf('事实时间（查询时区）')],
    '2026-10-13 00:03:02.125'
  )
  assert.equal(rows[1][headers.indexOf('查询时区')], 'America/New_York')
  assert.equal(
    rows[1][headers.indexOf('操作者姓名')],
    input.rows[0].operator.name
  )
  assert.equal(rows[2][headers.indexOf('操作者姓名')], '受限')
  assert.equal(rows[2][headers.indexOf('操作者ID')], '受限')
  assert.equal(rows[2][headers.indexOf('对象ID')], '受限')
  assert.equal(rows[2][headers.indexOf('操作者角色')], '未提供')
  const detail = JSON.parse(rows[1][headers.indexOf('受控详情')])
  assert.equal(detail.attempt, 0)
  assert.equal(detail.archived, false)
  assert.equal(
    headers.some((header) => header.includes('报表名称')),
    false
  )
  assert.ok(result.bytes.length <= contracts.AUDIT_EXPORT_MAX_FILE_BYTES)
})

test('CSV formula neutralization survives Unicode whitespace and Excel cells remain literal without formulas or links', async () => {
  const attacks = [
    '=SUM(1,2)',
    '+1+2',
    '-1+2',
    '@SUM(1)',
    '\t=HYPERLINK("x")',
    '\uFEFF  =1',
    '\u200B@cmd',
  ]
  const input = snapshot({
    rows: attacks.map((name, index) =>
      fact(`formula-${index}`, { operator: { id: 'reader-1', name } })
    ),
    total: attacks.length,
  })
  const csv = readCsv((await generateAuditExport('csv', input)).bytes)
  attacks.forEach((name, index) =>
    assert.equal(csv[index + 1][csv[0].indexOf('操作者姓名')], `'${name}`)
  )
  const xlsx = await generateAuditExport('xlsx', input),
    workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(xlsx.bytes)
  const sheet = workbook.getWorksheet('审计事实')
  attacks.forEach((name, index) => {
    assert.equal(sheet.getRow(index + 2).getCell(10).value, name)
    assert.equal(sheet.getRow(index + 2).getCell(10).formula, undefined)
  })
  const entries = unzipSync(xlsx.bytes)
  Object.entries(entries)
    .filter(([name]) => name.startsWith('xl/worksheets/'))
    .forEach(([, bytes]) => {
      assert.doesNotMatch(Buffer.from(bytes).toString(), /<f(?:\s|>)/)
      assert.doesNotMatch(Buffer.from(bytes).toString(), /<hyperlink(?:\s|>)/)
    })
})

test('XLSX reopens with numeric projection/count metadata, zoned typed dates and exact UTC source text', async () => {
  const input = snapshot(),
    result = await generateAuditExport('xlsx', input),
    workbook = new ExcelJS.Workbook()
  assert.equal(
    result.mimeType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  await workbook.xlsx.load(result.bytes)
  const sheet = workbook.getWorksheet('审计事实'),
    policy = workbook.getWorksheet('查询口径')
  assert.equal(sheet.rowCount, 3)
  assert.equal(sheet.getCell('B2').value, input.rows[0].occurredAt)
  assert.ok(sheet.getCell('C2').value instanceof Date)
  assert.equal(
    sheet.getCell('C2').value.toISOString(),
    '2026-10-13T00:03:02.125Z'
  )
  assert.equal(sheet.getCell('D2').value, input.query.timeZone)
  assert.equal(sheet.getCell('P2').value, 1)
  assert.deepEqual(JSON.parse(sheet.getCell('Q2').value), input.rows[0].detail)
  assert.equal(sheet.getCell('I3').value, '受限')
  const count = [...policy.getColumn(1).values].findIndex(
    (value) => value === '实际导出事实数'
  )
  assert.equal(policy.getRow(count).getCell(2).value, 2)
  assert.equal(policy.getRow(count).getCell(2).type, ExcelJS.ValueType.Number)
  assert.equal(sheet.views[0].state, 'frozen')
  assert.equal(sheet.pageSetup.printTitlesRow, '1:1')
  assert.ok(result.bytes.length <= contracts.AUDIT_EXPORT_MAX_FILE_BYTES)
})

test('PDF embeds CJK, emits every fact and raw time, and paginates long field values without silent clipping', async () => {
  const rows = Array.from({ length: 12 }, (_, index) =>
    fact(`pdf-${index}`, {
      operator: {
        id: 'reader-1',
        name: `审计人员${index}${'甲乙丙丁'.repeat(25)}尾部_${index}`,
      },
    })
  )
  const input = snapshot({ rows, total: rows.length }),
    result = await generateAuditExport('pdf', input),
    document = readPdf(result.bytes)
  assert.equal(result.mimeType, 'application/pdf')
  assert.ok(document.pages >= 2)
  assert.match(document.text, /授权审计事实/)
  assert.match(document.text, /审计查询口径与来源/)
  assert.match(document.text, /America\/New_York/)
  assert.match(document.text, /2026-10-13T04:03:02.125Z/)
  rows.forEach((row) =>
    assert.ok(document.text.includes(row.id), `Missing fact ${row.id}`)
  )
  const completeNames = document.lines
    .filter((line) => /^[审计人员甲乙丙丁尾部_0-9]+$/.test(line))
    .join('')
  rows.forEach((row) =>
    assert.ok(
      completeNames.includes(row.operator.name),
      'Wrapped CJK value must survive every continuation in full'
    )
  )
  assert.ok(document.text.includes('"attempt":0'))
  assert.ok(document.text.includes('"archived":false'))
  for (let page = 1; page <= document.pages; page += 1)
    assert.ok(document.text.includes(`第 ${page} 页`))
  assert.ok(result.bytes.length <= contracts.AUDIT_EXPORT_MAX_FILE_BYTES)
})

test('all formats render a genuine empty result without inventing rows or dropping numeric zero', async () => {
  const input = snapshot({ rows: [], total: 0 })
  assert.equal(
    readCsv((await generateAuditExport('csv', input)).bytes).length,
    1
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load((await generateAuditExport('xlsx', input)).bytes)
  assert.equal(workbook.getWorksheet('审计事实').rowCount, 1)
  const policy = workbook.getWorksheet('查询口径')
  const position = [...policy.getColumn(1).values].findIndex(
    (value) => value === '匹配事实数'
  )
  assert.equal(policy.getRow(position).getCell(2).value, 0)
  const pdf = readPdf((await generateAuditExport('pdf', input)).bytes)
  assert.ok(pdf.text.includes('无符合条件的授权审计事实'))
})

test('generation is byte-deterministic, query/payload key order independent, and never mutates caller objects', async () => {
  const input = snapshot(),
    before = structuredClone(input)
  for (const format of ['csv', 'xlsx', 'pdf']) {
    const first = await generateAuditExport(format, input),
      second = await generateAuditExport(format, input)
    assert.equal(sha(first.bytes), sha(second.bytes), `${format} bytes changed`)
    assert.equal(first.fileName, second.fileName)
  }
  assert.deepEqual(input, before)
  const shuffled = snapshot()
  shuffled.rows[0].detail = Object.fromEntries(
    Object.entries(shuffled.rows[0].detail).reverse()
  )
  assert.equal(
    sha((await generateAuditExport('csv', shuffled)).bytes),
    sha((await generateAuditExport('csv', input)).bytes)
  )
  const future = generateAuditExport('pdf', input)
  input.rows[0].operator.name = 'SECRET_AFTER_VALIDATION'
  assert.equal(
    readPdf((await future).bytes).text.includes('SECRET_AFTER_VALIDATION'),
    false
  )
})

test('source/version/producer/projection, exact timestamps and malformed timezone snapshots are rejected', async () => {
  for (const patch of [
    { version: 2 },
    { producerVersion: 2 },
    { producerVersion: undefined },
    { projectionVersion: 2 },
    { source: 'browser' },
    { queriedAt: '2026-10-14' },
    { queriedAt: '2026-02-29T00:00:00.000Z' },
    { dataCutoffAt: '2026-10-15T00:00:00.000Z' },
  ])
    await invalid(snapshot(patch))
  for (const patch of [
    { source: 'browser' },
    { projectionVersion: 2 },
    { occurredAt: '2026-10-13T04:03:02+00:00' },
    { occurredAt: '2026-10-13T04:03:02.123456Z' },
    { eventType: 'invented' },
    { result: 'partial' },
  ])
    await invalid(snapshot({ rows: [fact('invalid', patch)], total: 1 }))
  await invalid(
    snapshot({ query: { ...snapshot().query, timeZone: '+08:00' } })
  )
  await invalid(snapshot({ query: { ...snapshot().query, current: '1' } }))
  await invalid(snapshot({ query: { ...snapshot().query, now: '2026-01-01' } }))
})

test('rows must be complete and unique, bounded at 2000 and within canonical UTF8 2MiB', async () => {
  await invalid(snapshot({ total: 1 }), 'AUDIT_EXPORT_CAPTURE_INCOMPLETE')
  await invalid(snapshot({ rows: [fact(), fact()] }))
  await invalid(
    snapshot({
      rows: Array.from({ length: 2001 }, (_, index) =>
        fact(`too-many-${index}`)
      ),
      total: 2001,
    }),
    'AUDIT_EXPORT_ROW_LIMIT'
  )
  const large = Array.from({ length: 1800 }, (_, index) =>
    fact(`large-${index}`, {
      module: 'future-module',
      action: 'a'.repeat(256),
      detail: {},
      operator: {
        id: 'reader-1',
        name: '汉'.repeat(100),
        role: '角'.repeat(100),
      },
      visibleFields: ['operator.id', 'operator.name', 'operator.role'],
    })
  )
  await invalid(
    snapshot({ rows: large, total: large.length }),
    'AUDIT_EXPORT_SNAPSHOT_TOO_LARGE'
  )
  const maxRows = Array.from({ length: 2000 }, (_, index) =>
    fact(`bounded-${index}`, { detail: {}, operator: { id: 'r', name: 'n' } })
  )
  assert.equal(
    readCsv(
      (
        await generateAuditExport(
          'csv',
          snapshot({ rows: maxRows, total: 2000 })
        )
      ).bytes
    ).length,
    2001
  )
})

test('nested/private/unregistered detail, illegal scalar types and hidden raw values fail before output', async () => {
  for (const detail of [
    { reason: 'private' },
    { password: 'private' },
    { sha256: '0'.repeat(64) },
    { total: 999 },
    { format: { value: 'csv' } },
    { attempt: Infinity },
    { attempt: -1 },
    { archived: 'false' },
    { code: ['SECRET'] },
  ])
    await invalid(
      snapshot({ rows: [fact('bad-detail', { detail })], total: 1 })
    )
  await invalid(
    snapshot({
      rows: [
        fact('hidden', {
          operator: { id: 'reader-1', name: 'SECRET_RAW_VALUE' },
          visibleFields: ['operator.id'],
          hiddenFields: ['operator.name'],
        }),
      ],
      total: 1,
    })
  )
  await invalid(
    snapshot({
      rows: [fact('missing-mask', { visibleFields: ['operator.id'] })],
      total: 1,
    })
  )
  await invalid(
    snapshot({
      rows: [fact('duplicate-mask', { hiddenFields: ['operator.id'] })],
      total: 1,
    })
  )
  await invalid(snapshot({ rawRows: [{ private: 'data' }] }))
})

test('Unicode surrogate, overlong UTF8 fields, sparse arrays, accessors and prototype payloads are rejected without executing code', async () => {
  await invalid(
    snapshot({
      rows: [fact('unicode', { operator: { id: 'reader-1', name: '\ud800' } })],
      total: 1,
    }),
    'AUDIT_EXPORT_TEXT_INVALID'
  )
  await invalid(
    snapshot({
      rows: [
        fact('bytes', { operator: { id: 'reader-1', name: '汉'.repeat(134) } }),
      ],
      total: 1,
    })
  )
  const sparse = []
  sparse.length = 2
  sparse[1] = fact()
  await invalid(snapshot({ rows: sparse }))
  await invalid(Object.assign(Object.create({ source: 'server' }), snapshot()))
  const accessor = snapshot()
  Object.defineProperty(accessor.rows[0], 'detail', {
    get() {
      throw new Error('Getter must not run')
    },
  })
  await invalid(accessor)
  const symbols = snapshot()
  symbols[Symbol('private')] = 'secret'
  await invalid(symbols)
  await invalid(
    snapshot({
      rows: [
        fact('foreign-role', {
          operator: {
            id: 'reader-1',
            name: 'Name',
            role: 'future-custom-role',
          },
        }),
      ],
      total: 1,
    })
  )
  const role = snapshot({
    rows: [
      fact('future-role', {
        operator: { id: 'reader-1', name: 'Name', role: 'future-custom-role' },
        visibleFields: ['operator.id', 'operator.name', 'operator.role'],
      }),
    ],
    total: 1,
  })
  assert.ok(
    readCsv((await generateAuditExport('csv', role)).bytes)[1].includes(
      'future-custom-role'
    )
  )
})

test('PDF capabilities verify both licensed font assets and reject missing, partial or corrupt bytes', async (context) => {
  assert.deepEqual(await auditExportFormatAvailable('csv'), {
    available: true,
    reason: null,
  })
  assert.deepEqual(await auditExportFormatAvailable('xlsx'), {
    available: true,
    reason: null,
  })
  assert.deepEqual(await auditExportFormatAvailable('pdf'), {
    available: true,
    reason: null,
  })
  const fs = await import('node:fs/promises'),
    read = fs.default.readFile,
    stat = fs.default.stat
  let mode = 'missing-font'
  const mockedStat = context.mock.method(
    fs.default,
    'stat',
    async (...args) => {
      const path = String(args[0])
      if (
        (mode === 'missing-font' && path.endsWith('.otf')) ||
        (mode === 'missing-license' && path.endsWith('LICENSE.NotoSansCJK'))
      )
        throw new Error('Controlled asset absence')
      const original = await stat(...args)
      return new Proxy(original, {
        get(target, key) {
          if (key === 'mtimeMs') return target.mtimeMs + 2000
          if (
            key === 'size' &&
            mode === 'partial-font' &&
            path.endsWith('.otf')
          )
            return 1
          return Reflect.get(target, key)
        },
      })
    }
  )
  const mockedRead = context.mock.method(
    fs.default,
    'readFile',
    async (path, ...args) => {
      if (mode === 'corrupt-font' && String(path).endsWith('.otf'))
        return Buffer.alloc(16437364)
      if (
        mode === 'corrupt-license' &&
        String(path).endsWith('LICENSE.NotoSansCJK')
      )
        return Buffer.alloc(4301)
      return read(path, ...args)
    }
  )
  try {
    for (mode of [
      'missing-font',
      'missing-license',
      'partial-font',
      'corrupt-font',
      'corrupt-license',
    ]) {
      assert.equal(
        (await auditExportFormatAvailable('pdf')).available,
        false,
        mode
      )
      await invalid(snapshot(), 'AUDIT_EXPORT_FONT_UNAVAILABLE', 'pdf')
      assert.equal((await auditExportFormatAvailable('csv')).available, true)
    }
  } finally {
    mockedRead.mock.restore()
    mockedStat.mock.restore()
  }
  assert.deepEqual(await auditExportFormatAvailable('pdf'), {
    available: true,
    reason: null,
  })
})

test('the XLSX timestamp recipe remains byte-identical across host timezones', async () => {
  const renderIn = (zone) =>
    new Promise((resolve, reject) => {
      const script = `const {createHash}=require('node:crypto');
      const {generateAuditExport}=require(process.env.AUDIT_EXPORT_GENERATOR_MODULE || './services/reference-api/dist/audit-export-generators.js');
      let body='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>body+=chunk);
      process.stdin.on('end',async()=>{try{const result=await generateAuditExport('xlsx',JSON.parse(body));process.stdout.write(createHash('sha256').update(result.bytes).digest('hex'))}catch{process.stderr.write('Isolated renderer failed');process.exitCode=1}});`
      const child = spawn(process.execPath, ['-e', script], {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        env: { ...process.env, TZ: zone },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let output = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('Isolated renderer timed out'))
      }, 10000)
      child.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })
      child.stderr.resume()
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (code === 0 && /^[a-f0-9]{64}$/.test(output)) resolve(output)
        else reject(new Error('Isolated renderer did not produce a digest'))
      })
      child.stdin.end(JSON.stringify(snapshot()))
    })
  assert.equal(
    await renderIn('Pacific/Auckland'),
    await renderIn('America/Los_Angeles')
  )
})

test('PDF stream size failure aborts before any oversized file can be returned', async (context) => {
  const originalEmit = PDFDocument.prototype.emit
  let injected = false
  const fault = context.mock.method(
    PDFDocument.prototype,
    'emit',
    function emit(name, ...args) {
      if (name === 'data' && !injected) {
        injected = true
        return Reflect.apply(originalEmit, this, [
          name,
          Buffer.alloc(contracts.AUDIT_EXPORT_MAX_FILE_BYTES + 1),
        ])
      }
      return Reflect.apply(originalEmit, this, [name, ...args])
    }
  )
  try {
    await invalid(snapshot(), 'AUDIT_EXPORT_SIZE_LIMIT', 'pdf')
    assert.equal(injected, true)
  } finally {
    fault.mock.restore()
  }
  assert.ok(
    (await generateAuditExport('pdf', snapshot())).bytes.length <
      contracts.AUDIT_EXPORT_MAX_FILE_BYTES
  )
})

test('legitimate base64url leading dash and underscore opaque fact, actor, target and trace IDs survive all real formats', async () => {
  const rows = ['-', '_'].map((prefix, index) =>
    fact(`${prefix}auth_fact_${index}`, {
      module: 'auth',
      action: 'login',
      eventType: 'security',
      detail: {},
      operator: { id: `${prefix}actor_${index}`, name: '实际身份事件' },
      target: { type: 'session', id: `${prefix}target_${index}` },
      traceId: `${prefix}trace_${index}`,
    })
  )
  const input = snapshot({ rows, total: rows.length })
  const csv = readCsv((await generateAuditExport('csv', input)).bytes)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load((await generateAuditExport('xlsx', input)).bytes)
  const pdf = readPdf((await generateAuditExport('pdf', input)).bytes)
  rows.forEach((row, index) => {
    // Leading '-' is an allowed identifier and is still neutralized for CSV formula consumers.
    assert.equal(
      csv[index + 1][0],
      row.id.startsWith('-') ? `'${row.id}` : row.id
    )
    assert.equal(
      workbook.getWorksheet('审计事实').getCell(index + 2, 1).value,
      row.id
    )
    assert.ok(pdf.text.includes(row.id))
    assert.ok(pdf.text.includes(row.operator.id))
    assert.ok(pdf.text.includes(row.target.id))
    assert.ok(pdf.text.includes(row.traceId))
  })
  for (const id of [
    '__proto__',
    'constructor',
    'prototype',
    '-path/escape',
    '_x;SELECT',
    `_${'a'.repeat(100)}`,
  ])
    await invalid(snapshot({ rows: [fact(id)], total: 1 }))
  await invalid(
    snapshot({
      rows: [
        fact('_valid', {
          target: { type: '_unregistered-type', id: '_valid-target' },
        }),
      ],
      total: 1,
    })
  )
})
