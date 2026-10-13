import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { create as createFont } from 'fontkit'
import { unzipSync, zipSync } from 'fflate'
import {
  DomainError,
  AUDIT_ARCHIVE_MAX_CANDIDATES,
  AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES,
  AUDIT_ARCHIVE_BATCH_MAX_SNAPSHOT_BYTES,
} from '@af-admin/contracts'
import {
  generateAuditExport,
  auditExportFormatAvailable,
} from './audit-export-generators'
import { contentCanonical } from './support'
import type {
  AuditArchiveBatchSnapshotV1,
  AuditExportFormat,
} from '@af-admin/contracts'
import type { Zippable } from 'fflate'

const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z')
const invalid = (): never => {
  throw new DomainError(
    422,
    'AUDIT_ARCHIVE_BATCH_INVALID',
    '归档批次快照或完整候选范围无效'
  )
}
const plainTree = (input: unknown, depth = 0): void => {
  if (depth > 12) invalid()
  if (input === null || ['string', 'boolean'].includes(typeof input)) return
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) invalid()
    return
  }
  if (!input || typeof input !== 'object') invalid()
  const value = input as object
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > 2000 ||
      Array.from({ length: value.length }, (_, index) =>
        Object.hasOwn(value, index)
      ).some((present) => !present)
    )
      invalid()
  } else if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid()
  Reflect.ownKeys(value).forEach((key) => {
    if (Array.isArray(value) && key === 'length') return
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (
      typeof key !== 'string' ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    )
      throw new DomainError(
        422,
        'AUDIT_ARCHIVE_BATCH_INVALID',
        '批次不接受符号或访问器'
      )
    if (
      Array.isArray(value) &&
      (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
    )
      invalid()
    plainTree(descriptor.value, depth + 1)
  })
}
const cap = (bytes: Buffer) => {
  if (bytes.length > AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES)
    throw new DomainError(
      422,
      'AUDIT_ARCHIVE_FILE_TOO_LARGE',
      '归档批次文件超过10MiB'
    )
  return bytes
}
const validate = (input: AuditArchiveBatchSnapshotV1) => {
  plainTree(input)
  if (
    !input ||
    typeof input !== 'object' ||
    !input.snapshot ||
    typeof input.snapshot !== 'object'
  )
    invalid()
  const allowed = [
    'version',
    'kind',
    'producerVersion',
    'projectionVersion',
    'source',
    'runId',
    'ordinal',
    'candidateTotal',
    'candidateRange',
    'snapshot',
  ]
  if (
    Object.keys(input).length !== allowed.length ||
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    input.version !== 1 ||
    input.kind !== 'archive-batch' ||
    input.producerVersion !== 2 ||
    input.projectionVersion !== 1 ||
    input.source !== 'server'
  )
    invalid()
  if (
    typeof input.runId !== 'string' ||
    !/^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,99}$/.test(input.runId) ||
    ['__proto__', 'constructor', 'prototype'].includes(input.runId)
  )
    invalid()
  const range = input.candidateRange
  if (
    !range ||
    Object.keys(range).sort().join(',') !== 'firstOrdinal,lastOrdinal'
  )
    invalid()
  if (
    ![
      input.ordinal,
      input.candidateTotal,
      range.firstOrdinal,
      range.lastOrdinal,
    ].every(
      (number) =>
        Number.isSafeInteger(number) &&
        number >= 1 &&
        number <= AUDIT_ARCHIVE_MAX_CANDIDATES
    ) ||
    range.lastOrdinal < range.firstOrdinal ||
    range.lastOrdinal > input.candidateTotal ||
    input.ordinal > range.firstOrdinal ||
    range.lastOrdinal - range.firstOrdinal + 1 !== input.snapshot.total
  )
    invalid()
  const canonical = contentCanonical(input)
  if (Buffer.byteLength(canonical) > AUDIT_ARCHIVE_BATCH_MAX_SNAPSHOT_BYTES)
    throw new DomainError(
      422,
      'AUDIT_ARCHIVE_SNAPSHOT_TOO_LARGE',
      '归档批次快照超过2MiB'
    )
  return JSON.parse(canonical) as AuditArchiveBatchSnapshotV1
}
const provenance = (
  batch: AuditArchiveBatchSnapshotV1
): [string, string | number][] => [
  ['制品类型', '逻辑归档批次 archive-batch'],
  ['生成版本', 2],
  ['归档运行ID', batch.runId],
  ['批次序号', batch.ordinal],
  ['固定候选总数', batch.candidateTotal],
  ['候选起始序号（含）', batch.candidateRange.firstOrdinal],
  ['候选结束序号（含）', batch.candidateRange.lastOrdinal],
  ['本批事实数', batch.snapshot.total],
  ['覆盖说明', '仅覆盖固定候选清单的本批范围，不是原始查询的完整匹配导出'],
  ['查询时区', batch.snapshot.query.timeZone],
  ['查询时刻（UTC）', batch.snapshot.queriedAt],
  ['候选数据截止（UTC）', batch.snapshot.dataCutoffAt],
  ['查询条件', contentCanonical(batch.snapshot.query)],
]
const csvCell = (value: string | number) => {
  const raw = String(value)
  const first = Array.from(raw).find(
    (char) => !/[\p{White_Space}\p{Cf}]/u.test(char)
  )
  const safe =
    typeof value === 'string' && first && '=+-@'.includes(first)
      ? `'${raw}`
      : raw
  return `"${safe.replaceAll('"', '""')}"`
}
const makePdf = async (batch: AuditArchiveBatchSnapshotV1) => {
  if (!(await auditExportFormatAvailable('pdf')).available)
    throw new DomainError(
      503,
      'AUDIT_ARCHIVE_FONT_UNAVAILABLE',
      '归档PDF字体或许可证不可用'
    )
  const bytes = await readFile(
    join(__dirname, '..', 'assets', 'fonts', 'NotoSansCJKsc-Regular.otf')
  )
  const license = await readFile(
    join(__dirname, '..', 'assets', 'fonts', 'LICENSE.NotoSansCJK')
  )
  if (
    createHash('sha256').update(bytes).digest('hex') !==
      '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b' ||
    createHash('sha256').update(license).digest('hex') !==
      '6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2'
  )
    throw new DomainError(
      503,
      'AUDIT_ARCHIVE_FONT_UNAVAILABLE',
      '归档PDF字体或许可证校验失败'
    )
  const font = createFont(bytes)
  if (!('hasGlyphForCodePoint' in font))
    throw new DomainError(422, 'AUDIT_ARCHIVE_FONT_INVALID', '字体类型无效')
  const lines: [string, string][] = [
    ...provenance(batch).map(([key, value]): [string, string] => [
      key,
      String(value),
    ]),
  ]
  batch.snapshot.rows.forEach((row, index) => {
    lines.push(
      [`本批事实 ${index + 1}`, row.id],
      ['事实时间（原始UTC ISO）', row.occurredAt],
      ['模块 / 动作', `${row.module} / ${row.action}`],
      ['类型 / 结果', `${row.eventType} / ${row.result}`],
      ['操作者ID', row.operator.id ?? '受限'],
      ['操作者姓名', row.operator.name ?? '受限'],
      [
        '操作者角色',
        row.operator.role === undefined
          ? '未提供'
          : row.operator.role ?? '受限',
      ],
      ['对象类型 / ID', `${row.target.type} / ${row.target.id ?? '受限'}`],
      ['trace', row.traceId],
      ['来源 / 投影版本', `${row.source} / ${row.projectionVersion}`],
      ['受控详情', contentCanonical(row.detail)]
    )
  })
  lines.forEach(([label, value]) =>
    Array.from(`${label}${value}`).forEach((char) => {
      const point = char.codePointAt(0) || 0
      if (![9, 10, 13].includes(point) && !font.hasGlyphForCodePoint(point))
        throw new DomainError(
          422,
          'AUDIT_ARCHIVE_GLYPH_UNSUPPORTED',
          '归档PDF字体不能完整呈现所选文本'
        )
    })
  )
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: 'A4',
    margin: 40,
    pdfVersion: '1.7',
    compress: true,
    info: {
      Title: '审计逻辑归档批次',
      Creator: 'AF Ideal Admin',
      Producer: 'AF Ideal Admin archive-batch v2',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
  })
  doc.registerFont('AuditCJK', bytes).font('AuditCJK')
  const chunks: Buffer[] = []
  let size = 0
  let page = 0
  let y = 0
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > AUDIT_ARCHIVE_BATCH_MAX_FILE_BYTES) {
        chunks.length = 0
        doc.destroy(
          new DomainError(
            422,
            'AUDIT_ARCHIVE_FILE_TOO_LARGE',
            '归档批次文件超过10MiB'
          )
        )
      } else chunks.push(chunk)
    })
    doc.once('error', reject)
    doc.once('end', () => resolve(cap(Buffer.concat(chunks))))
  })
  done.catch(() => undefined)
  const addPage = () => {
    if (page)
      doc.fontSize(8).text(`第 ${page} 页`, 40, 805, { lineBreak: false })
    doc.addPage()
    page += 1
    doc
      .fontSize(15)
      .text(`审计逻辑归档批次 ${batch.ordinal}`, 40, 36, { lineBreak: false })
    doc
      .fontSize(8)
      .text(
        `固定候选 ${batch.candidateRange.firstOrdinal}–${batch.candidateRange.lastOrdinal} / ${batch.candidateTotal} · producer 2`,
        40,
        60,
        { lineBreak: false }
      )
    y = 86
  }
  const write = (value: string, bold = false) => {
    doc.fontSize(bold ? 11 : 9)
    const pieces: string[] = []
    let line = ''
    Array.from(
      value
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .replaceAll('\t', '    ')
    ).forEach((character) => {
      if (character === '\n') {
        pieces.push(line)
        line = ''
        return
      }
      if (line && doc.widthOfString(line + character) > 510) {
        pieces.push(line)
        line = ''
      }
      line += character
    })
    pieces.push(line)
    pieces.forEach((piece) => {
      if (y + 15 > 780) addPage()
      doc
        .fontSize(bold ? 11 : 9)
        .fillColor(bold ? '#253247' : '#526176')
        .text(piece, 40, y, { lineBreak: false })
      y += 15
    })
  }
  try {
    addPage()
    lines.forEach(([label, value]) => {
      write(label, true)
      write(value)
      y += 5
    })
    doc.fontSize(8).text(`第 ${page} 页`, 40, 805, { lineBreak: false })
    doc.end()
    return await done
  } catch (error) {
    doc.destroy()
    throw error
  }
}
export const auditArchiveFormatAvailable = auditExportFormatAvailable
/** Producer 2 wraps batch provenance; ordinary producer-1 bytes and validators remain unchanged. */
export const generateAuditArchiveBatch = async (
  format: AuditExportFormat,
  input: AuditArchiveBatchSnapshotV1
): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> => {
  const batch = validate(input)
  const base = await generateAuditExport(
    format === 'pdf' ? 'csv' : format,
    batch.snapshot
  )
  const name = `audit-archive-${createHash('sha256')
    .update(contentCanonical(batch))
    .digest('hex')
    .slice(0, 20)}-${batch.ordinal}`
  if (format === 'csv') {
    const header = provenance(batch)
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
    return {
      bytes: cap(
        Buffer.from(
          `\uFEFF${header}\r\n\r\n${base.bytes
            .toString('utf8')
            .replace(/^\uFEFF/, '')}`
        )
      ),
      mimeType: base.mimeType,
      fileName: `${name}.csv`,
    }
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      base.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]
    )
    workbook.created = FIXED_DATE
    workbook.modified = FIXED_DATE
    workbook.lastPrinted = FIXED_DATE
    workbook.title = '审计逻辑归档批次'
    const policy = workbook.getWorksheet('查询口径')
    policy?.eachRow((row) => {
      if (
        ['匹配事实数', '实际导出事实数'].includes(String(row.getCell(1).value))
      )
        row.getCell(1).value = '本批事实数'
      if (row.getCell(1).value === '范围说明')
        row.getCell(2).value =
          '仅覆盖固定运行候选清单的本批范围，不是原始查询完整匹配导出'
    })
    const sheet = workbook.addWorksheet('归档批次来源')
    sheet.columns = [{ width: 32 }, { width: 110 }]
    provenance(batch).forEach(([label, value]) => {
      const chunks: (string | number)[] = []
      if (typeof value === 'number') chunks.push(value)
      else {
        let line = ''
        let width = 0
        Array.from(value).forEach((character) => {
          const extra = (character.codePointAt(0) ?? 0) > 255 ? 2 : 1
          if (width + extra > 95) {
            chunks.push(line)
            line = ''
            width = 0
          }
          line += character
          width += extra
        })
        chunks.push(line)
      }
      chunks.forEach((chunkValue, index) => {
        const literal =
          typeof chunkValue === 'string'
            ? chunkValue.replace(
                /_x[0-9a-f]{4}_/gi,
                (sequence) => `_x005F_${sequence.slice(1)}`
              )
            : chunkValue
        const created = sheet.addRow([
          index ? `${label}（续）` : label,
          literal,
        ])
        created.alignment = { vertical: 'top', wrapText: true }
        created.height = 32
        created.font = { name: 'Noto Sans CJK SC', size: 10 }
      })
    })

    const entries = unzipSync(new Uint8Array(await workbook.xlsx.writeBuffer()))
    const normalized: Zippable = Object.create(null)
    Object.keys(entries)
      .sort()
      .forEach((key) => {
        normalized[key] = [
          entries[key],
          { mtime: '2000-01-01T00:00:00', level: 6 },
        ]
      })
    return {
      bytes: cap(Buffer.from(zipSync(normalized, { level: 6 }))),
      mimeType: base.mimeType,
      fileName: `${name}.xlsx`,
    }
  }
  if (format === 'pdf')
    return {
      bytes: await makePdf(batch),
      mimeType: 'application/pdf',
      fileName: `${name}.pdf`,
    }
  return invalid()
}
