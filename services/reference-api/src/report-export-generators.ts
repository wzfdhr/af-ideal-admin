import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { setImmediate as yieldToStream } from 'node:timers/promises'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { create as createFont } from 'fontkit'
import { unzipSync, zipSync } from 'fflate'
import { DomainError } from '@af-admin/contracts'
import type {
  Json,
  ReportingExportSnapshot,
  ReportingVisibleField,
} from '@af-admin/contracts'
import type { Font } from 'fontkit'
import type { Zippable } from 'fflate'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'
type ExportRow = ReportingExportSnapshot['rows'][number]
type MetadataRow = [string, string | number]

const MAX_ROWS = 2000
const MAX_COLUMNS = 50
const MAX_TEXT = 2000
const MAX_BYTES = 10 * 1024 * 1024
const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z')
const FONT_PATH = join(
  __dirname,
  '..',
  'assets',
  'fonts',
  'NotoSansCJKsc-Regular.otf'
)
const FONT_SIZE = 16437364
const FONT_SHA256 =
  '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b'
const RESTRICTED = '受限'
const INK = '253247'
const MUTED = '526176'
const LIGHT = 'F3F6FA'
const BORDER = 'D7DFE9'
// PDFKit accepts switches, while its separately published types only list tag arrays.
const TEXT_FEATURES = { liga: false, kern: false } as unknown as NonNullable<
  PDFKit.Mixins.TextOptions['features']
>

const exportError = (code: string, message: string): never => {
  throw new DomainError(422, code, message)
}

const assertText = (text: string): string => {
  if (text.length > MAX_TEXT)
    exportError(
      'REPORT_EXPORT_TEXT_LIMIT',
      `导出源文本不能超过${MAX_TEXT}字，请缩小或调整源数据`
    )
  // Avoid XML/PDF writers quietly replacing malformed UTF-16 with replacement glyphs.
  if (
    Array.from(text).some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code >= 0xd800 && code <= 0xdfff
    })
  )
    exportError('REPORT_EXPORT_TEXT_INVALID', '导出源文本包含无效Unicode字符')
  return text
}

const valueText = (value: Json | undefined): string => {
  if (value === null || value === undefined) return ''
  return assertText(typeof value === 'string' ? value : JSON.stringify(value))
}

const displayedValue = (
  row: ExportRow,
  field: ReportingVisibleField
): Json | undefined =>
  row.hiddenFieldKeys?.includes(field.key) ? RESTRICTED : row.values[field.key]

const displayedText = (row: ExportRow, field: ReportingVisibleField): string =>
  valueText(displayedValue(row, field))

const validateSnapshot = (snapshot: ReportingExportSnapshot): void => {
  if (snapshot.version !== 1 || snapshot.policyVersion !== 1)
    exportError('REPORT_EXPORT_SNAPSHOT_INVALID', '导出快照版本不受支持')
  if (
    snapshot.producerVersion !== undefined &&
    snapshot.producerVersion !== 1 &&
    snapshot.producerVersion !== 2
  )
    exportError(
      'REPORT_EXPORT_PRODUCER_VERSION_INVALID',
      '导出生成版本不受支持'
    )
  if (!snapshot.columns.length || snapshot.columns.length > MAX_COLUMNS)
    exportError(
      'REPORT_EXPORT_COLUMN_LIMIT',
      `导出字段数量必须为1至${MAX_COLUMNS}`
    )
  if (snapshot.rows.length > MAX_ROWS)
    exportError(
      'REPORT_EXPORT_ROW_LIMIT',
      `完整导出最多支持${MAX_ROWS}条记录，请缩小查询范围`
    )
  if (
    !Number.isSafeInteger(snapshot.total) ||
    snapshot.total !== snapshot.rows.length
  )
    exportError(
      'REPORT_EXPORT_SNAPSHOT_INVALID',
      '导出快照必须包含完整匹配记录，不能截断数据'
    )
  if (
    new Set(snapshot.columns.map((field) => field.key)).size !==
    snapshot.columns.length
  )
    exportError('REPORT_EXPORT_SNAPSHOT_INVALID', '导出快照字段重复')
  snapshot.columns.forEach((field) => {
    assertText(field.label)
    assertText(field.key)
  })
  assertText(snapshot.schema.name)
  snapshot.rows.forEach((row) => {
    snapshot.columns.forEach((field) => displayedText(row, field))
  })
}

const producerMetadata = (snapshot: ReportingExportSnapshot): MetadataRow[] =>
  snapshot.producerVersion === 2 ? [['导出生成版本', 2]] : []

const metadata = (snapshot: ReportingExportSnapshot): MetadataRow[] => [
  ['报表名称', snapshot.schema.name],
  ['报表标识', snapshot.definitionId],
  ['报表发布版标识', snapshot.definitionVersionId],
  ['报表发布版', snapshot.definitionVersion],
  ['来源应用标识', snapshot.schema.source.applicationId],
  ['来源发布版标识', snapshot.sourceReleaseId],
  ['来源发布版', snapshot.sourceReleaseVersion],
  ['权限策略版本', snapshot.policyVersion],
  ...producerMetadata(snapshot),
  ['事实时间字段', snapshot.schema.factTime],
  ['统计口径', '记录数量'],
  [
    '报表类型',
    { detail: '明细', trend: '趋势', distribution: '分布' }[
      snapshot.schema.kind
    ],
  ],
  ['查询时区', snapshot.query.timeZone],
  [
    snapshot.producerVersion === 2
      ? 'XLSX数值日期时间显示时区'
      : 'XLSX日期时间显示时区',
    snapshot.query.timeZone,
  ],
  ['查询日期开始（含）', snapshot.query.dateRange.from],
  ['查询日期结束（含）', snapshot.query.dateRange.to],
  ['查询时刻（UTC）', snapshot.queriedAt],
  ['数据截止时刻（UTC）', snapshot.dataCutoffAt],
  [
    '业务状态筛选',
    snapshot.query.statuses.length
      ? snapshot.query.statuses.join(', ')
      : '全部',
  ],
  ['关键词', snapshot.query.keyword],
  [
    '排序字段',
    `${snapshot.query.sort.field.kind}:${snapshot.query.sort.field.id}`,
  ],
  ['排序方向', snapshot.query.sort.direction],
  ['查询请求页码', snapshot.query.current],
  ['查询请求每页条数', snapshot.query.pageSize],
  ['匹配记录数', snapshot.total],
  ['导出记录数', snapshot.rows.length],
  ['记录范围', '查询时授权可见的记录；固定来源发布版'],
  ['字段范围', '仅所选可见字段；行级受限值显示为受限'],
  [
    '日期时间说明',
    snapshot.producerVersion === 2
      ? 'CSV/PDF保留源日期时间文本；XLSX可解析且不超过毫秒精度的日期时间按查询时区数值显示，超过毫秒精度的日期时间保留原始带偏移文本'
      : 'CSV/PDF保留源日期时间文本；XLSX有效日期时间按查询时区显示',
  ],
  ...snapshot.query.searchFields.map(
    (field, index): MetadataRow => [
      `搜索字段${index + 1}`,
      `${field.kind}:${field.id}`,
    ]
  ),
  ...snapshot.columns.map(
    (field, index): MetadataRow => [
      `导出字段${index + 1}`,
      `${field.label} (${field.key}; ${field.valueType})`,
    ]
  ),
]

const capped = (bytes: Buffer): Buffer => {
  if (bytes.length > MAX_BYTES)
    exportError('REPORT_EXPORT_SIZE_LIMIT', '导出文件超过10MB，请缩小查询范围')
  return bytes
}

/** CSV consumers may trim whitespace/control characters before interpreting a formula. */
const literalCsvText = (text: string): string => {
  const start = Array.from(text).find((character) => {
    const code = character.codePointAt(0) ?? 0
    return (
      code > 0x1f &&
      (code < 0x7f || code > 0x9f) &&
      !/[\p{White_Space}\p{Cf}]/u.test(character)
    )
  })
  return start !== undefined && '=+-@'.includes(start) ? `'${text}` : text
}

const csvCell = (value: Json | undefined): string => {
  const text = valueText(value)
  const literal = typeof value === 'string' ? literalCsvText(text) : text
  return `"${literal.replaceAll('"', '""')}"`
}

const generateCsv = (snapshot: ReportingExportSnapshot): Buffer => {
  const lines = [
    snapshot.columns.map((field) => csvCell(field.label)).join(','),
  ]
  let size = 3 + Buffer.byteLength(lines[0]) + 2
  snapshot.rows.forEach((row) => {
    const line = snapshot.columns
      .map((field) => csvCell(displayedValue(row, field)))
      .join(',')
    size += Buffer.byteLength(line) + 2
    if (size > MAX_BYTES)
      exportError(
        'REPORT_EXPORT_SIZE_LIMIT',
        '导出文件超过10MB，请缩小查询范围'
      )
    lines.push(line)
  })
  return capped(Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'))
}

const visualWidth = (text: string): number =>
  Array.from(text).reduce(
    (width, character) =>
      width + ((character.codePointAt(0) ?? 0) > 255 ? 2 : 1),
    0
  )

const wrappedLines = (text: string, width: number): number =>
  text
    .split(/\r\n|\r|\n/)
    .reduce(
      (total, paragraph) =>
        total +
        Math.max(
          1,
          Math.ceil(visualWidth(paragraph.replaceAll('\t', '    ')) / width)
        ),
      0
    )

// OOXML's ST_Xstring escape preserves characters that XML itself cannot carry.
// Escape a literal escape-looking sequence first, so source "_x0041_" stays text.
const excelLiteralText = (text: string): string =>
  Array.from(
    text.replace(
      /_x[0-9a-f]{4}_/gi,
      (sequence) => `_x005F_${sequence.slice(1)}`
    )
  )
    .map((character) => {
      const code = character.codePointAt(0) ?? 0
      if ((code <= 0x1f && code !== 9 && code !== 10) || code === 0x7f)
        return `_x${code.toString(16).toUpperCase().padStart(4, '0')}_`
      return character
    })
    .join('')

const numericValue = (
  value: Json | undefined,
  field: ReportingVisibleField
): ExcelJS.CellValue => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (
    field.valueType === 'decimal' &&
    typeof value === 'string' &&
    /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)
  )
    return Number(value)
  return excelLiteralText(valueText(value))
}

const excelDate = (
  value: Json | undefined,
  field: ReportingVisibleField,
  timeZone: string
): Date | null => {
  if (typeof value !== 'string') return null
  if (field.valueType === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
      return date
  }
  if (
    field.valueType !== 'datetime' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  )
    return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(value.slice(11, 13)) > 23
  )
    return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (key: string): string =>
    parts.find((item) => item.type === key)?.value ||
    exportError('REPORT_EXPORT_DATE_INVALID', '日期时间无法按查询时区显示')
  // Excel has no timezone cell type. Store local clock components as an Excel serial date.
  return new Date(
    `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part(
      'minute'
    )}:${part('second')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}Z`
  )
}

const styleRow = (row: ExcelJS.Row, fill?: string): void => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Noto Sans CJK SC', size: 10, color: { argb: INK } }
    cell.alignment = { vertical: 'top', wrapText: true }
    if (fill)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } }
  })
}

const setRowHeight = (
  row: ExcelJS.Row,
  texts: string[],
  widths: number[]
): void => {
  const lines = Math.max(
    1,
    ...texts.map((text, index) => wrappedLines(text, widths[index] - 2))
  )
  const height = Math.max(25, lines * 15 + 8)
  if (height > 409)
    exportError(
      'REPORT_EXPORT_LAYOUT_LIMIT',
      '源文本换行过多，超出Excel可显示行高；请使用CSV或PDF导出'
    )
  row.height = height
}

const generateXlsx = async (
  snapshot: ReportingExportSnapshot
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'AF Ideal Admin'
  workbook.lastModifiedBy = 'AF Ideal Admin'
  workbook.created = FIXED_DATE
  workbook.modified = FIXED_DATE
  workbook.lastPrinted = FIXED_DATE
  workbook.title = snapshot.schema.name
  workbook.subject = '固定发布版授权记录导出'
  const records = workbook.addWorksheet('记录', {
    views: [{ state: 'frozen', ySplit: 4, activeCell: 'A5' }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
  const widths = snapshot.columns.map((field) => {
    const max = Math.max(
      visualWidth(field.label),
      ...snapshot.rows.map((row) => visualWidth(displayedText(row, field)))
    )
    return Math.max(
      26,
      Math.min(175, Math.ceil(max / 24) + 4, Math.max(26, max + 2))
    )
  })
  records.columns = widths.map((width) => ({ width }))
  const lastColumn = snapshot.columns.length
  records.mergeCells(1, 1, 1, lastColumn)
  records.getCell('A1').value = excelLiteralText(snapshot.schema.name)
  records.getCell('A1').font = {
    name: 'Noto Sans CJK SC',
    size: 18,
    bold: true,
    color: { argb: INK },
  }
  records.getCell('A1').alignment = { vertical: 'middle', wrapText: true }
  const mergedWidth = widths.reduce((sum, value) => sum + value, 0) - 2
  records.getRow(1).height = Math.max(
    38,
    Math.ceil((visualWidth(snapshot.schema.name) * 1.5) / mergedWidth) * 25 + 10
  )
  records.mergeCells(2, 1, 2, lastColumn)
  const timeSubtitle =
    snapshot.producerVersion === 2
      ? `数值时间时区 ${snapshot.query.timeZone} | 超过毫秒精度时间保留原始带偏移文本`
      : `日期时间显示时区 ${snapshot.query.timeZone}`
  const subtitle = `报表发布版 ${snapshot.definitionVersion} | 来源发布版 ${snapshot.sourceReleaseVersion} | 导出 ${snapshot.rows.length} 条 | ${timeSubtitle}`
  records.getCell('A2').value = excelLiteralText(subtitle)
  records.getCell('A2').font = {
    name: 'Noto Sans CJK SC',
    size: 10,
    color: { argb: MUTED },
  }
  records.getCell('A2').alignment = { vertical: 'middle', wrapText: true }
  records.getRow(2).height = Math.max(
    40,
    Math.ceil(visualWidth(subtitle) / mergedWidth) * 14 + 8
  )
  records.getRow(3).height = 10
  const header = records.getRow(4)
  header.values = snapshot.columns.map((field) => excelLiteralText(field.label))
  styleRow(header, LIGHT)
  setRowHeight(
    header,
    snapshot.columns.map((field) => field.label),
    widths
  )
  header.eachCell((cell) => {
    cell.font = { ...cell.font, bold: true }
  })
  snapshot.rows.forEach((sourceRow, index) => {
    const values = snapshot.columns.map((field) => {
      const value = displayedValue(sourceRow, field)
      return (
        excelDate(value, field, snapshot.query.timeZone) ||
        numericValue(value, field)
      )
    })
    const row = records.addRow(values)
    styleRow(row, index % 2 ? LIGHT : undefined)
    setRowHeight(
      row,
      snapshot.columns.map((field) => displayedText(sourceRow, field)),
      widths
    )
    snapshot.columns.forEach((field, column) => {
      const cell = row.getCell(column + 1)
      if (cell.value instanceof Date)
        cell.numFmt =
          field.valueType === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss.000'
      else if (typeof cell.value === 'number')
        cell.numFmt =
          field.valueType === 'decimal' ? '0.00' : '0.###############'
      else cell.numFmt = '@'
    })
  })
  records.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, records.rowCount), column: lastColumn },
  }
  records.pageSetup.printTitlesRow = '1:4'
  records.pageSetup.printArea = `A1:${
    records.getColumn(lastColumn).letter
  }${Math.max(4, records.rowCount)}`
  records.headerFooter.oddFooter = '第 &P 页 / 共 &N 页'
  const policy = workbook.addWorksheet('口径', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  policy.columns = [{ width: 28 }, { width: 100 }]
  policy.mergeCells('A1:B1')
  policy.getCell('A1').value = '报表口径与来源'
  policy.getCell('A1').font = {
    name: 'Noto Sans CJK SC',
    size: 16,
    bold: true,
    color: { argb: INK },
  }
  policy.getRow(1).height = 36
  policy.getRow(2).values = ['项目', '固定查询快照']
  styleRow(policy.getRow(2), LIGHT)
  policy.getRow(2).height = 26
  metadata(snapshot).forEach((item, index) => {
    const row = policy.addRow(
      item.map((value) =>
        typeof value === 'string' ? excelLiteralText(value) : value
      )
    )
    styleRow(row, index % 2 ? LIGHT : undefined)
    setRowHeight(row, item.map(String), [28, 100])
  })
  const original = Buffer.from(await workbook.xlsx.writeBuffer())
  const entries = unzipSync(new Uint8Array(original))
  const normalized: Zippable = Object.create(null)
  // DOS ZIP timestamps are local clock components, not UTC instants.
  Object.keys(entries)
    .sort()
    .forEach((name) => {
      normalized[name] = [
        entries[name],
        { mtime: '2000-01-01T00:00:00', level: 6 },
      ]
    })
  // ExcelJS's ZIP container uses wall-clock timestamps. Normalize those after authoring.
  return capped(Buffer.from(zipSync(normalized, { level: 6 })))
}

interface VerifiedPdfFont {
  fingerprint: string
  bytes: Buffer
  font: Font
}
let verifiedFont: VerifiedPdfFont | undefined
const pendingFontChecks = new Map<string, Promise<VerifiedPdfFont>>()
const loadPdfFont = async (): Promise<VerifiedPdfFont> => {
  try {
    const file = await stat(FONT_PATH)
    if (!file.isFile() || file.size !== FONT_SIZE)
      throw new Error('Font size mismatch')
    const fingerprint = [
      file.dev,
      file.ino,
      file.size,
      file.mtimeMs,
      file.ctimeMs,
    ].join(':')
    if (verifiedFont?.fingerprint === fingerprint) return verifiedFont
    const pending = pendingFontChecks.get(fingerprint)
    if (pending) return await pending
    const check = (async () => {
      const bytes = await readFile(FONT_PATH)
      if (
        bytes.length !== FONT_SIZE ||
        createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !==
          FONT_SHA256
      )
        throw new Error('Font integrity mismatch')
      const font = createFont(bytes)
      if (!('hasGlyphForCodePoint' in font))
        throw new Error('Font format mismatch')
      verifiedFont = { fingerprint, bytes, font }
      return verifiedFont
    })().finally(() => pendingFontChecks.delete(fingerprint))
    pendingFontChecks.set(fingerprint, check)
    return await check
  } catch {
    verifiedFont = undefined
    throw new DomainError(
      500,
      'REPORT_EXPORT_FONT_UNAVAILABLE',
      'PDF导出中文字体缺失、不可读或完整性校验未通过'
    )
  }
}

/** Capability is based on the shipped font's verified bytes, never an advertised extension. */
export const reportExportFormatAvailable = async (
  format: ExportFormat
): Promise<{ available: boolean; reason: string | null }> => {
  if (format === 'csv' || format === 'xlsx')
    return { available: true, reason: null }
  if (format !== 'pdf') return { available: false, reason: '导出格式不受支持' }
  try {
    await loadPdfFont()
    return { available: true, reason: null }
  } catch (error) {
    return {
      available: false,
      reason:
        error instanceof DomainError ? error.message : 'PDF导出中文字体不可用',
    }
  }
}

const assertPdfGlyphs = (texts: Iterable<string>, coverageFont: Font): void => {
  const checked = new Set<number>()
  Array.from(texts).forEach((text) => {
    assertText(text)
    Array.from(text).forEach((character) => {
      const code = character.codePointAt(0) ?? 0
      if (code !== 9 && code !== 10 && code !== 13 && !checked.has(code)) {
        checked.add(code)
        if (!coverageFont.hasGlyphForCodePoint(code))
          exportError(
            'REPORT_EXPORT_GLYPH_UNSUPPORTED',
            `PDF字体不支持字符U+${code
              .toString(16)
              .toUpperCase()
              .padStart(4, '0')}；请使用CSV或XLSX导出`
          )
      }
    })
  })
}

const generatePdf = async (
  snapshot: ReportingExportSnapshot
): Promise<Buffer> => {
  const font = await loadPdfFont()
  const facts = metadata(snapshot)
  const texts = [
    snapshot.schema.name,
    ...facts.flatMap((item) => item.map(String)),
    ...snapshot.columns.map((field) => field.label),
  ]
  snapshot.rows.forEach((row) => {
    snapshot.columns.forEach((field) => texts.push(displayedText(row, field)))
  })
  assertPdfGlyphs(texts, font.font)
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: false,
    size: 'A4',
    margin: 42,
    pdfVersion: '1.7',
    lang: 'zh-CN',
    compress: true,
    info: {
      Title: snapshot.schema.name,
      Author: 'AF Ideal Admin',
      Creator: 'AF Ideal Admin',
      Producer: 'AF Ideal Admin',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
  })
  // Render from the already verified immutable bytes, avoiding a second unverified path read.
  doc.registerFont('ReportChinese', font.bytes).font('ReportChinese')
  const chunks: Uint8Array[] = []
  let size = 0
  let streamFailure: Error | undefined
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BYTES) {
        streamFailure = new DomainError(
          422,
          'REPORT_EXPORT_SIZE_LIMIT',
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
      if (!streamFailure) resolve(capped(Buffer.concat(chunks)))
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
      exportError(
        'REPORT_EXPORT_LAYOUT_LIMIT',
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
    writeLine(
      `报表发布版 ${snapshot.definitionVersion} | 来源发布版 ${snapshot.sourceReleaseVersion}`,
      left,
      808,
      width - 90,
      8,
      MUTED
    )
    writeLine(`第 ${page} 页`, left + width - 65, 808, 65, 8, MUTED)
  }
  const newPage = (): void => {
    if (page) footer()
    doc.addPage()
    page++
    const titles = wrap(snapshot.schema.name, width, 16)
    y = 36
    titles.forEach((line) => {
      writeLine(line, left, y, width, 16)
      y += 26
    })
    writeLine(
      `授权记录导出 | ${snapshot.query.dateRange.from} 至 ${snapshot.query.dateRange.to} | ${snapshot.query.timeZone}`,
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
        else section('报表口径（续）')
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
    section('报表口径与来源')
    facts.forEach(([label, value]) => fieldRow(label, String(value)))
    y += 12
    section(`明细记录（${snapshot.rows.length}条）`)
    if (!snapshot.rows.length) fieldRow('查询结果', '无符合条件的授权记录')
    await snapshot.rows.reduce(async (previous, row, index) => {
      await previous
      ensure(56)
      section(`记录 ${index + 1}`)
      snapshot.columns.forEach((field) => {
        fieldRow(field.label, displayedText(row, field), index + 1)
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

/** Only an authorized server-captured snapshot is accepted, never browser report data. */
export const generateReportExport = async (
  format: ExportFormat,
  snapshot: ReportingExportSnapshot
): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> => {
  validateSnapshot(snapshot)
  metadata(snapshot).forEach((item) =>
    item.forEach((value) => assertText(String(value)))
  )
  const base = `report-${snapshot.definitionId
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 100)}-v${snapshot.definitionVersion}`
  if (format === 'csv')
    return {
      bytes: generateCsv(snapshot),
      mimeType: 'text/csv; charset=utf-8',
      fileName: `${base}.csv`,
    }
  if (format === 'xlsx')
    return {
      bytes: await generateXlsx(snapshot),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `${base}.xlsx`,
    }
  if (format === 'pdf')
    return {
      bytes: await generatePdf(snapshot),
      mimeType: 'application/pdf',
      fileName: `${base}.pdf`,
    }
  return exportError('REPORT_EXPORT_FORMAT_INVALID', '导出格式不受支持')
}
