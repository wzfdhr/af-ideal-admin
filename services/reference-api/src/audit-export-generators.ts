import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { setImmediate as yieldToStream } from 'node:timers/promises'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { create as createFont } from 'fontkit'
import { unzipSync, zipSync } from 'fflate'
import {
  DomainError,
  AUDIT_EVENT_TYPES,
  AUDIT_RESULTS,
  AUDIT_ACTOR_FIELDS,
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_EXPORT_MAX_SNAPSHOT_BYTES,
  AUDIT_EXPORT_MAX_FILE_BYTES,
  parseAuditQuery,
} from '@af-admin/contracts'
import { projectAuditDetail } from './audit-policy'
import type {
  AuditExportFormat,
  AuditExportSnapshotV1,
  AuditEventRecordV1,
} from '@af-admin/contracts'
import type { Font } from 'fontkit'
import type { Zippable } from 'fflate'

type Cell = string | number | boolean
const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z')
const RESTRICTED = '受限'
const FONT_DIRECTORY = join(__dirname, '..', 'assets', 'fonts')
const FONT_FILE = 'NotoSansCJKsc-Regular.otf'
const LICENSE_FILE = 'LICENSE.NotoSansCJK'
const FONT_BYTES = 16437364
const FONT_SHA =
  '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b'
const LICENSE_BYTES = 4301
const LICENSE_SHA =
  '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'
const TEXT_FEATURES = { liga: false, kern: false } as unknown as NonNullable<
  PDFKit.Mixins.TextOptions['features']
>
const fail = (code: string, message: string): never => {
  throw new DomainError(422, code, message)
}
const malformed = (): never =>
  fail('AUDIT_EXPORT_SNAPSHOT_INVALID', '审计导出快照结构、版本或权限投影无效')
const object = (input: unknown, keys: readonly string[]) => {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return malformed()
  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return malformed()
  Reflect.ownKeys(input).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (
      typeof key !== 'string' ||
      !keys.includes(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      malformed()
  })
  return input as Record<string, unknown>
}
const array = (input: unknown, limit: number): unknown[] => {
  if (!Array.isArray(input) || input.length > limit) return malformed()
  if (Object.getPrototypeOf(input) !== Array.prototype) return malformed()
  Reflect.ownKeys(input).forEach((key) => {
    if (key === 'length') return
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (
      typeof key !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= input.length ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      malformed()
  })
  if (
    !Array.from({ length: input.length }, (_, index) =>
      Object.hasOwn(input, index)
    ).every(Boolean)
  )
    return malformed()
  return input
}
const boundedText = (input: unknown, maxBytes = 512): string => {
  if (typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > maxBytes)
    return malformed()
  if (
    Array.from(input).some((character) => {
      const code = character.codePointAt(0) ?? 0
      return (
        (code >= 0xd800 && code <= 0xdfff) ||
        (code < 32 && ![9, 10, 13].includes(code)) ||
        (code >= 127 && code <= 159)
      )
    })
  )
    fail('AUDIT_EXPORT_TEXT_INVALID', '审计导出文本包含无效Unicode或控制字符')
  return input
}
const identifier = (value: unknown) => {
  const output = boundedText(value, 100)
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(output)) malformed()
  return output
}
const iso = (value: unknown) => {
  const output = boundedText(value, 24)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(output) ||
    !Number.isFinite(Date.parse(output)) ||
    new Date(output).toISOString() !== output ||
    output < '1900-01-01' ||
    output > '2200-12-31T23:59:59.999Z'
  )
    malformed()
  return output
}
const canonical = (value: unknown): string => {
  const ordered = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(ordered)
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, ordered((item as Record<string, unknown>)[key])])
      )
    return item
  }
  return JSON.stringify(ordered(value))
}
const validate = (input: AuditExportSnapshotV1): AuditExportSnapshotV1 => {
  const snapshot = object(input, [
    'version',
    'producerVersion',
    'projectionVersion',
    'source',
    'query',
    'queriedAt',
    'dataCutoffAt',
    'rows',
    'total',
  ])
  if (
    snapshot.version !== 1 ||
    snapshot.producerVersion !== 1 ||
    snapshot.projectionVersion !== 1 ||
    snapshot.source !== 'server'
  )
    malformed()
  const queryInput = object(snapshot.query, [
    'version',
    'current',
    'pageSize',
    'module',
    'eventType',
    'result',
    'operatorName',
    'targetId',
    'traceId',
    'from',
    'to',
    'timeZone',
  ])
  const query = parseAuditQuery(queryInput)
  Object.values(query).forEach((value) => {
    if (typeof value === 'string') boundedText(value)
  })
  if (canonical(query) !== canonical(queryInput)) malformed()
  const queriedAt = iso(snapshot.queriedAt)
  const cutoff = iso(snapshot.dataCutoffAt)
  if (cutoff > queriedAt) malformed()
  if (
    !Array.isArray(snapshot.rows) ||
    snapshot.rows.length > AUDIT_EXPORT_MAX_ROWS
  )
    fail('AUDIT_EXPORT_ROW_LIMIT', '完整审计导出最多支持2000条事实')
  const rows = array(snapshot.rows, AUDIT_EXPORT_MAX_ROWS)
  if (!Number.isSafeInteger(snapshot.total) || snapshot.total !== rows.length)
    fail(
      'AUDIT_EXPORT_CAPTURE_INCOMPLETE',
      '审计导出必须包含完整匹配事实，不允许截断'
    )
  const ids = new Set<string>()
  rows.forEach((inputRow) => {
    const row = object(inputRow, [
      'id',
      'source',
      'projectionVersion',
      'module',
      'action',
      'eventType',
      'result',
      'operator',
      'target',
      'occurredAt',
      'traceId',
      'detail',
      'visibleFields',
      'hiddenFields',
    ])
    const id = identifier(row.id)
    if (ids.has(id)) malformed()
    ids.add(id)
    if (
      row.source !== 'server' ||
      row.projectionVersion !== 1 ||
      !AUDIT_EVENT_TYPES.includes(row.eventType as never) ||
      !AUDIT_RESULTS.includes(row.result as never)
    )
      malformed()
    boundedText(row.module, 64)
    boundedText(row.action, 256)
    identifier(row.traceId)
    iso(row.occurredAt)
    const operator = object(row.operator, ['id', 'name', 'role'])
    const visible = array(row.visibleFields, AUDIT_ACTOR_FIELDS.length)
    const hidden = array(row.hiddenFields, AUDIT_ACTOR_FIELDS.length)
    const fields = [...visible, ...hidden]
    if (
      new Set(fields).size !== fields.length ||
      fields.some((field) => !AUDIT_ACTOR_FIELDS.includes(field as never))
    )
      malformed()
    ;(['id', 'name', 'role'] as const).forEach((key) => {
      const field = `operator.${key}`
      if (key === 'role' && !Object.hasOwn(operator, key)) {
        if (fields.includes(field)) malformed()
        return
      }
      if (!fields.includes(field)) malformed()
      if (hidden.includes(field)) {
        if (operator[key] !== null) malformed()
      } else if (operator[key] === null) malformed()
      else if (key === 'id') identifier(operator[key])
      else boundedText(operator[key], 400)
    })
    const target = object(row.target, ['type', 'id'])
    identifier(target.type)
    if (target.id !== null) identifier(target.id)
    const rawDetail = row.detail
    if (!rawDetail || typeof rawDetail !== 'object' || Array.isArray(rawDetail))
      malformed()
    const detail = object(rawDetail, Object.keys(rawDetail as object))
    if (Object.keys(detail).length > 20) malformed()
    Object.entries(detail).forEach(([key, value]) => {
      boundedText(key, 64)
      if (typeof value === 'string') boundedText(value, 512)
      else if (
        value !== null &&
        typeof value !== 'boolean' &&
        !(typeof value === 'number' && Number.isFinite(value))
      )
        malformed()
    })
    if (
      canonical(
        projectAuditDetail(String(row.module), String(row.action), detail)
      ) !== canonical(detail)
    )
      fail('AUDIT_EXPORT_DETAIL_INVALID', '审计详情不属于登记的受控事实字段')
  })
  const bytes = canonical(snapshot)
  if (Buffer.byteLength(bytes, 'utf8') > AUDIT_EXPORT_MAX_SNAPSHOT_BYTES)
    fail(
      'AUDIT_EXPORT_SNAPSHOT_TOO_LARGE',
      '审计导出快照超过2MiB，请缩小查询范围'
    )
  // Own the validated bytes before the first asynchronous operation so callers
  // cannot change rows or masking while font or ZIP generation is pending.
  return JSON.parse(bytes) as AuditExportSnapshotV1
}
const bounded = (bytes: Buffer) => {
  if (bytes.length > AUDIT_EXPORT_MAX_FILE_BYTES)
    fail('AUDIT_EXPORT_SIZE_LIMIT', '审计导出文件超过10MiB，请缩小查询范围')
  return bytes
}
const zoned = (date: string, timeZone: string): Date => {
  const parts = new Map(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      calendar: 'gregory',
      numberingSystem: 'latn',
    })
      .formatToParts(new Date(date))
      .map((part) => [part.type, part.value])
  )
  return new Date(
    Date.UTC(
      Number(parts.get('year')),
      Number(parts.get('month')) - 1,
      Number(parts.get('day')),
      Number(parts.get('hour')),
      Number(parts.get('minute')),
      Number(parts.get('second')),
      new Date(date).getUTCMilliseconds()
    )
  )
}
const columns = [
  '事实ID',
  '事实时间（UTC原始ISO）',
  '事实时间（查询时区）',
  '查询时区',
  '模块',
  '动作',
  '事件类型',
  '结果',
  '操作者ID',
  '操作者姓名',
  '操作者角色',
  '对象类型',
  '对象ID',
  '追踪ID',
  '事实来源',
  '投影版本',
  '受控详情',
]
const factCells = (
  row: AuditEventRecordV1,
  snapshot: AuditExportSnapshotV1
): Cell[] => [
  row.id,
  row.occurredAt,
  zoned(row.occurredAt, snapshot.query.timeZone)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', ''),
  snapshot.query.timeZone,
  row.module,
  row.action,
  row.eventType,
  row.result,
  row.operator.id ?? RESTRICTED,
  row.operator.name ?? RESTRICTED,
  row.operator.role === undefined ? '未提供' : row.operator.role ?? RESTRICTED,
  row.target.type,
  row.target.id ?? RESTRICTED,
  row.traceId,
  row.source,
  row.projectionVersion,
  canonical(row.detail),
]
const metadata = (snapshot: AuditExportSnapshotV1): [string, Cell][] => [
  ['导出名称', '授权审计事实'],
  ['事实来源', 'server'],
  ['生成版本', 1],
  ['投影版本', 1],
  ['查询时区', snapshot.query.timeZone],
  ['查询时刻（UTC）', snapshot.queriedAt],
  ['数据截止时刻（UTC）', snapshot.dataCutoffAt],
  ['起始自然日（含）', snapshot.query.from || '未限制'],
  ['结束自然日（含）', snapshot.query.to || '未限制'],
  ['模块筛选', snapshot.query.module || '全部'],
  ['事件类型筛选', snapshot.query.eventType || '全部'],
  ['结果筛选', snapshot.query.result || '全部'],
  ['操作者字面筛选', snapshot.query.operatorName || '未限制'],
  ['对象精确筛选', snapshot.query.targetId || '未限制'],
  ['追踪精确筛选', snapshot.query.traceId || '未限制'],
  ['匹配事实数', snapshot.total],
  ['实际导出事实数', snapshot.rows.length],
  ['原查询页码', snapshot.query.current],
  ['原查询每页条数', snapshot.query.pageSize],
  [
    '范围说明',
    '导出完整匹配的当前授权事实；当前页大小不限制导出总数；不含原业务正文',
  ],
  ['时间说明', 'UTC原始ISO列保留原值；显示时间及Excel日期数值按查询时区解释'],
  ['受限说明', '空身份或隐藏字段显示为受限；未记录的角色显示为未提供'],
]
const literalCsv = (value: Cell) => {
  const raw = String(value)
  const first = Array.from(raw).find(
    (character) => !/[\p{White_Space}\p{Cf}]/u.test(character)
  )
  const safe =
    typeof value === 'string' && first && '=+-@'.includes(first)
      ? `'${raw}`
      : raw
  return `"${safe.replaceAll('"', '""')}"`
}
const csv = (snapshot: AuditExportSnapshotV1) =>
  bounded(
    Buffer.from(
      `\uFEFF${[
        columns,
        ...snapshot.rows.map((row) => factCells(row, snapshot)),
      ]
        .map((row) => row.map(literalCsv).join(','))
        .join('\r\n')}\r\n`,
      'utf8'
    )
  )
const visualWidth = (value: string) =>
  Array.from(value).reduce(
    (sum, character) => sum + ((character.codePointAt(0) ?? 0) > 255 ? 2 : 1),
    0
  )
const excelString = (value: string) =>
  value.replace(/_x[0-9a-f]{4}_/gi, (sequence) => `_x005F_${sequence.slice(1)}`)
const style = (row: ExcelJS.Row, shaded = false) => {
  row.eachCell((cell) => {
    cell.font = {
      name: 'Noto Sans CJK SC',
      size: 10,
      color: { argb: '253247' },
    }
    cell.alignment = { vertical: 'top', wrapText: true }
    if (shaded)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F3F6FA' },
      }
  })
}
const xlsx = async (snapshot: AuditExportSnapshotV1) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'AF Ideal Admin'
  workbook.lastModifiedBy = 'AF Ideal Admin'
  workbook.created = FIXED_DATE
  workbook.modified = FIXED_DATE
  workbook.lastPrinted = FIXED_DATE
  workbook.title = '授权审计事实'
  workbook.subject = '审计授权投影快照 v1'
  const sheet = workbook.addWorksheet('审计事实', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
  const widths = [
    40, 28, 26, 24, 24, 34, 18, 18, 40, 28, 24, 26, 40, 40, 16, 16, 72,
  ]
  sheet.columns = widths.map((columnWidth) => ({ width: columnWidth }))
  const header = sheet.addRow(columns)
  style(header, true)
  header.height = 32
  header.eachCell((cell) => {
    cell.font = { ...cell.font, bold: true }
  })
  snapshot.rows.forEach((fact, index) => {
    const rowValues: ExcelJS.CellValue[] = factCells(fact, snapshot).map(
      (value) => (typeof value === 'string' ? excelString(value) : value)
    )
    rowValues[2] = zoned(fact.occurredAt, snapshot.query.timeZone)
    const row = sheet.addRow(rowValues)
    style(row, index % 2 === 0)
    const lines = Math.max(
      ...factCells(fact, snapshot).map((value, column) =>
        String(value)
          .split(/\r\n|\r|\n/)
          .reduce(
            (count, line) =>
              count +
              Math.max(1, Math.ceil(visualWidth(line) / (widths[column] - 3))),
            0
          )
      )
    )
    row.height = Math.min(409, Math.max(30, lines * 15 + 8))
    if (lines * 15 + 8 > 409)
      fail(
        'AUDIT_EXPORT_LAYOUT_LIMIT',
        'Excel单行超过可读高度，请改用PDF或缩小字段内容'
      )
    row.eachCell((cell, column) => {
      if (column === 3) cell.numFmt = 'yyyy-mm-dd hh:mm:ss.000'
      else cell.numFmt = typeof cell.value === 'number' ? '0' : '@'
    })
  })
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: columns.length },
  }
  sheet.pageSetup.printTitlesRow = '1:1'
  sheet.headerFooter.oddFooter = '第 &P 页 / 共 &N 页'
  const policy = workbook.addWorksheet('查询口径')
  policy.columns = [{ width: 32 }, { width: 105 }]
  metadata(snapshot).forEach(([label, value], index) => {
    const row = policy.addRow([
      label,
      typeof value === 'string' ? excelString(value) : value,
    ])
    style(row, index % 2 === 0)
    row.height = Math.max(
      28,
      Math.ceil(visualWidth(String(value)) / 100) * 16 + 8
    )
    row.eachCell((cell) => {
      cell.numFmt = typeof cell.value === 'number' ? '0' : '@'
    })
  })
  const original = Buffer.from(await workbook.xlsx.writeBuffer())
  const entries = unzipSync(new Uint8Array(original))
  const normalized: Zippable = Object.create(null)
  Object.keys(entries)
    .sort()
    .forEach((name) => {
      normalized[name] = [
        entries[name],
        { mtime: '2000-01-01T00:00:00', level: 6 },
      ]
    })
  return bounded(Buffer.from(zipSync(normalized, { level: 6 })))
}
interface VerifiedFont {
  bytes: Buffer
  font: Font
  fingerprint: string
}
let cachedFont: VerifiedFont | undefined
const font = async (): Promise<VerifiedFont> => {
  try {
    const fontPath = join(FONT_DIRECTORY, FONT_FILE)
    const licensePath = join(FONT_DIRECTORY, LICENSE_FILE)
    const [fontStat, licenseStat] = await Promise.all([
      stat(fontPath),
      stat(licensePath),
    ])
    if (
      !fontStat.isFile() ||
      fontStat.size !== FONT_BYTES ||
      !licenseStat.isFile() ||
      licenseStat.size !== LICENSE_BYTES
    )
      throw new Error('Asset mismatch')
    const fingerprint = [fontStat, licenseStat]
      .map((entry) =>
        [entry.dev, entry.ino, entry.size, entry.mtimeMs, entry.ctimeMs].join(
          ':'
        )
      )
      .join('|')
    if (cachedFont?.fingerprint === fingerprint) return cachedFont
    const [bytes, license] = await Promise.all([
      readFile(fontPath),
      readFile(licensePath),
    ])
    if (
      bytes.length !== FONT_BYTES ||
      license.length !== LICENSE_BYTES ||
      createHash('sha256').update(bytes).digest('hex') !== FONT_SHA ||
      createHash('sha256').update(license).digest('hex') !== LICENSE_SHA
    )
      throw new Error('Asset digest mismatch')
    const parsed = createFont(bytes)
    if (!('hasGlyphForCodePoint' in parsed))
      throw new Error('Font type mismatch')
    cachedFont = { bytes, font: parsed, fingerprint }
    return cachedFont
  } catch {
    cachedFont = undefined
    throw new DomainError(
      500,
      'AUDIT_EXPORT_FONT_UNAVAILABLE',
      'PDF导出中文字体或许可证缺失、不可读或完整性校验未通过'
    )
  }
}
export const auditExportFormatAvailable = async (
  format: AuditExportFormat
): Promise<{ available: boolean; reason: string | null }> => {
  if (format === 'csv' || format === 'xlsx')
    return { available: true, reason: null }
  if (format !== 'pdf') return { available: false, reason: '导出格式不受支持' }
  try {
    await font()
    return { available: true, reason: null }
  } catch (error) {
    return {
      available: false,
      reason:
        error instanceof DomainError ? error.message : 'PDF中文字体不可用',
    }
  }
}

const INK = '253247'
const MUTED = '526176'
const LIGHT = 'F3F6FA'
const BORDER = 'D7DFE9'
const textValueCheck = (value: string) => boundedText(value, 8192)
const assertPdfGlyphs = (texts: Iterable<string>, coverageFont: Font): void => {
  const checked = new Set<number>()
  Array.from(texts).forEach((text) => {
    textValueCheck(text)
    Array.from(text).forEach((character) => {
      const code = character.codePointAt(0) ?? 0
      if (code !== 9 && code !== 10 && code !== 13 && !checked.has(code)) {
        checked.add(code)
        if (!coverageFont.hasGlyphForCodePoint(code))
          fail(
            'AUDIT_EXPORT_GLYPH_UNSUPPORTED',
            `PDF字体不支持字符U+${code
              .toString(16)
              .toUpperCase()
              .padStart(4, '0')}；请使用CSV或XLSX导出`
          )
      }
    })
  })
}

const pdf = async (snapshot: AuditExportSnapshotV1): Promise<Buffer> => {
  const loadedFont = await font()
  const facts = metadata(snapshot)
  const texts = [
    '授权审计事实',
    ...facts.flatMap((item) => item.map(String)),
    ...columns,
  ]
  snapshot.rows.forEach((row) => {
    factCells(row, snapshot).forEach((value) => texts.push(String(value)))
  })
  assertPdfGlyphs(texts, loadedFont.font)
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: false,
    size: 'A4',
    margin: 42,
    pdfVersion: '1.7',
    lang: 'zh-CN',
    compress: true,
    info: {
      Title: '授权审计事实',
      Author: 'AF Ideal Admin',
      Creator: 'AF Ideal Admin',
      Producer: 'AF Ideal Admin',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
  })
  // Render from the already verified immutable bytes, avoiding a second unverified path read.
  doc.registerFont('ReportChinese', loadedFont.bytes).font('ReportChinese')
  const chunks: Uint8Array[] = []
  let size = 0
  let streamFailure: Error | undefined
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > AUDIT_EXPORT_MAX_FILE_BYTES) {
        streamFailure = new DomainError(
          422,
          'AUDIT_EXPORT_SIZE_LIMIT',
          '导出文件超过10MB，请缩小查询范围'
        )
        chunks.length = 0
        doc.destroy(streamFailure)
      } else if (!streamFailure) chunks.push(new Uint8Array(chunk))
    })
    doc.once('error', (error) => {
      streamFailure = error
      reject(error)
    })
    doc.once('end', () => {
      if (!streamFailure) resolve(bounded(Buffer.concat(chunks)))
    })
  })
  // Install a rejection handler before synchronous layout can throw.
  complete.catch(() => undefined)
  let page = 0
  let y = 0
  const left = 42
  const width = 511.28
  const bottom = 780
  const lineHeight = 15
  const glyphWidths = new Map<string, number>()
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
  const wrap = (text: string, available: number, fontSize = 10): string[] => {
    doc.fontSize(fontSize)
    const lines: string[] = []
    text
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceAll('\t', '    ')
      .split('\n')
      .forEach((paragraph) => {
        let line = ''
        let measured = 0
        Array.from(segmenter.segment(paragraph)).forEach(({ segment }) => {
          const key = `${fontSize}:${segment}`
          let segmentWidth = glyphWidths.get(key)
          if (segmentWidth === undefined) {
            segmentWidth = doc.widthOfString(segment, {
              features: TEXT_FEATURES,
            })
            glyphWidths.set(key, segmentWidth)
          }
          if (line && measured + segmentWidth > available) {
            lines.push(line)
            line = ''
            measured = 0
          }
          line += segment
          measured += segmentWidth
        })
        lines.push(line)
      })
    return lines
  }
  const writeLine = (
    text: string,
    x: number,
    top: number,
    available: number,
    fontSize = 10,
    color = INK
  ): void => {
    doc.fontSize(fontSize)
    if (doc.widthOfString(text, { features: TEXT_FEATURES }) > available + 0.01)
      fail(
        'AUDIT_EXPORT_LAYOUT_LIMIT',
        'PDF文本超出可显示宽度，请使用CSV或XLSX导出'
      )
    doc.fillColor(`#${color}`).text(text, x, top, {
      lineBreak: false,
      features: TEXT_FEATURES,
    })
  }
  const footer = (): void => {
    doc
      .moveTo(left, 799)
      .lineTo(left + width, 799)
      .lineWidth(0.5)
      .strokeColor(`#${BORDER}`)
      .stroke()
    writeLine('审计事实投影 v1 | 生成 v1', left, 808, width - 90, 8, MUTED)
    writeLine(`第 ${page} 页`, left + width - 65, 808, 65, 8, MUTED)
  }
  const newPage = (): void => {
    if (page) footer()
    doc.addPage()
    page++
    const titles = wrap('授权审计事实', width, 16)
    y = 36
    titles.forEach((line) => {
      writeLine(line, left, y, width, 16)
      y += 26
    })
    writeLine(
      `授权记录导出 | ${snapshot.query.from || '未限制'} 至 ${
        snapshot.query.to || '未限制'
      } | ${snapshot.query.timeZone}`,
      left,
      y + 4,
      width,
      9,
      MUTED
    )
    y += 32
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.7)
      .strokeColor(`#${BORDER}`)
      .stroke()
    y += 14
  }
  const ensure = (height: number): void => {
    if (y + height > bottom) newPage()
  }
  const section = (title: string): void => {
    ensure(36)
    writeLine(title, left, y, width, 12)
    y += 26
  }
  const fieldRow = (label: string, value: string, ordinal?: number): void => {
    const labels = wrap(label, 120)
    const values = wrap(value, width - 154)
    const count = Math.max(labels.length, values.length)
    let offset = 0
    while (offset < count) {
      if (y + lineHeight + 8 > bottom) {
        newPage()
        if (ordinal !== undefined) section(`记录 ${ordinal}（续）`)
        else section('审计查询口径（续）')
      }
      const fitting = Math.min(
        count - offset,
        Math.max(1, Math.floor((bottom - y - 8) / lineHeight))
      )
      const height = fitting * lineHeight + 8
      doc
        .rect(left, y - 2, width, height)
        .fill(offset % 2 ? '#FFFFFF' : `#${LIGHT}`)
      const chunkOffset = offset
      const chunkTop = y
      Array.from({ length: fitting }, (_, line) => line).forEach((line) => {
        const index = chunkOffset + line
        const displayedLabel =
          labels[index] || (line === 0 && chunkOffset ? '（续）' : '')
        writeLine(
          displayedLabel,
          left + 8,
          chunkTop + line * lineHeight,
          120,
          10,
          MUTED
        )
        writeLine(
          values[index] || '',
          left + 146,
          chunkTop + line * lineHeight,
          width - 154
        )
      })
      y += height
      offset += fitting
    }
  }
  try {
    newPage()
    section('审计查询口径与来源')
    facts.forEach(([label, value]) => fieldRow(label, String(value)))
    y += 12
    section(`审计事实（${snapshot.rows.length}条）`)
    if (!snapshot.rows.length) fieldRow('查询结果', '无符合条件的授权审计事实')
    await snapshot.rows.reduce(async (previous, row, index) => {
      await previous
      ensure(56)
      section(`记录 ${index + 1}`)
      factCells(row, snapshot).forEach((value, column) => {
        fieldRow(columns[column], String(value), index + 1)
      })
      y += 12
      if (index % 20 === 0) {
        await yieldToStream()
        if (streamFailure) throw streamFailure
      }
    }, Promise.resolve())
    footer()
    doc.end()
    return await complete
  } catch (error) {
    doc.destroy()
    throw error
  }
}

/** Trusted already-authorized capture only; rendering is not an authorization or scan verdict. */
export const generateAuditExport = async (
  format: AuditExportFormat,
  input: AuditExportSnapshotV1
): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> => {
  const snapshot = validate(input)
  const name = `audit-v1-${createHash('sha256')
    .update(canonical(snapshot))
    .digest('hex')
    .slice(0, 16)}`
  if (format === 'csv')
    return {
      bytes: csv(snapshot),
      mimeType: 'text/csv; charset=utf-8',
      fileName: `${name}.csv`,
    }
  if (format === 'xlsx')
    return {
      bytes: await xlsx(snapshot),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `${name}.xlsx`,
    }
  if (format === 'pdf')
    return {
      bytes: await pdf(snapshot),
      mimeType: 'application/pdf',
      fileName: `${name}.pdf`,
    }
  return fail('AUDIT_EXPORT_FORMAT_INVALID', '导出格式不受支持')
}
