/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type {
  APIRequestContext,
  BrowserContext,
  Page,
  Response,
  TestInfo,
} from '@playwright/test'
import type { AuditExportJobV1, ManagedRole } from '@af-admin/contracts'

const apiOrigin = process.env.R1_API_URL || 'http://127.0.0.1:10888'
const login = async (page: Page, username: string, password = username) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}
const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem('token') || '')
const caller = (
  request: APIRequestContext,
  token: string,
  tenantId = 'tenant-a'
) => {
  const raw = (endpoint: string, method?: string, body?: unknown) =>
    request.fetch(`${apiOrigin}/api${endpoint}`, {
      method: method || 'GET',
      headers: {
        'x-access-token': token,
        'x-tenant-id': tenantId,
        'idempotency-key': randomUUID(),
      },
      ...(body === undefined ? {} : { data: body }),
    })
  const call = async <T>(
    endpoint: string,
    method?: string,
    body?: unknown
  ): Promise<T> => {
    const response = await raw(endpoint, method, body)
    expect(response.status(), `${method || 'GET'} ${endpoint}`).toBe(200)
    return (await response.json()).data as T
  }
  return { raw, call }
}
const waitResponse = (page: Page, path: string, method: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${path}` &&
      response.request().method() === method
  )
const createdAuditExport = async (
  response: Response,
  label: string
): Promise<AuditExportJobV1> => {
  const payload: unknown = await response.json()
  const envelope =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : undefined
  const traceId =
    typeof envelope?.traceId === 'string' ? envelope.traceId : 'missing'
  expect(response.status(), `${label} traceId=${traceId}`).toBe(200)
  const data = envelope?.data
  expect(data, `${label} omitted job data traceId=${traceId}`).toBeDefined()
  expect(data, `${label} returned no job traceId=${traceId}`).not.toBeNull()
  if (
    !data ||
    typeof data !== 'object' ||
    typeof (data as Record<string, unknown>).id !== 'string'
  )
    throw new Error(`${label} returned an invalid job traceId=${traceId}`)
  return data as AuditExportJobV1
}
const attach = async (testInfo: TestInfo, name: string, facts: unknown) => {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, JSON.stringify(facts, null, 2))
  await testInfo.attach(name, { path, contentType: 'application/json' })
}
const csvRows = (bytes: Buffer) => {
  const text = bytes.toString('utf8').replace(/^\uFEFF/u, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted && character === '"' && text[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') quoted = !quoted
    else if (!quoted && character === ',') {
      row.push(cell)
      cell = ''
    } else if (!quoted && (character === '\r' || character === '\n')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  return rows
}
const pdfText = (bytes: Buffer) => {
  const source = bytes.toString('latin1')
  const trailer = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(source)
  if (!trailer) throw new Error('PDF缺少可读取的交叉引用入口')
  const xrefOffset = Number(trailer[1])
  const xref = source.slice(xrefOffset)
  const header = /^xref\s+0\s+(\d+)\s+/.exec(xref)
  if (!header) throw new Error('PDF交叉引用表无效')
  const entries = xref
    .slice(header[0].length)
    .split(/\r?\n/)
    .slice(0, Number(header[1]))
  const offsets = entries.map((entry) => Number(entry.slice(0, 10)))
  const objects = new Map<number, { text: string; stream?: string }>()
  for (let index = 1; index < offsets.length; index += 1) {
    const offset = offsets[index]
    if (!Number.isSafeInteger(offset) || offset <= 0) continue
    const laterOffsets = offsets.filter((value) => value > offset)
    const physicalEnd = Math.min(xrefOffset, ...laterOffsets)
    const objectBytes = bytes.subarray(offset, physicalEnd)
    const objectText = objectBytes.toString('latin1')
    if (!new RegExp(`^${index} 0 obj`).test(objectText))
      throw new Error(`PDF对象 ${index} 偏移无效`)
    const marker = objectText.indexOf('stream\n')
    let stream: string | undefined
    if (marker >= 0) {
      const lengthMatch = /\/Length\s+(\d+)/.exec(objectText)
      if (!lengthMatch) throw new Error(`PDF流 ${index} 缺少长度`)
      const length = Number(lengthMatch[1])
      const raw = objectBytes.subarray(marker + 7, marker + 7 + length)
      stream = /\/Filter\s*\/FlateDecode/.test(objectText)
        ? inflateSync(raw).toString('latin1')
        : raw.toString('latin1')
    }
    objects.set(index, { text: objectText, stream })
  }
  const font = Array.from(objects.values()).find((value) =>
    /\/Subtype\s*\/Type0\b/.test(value.text)
  )
  if (!font) throw new Error('PDF缺少Unicode Type0字体')
  const cmapReference = /\/ToUnicode\s+(\d+) 0 R/.exec(font.text)
  if (!cmapReference) throw new Error('PDF Type0字体缺少ToUnicode映射')
  const cmap = objects.get(Number(cmapReference[1]))?.stream
  if (!cmap || !/begincmap/.test(cmap)) throw new Error('PDF CMap无效')
  const unicode = new Map<number, string>()
  const decodeUnicode = (hex: string) => {
    const encoded = Buffer.from(hex.replaceAll(' ', ''), 'hex')
    if (encoded.length % 2 !== 0) throw new Error('PDF Unicode映射长度无效')
    return encoded.swap16().toString('utf16le')
  }
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const match of block[1].matchAll(/<([0-9a-f]{4})>\s*<([0-9a-f ]+)>/gi))
      unicode.set(Number.parseInt(match[1], 16), decodeUnicode(match[2]))
  for (const match of cmap.matchAll(
    /<([0-9a-f]{4})>\s*<([0-9a-f]{4})>\s*\[([^\]]*)\]/gi
  )) {
    const first = Number.parseInt(match[1], 16)
    const last = Number.parseInt(match[2], 16)
    const values = Array.from(
      match[3].matchAll(/<([0-9a-f ]*)>/gi),
      (value) => value[1]
    )
    if (values.length !== last - first + 1)
      throw new Error('PDF CMap区间长度无效')
    values.forEach((hex, index) =>
      unicode.set(first + index, decodeUnicode(hex))
    )
  }
  const decoded: string[] = []
  for (const object of objects.values()) {
    if (!object.stream || !/\bBT\b/.test(object.stream)) continue
    for (const block of object.stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      let text = ''
      for (const match of block[1].matchAll(/<([0-9a-f]+)>/gi))
        for (let index = 0; index < match[1].length; index += 4) {
          const glyph = unicode.get(
            Number.parseInt(match[1].slice(index, index + 4), 16)
          )
          if (glyph === undefined) throw new Error('PDF正文字符缺少Unicode映射')
          text += glyph
        }
      decoded.push(text)
    }
  }
  return decoded.join('\n')
}
const exportedFacts = async (format: 'csv' | 'xlsx' | 'pdf', bytes: Buffer) => {
  if (format === 'csv') {
    const rows = csvRows(bytes)
    return {
      ids: rows.slice(1).map((row) => row[0]),
      sources: rows.slice(1).map((row) => row[14]),
      signature: rows[0]?.[0],
      text: bytes.toString('utf8'),
    }
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const sheet = workbook.getWorksheet('审计事实')
    expect(sheet).toBeDefined()
    const ids: string[] = []
    const sources: string[] = []
    sheet?.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        ids.push(String(row.getCell(1).value || ''))
        sources.push(String(row.getCell(15).value || ''))
      }
    })
    return {
      ids,
      sources,
      signature: sheet?.getCell('A1').value,
      text: '',
    }
  }
  const text = pdfText(bytes)
  return {
    ids: Array.from(text.matchAll(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi)).map(
      (match) => match[0]
    ),
    sources: text.includes('server') ? ['server'] : [],
    signature: bytes.subarray(0, 4).toString('ascii'),
    text,
  }
}
const roleInput = (role: ManagedRole, permissions = role.permissions) => ({
  roleName: role.roleName,
  roleKey: role.roleKey,
  roleSort: role.roleSort,
  remark: role.remark || '',
  status: role.status,
  permissions,
  expectedRevision: role.revision,
})
const openExports = async (page: Page) => {
  await page.goto('/audit/exports')
  await expect(page.getByTestId('audit-export-page')).toBeVisible()
  await expect(
    page.getByText('来源：server · 投影版本：1', { exact: false })
  ).toBeVisible()
}

test('real audit exports capture the complete matching set and produce scanned CSV, XLSX and PDF bytes with lifecycle commands', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(420000)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const actorContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()
  const actorPage = await actorContext.newPage()
  const roleIds: string[] = []
  const jobIds: string[] = []
  let actorUserId: string | undefined
  let api: ReturnType<typeof caller> | undefined
  let primaryError: unknown
  try {
    await login(page, 'a-admin')
    api = caller(request, await tokenOf(page))
    const suffix = randomUUID().slice(0, 8)
    const actorName = `审计导出操作者-${suffix}`
    const actorUsername = `audit-export-actor-${suffix}`
    const actorPassword = 'Audit-export-actor-2026'
    const actorUser = await api.call<{ id: string; revision: number }>(
      '/system/users',
      'POST',
      {
        username: actorUsername,
        name: actorName,
        phone: '',
        email: '',
        initialPassword: actorPassword,
        status: 'enabled',
      }
    )
    actorUserId = actorUser.id
    const actorRole = await api.call<ManagedRole>('/system/roles', 'POST', {
      roleName: `审计导出操作者角色-${suffix}`,
      roleKey: `audit-export-actor-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions: [
        'audit:read',
        'system:role:create',
        'system:role:update',
        'system:role:permissions',
      ],
    })
    roleIds.push(actorRole.id)
    await api.call(`/system/users/${actorUser.id}/authorization`, 'POST', {
      roleIds: [actorRole.id],
      directPermissions: [],
      expectedRevision: actorUser.revision,
    })
    await login(actorPage, actorUsername, actorPassword)
    const actorApi = caller(request, await tokenOf(actorPage))
    for (let index = 0; index < 12; index += 1) {
      const role = await actorApi.call<ManagedRole>('/system/roles', 'POST', {
        roleName: `审计导出全量-${suffix}-${index}`,
        roleKey: `audit-export-${suffix}-${index}`,
        roleSort: index,
        remark: '',
        status: 'enabled',
        permissions: ['audit:read'],
      })
      roleIds.push(role.id)
      await actorApi.call(`/system/roles/${role.id}`, 'PUT', {
        ...roleInput(role),
        remark: `产生第二条真实事实-${index}`,
      })
    }
    const capability = await api.call<{
      formats: {
        format: 'csv' | 'xlsx' | 'pdf'
        available: boolean
        reason: string | null
      }[]
    }>('/audit/export-capabilities')
    expect(capability.formats.map((item) => item.format).sort()).toEqual([
      'csv',
      'pdf',
      'xlsx',
    ])
    expect(capability.formats.every((item) => item.available)).toBe(true)
    const expectedIds: string[] = []
    let auditPage = 1
    let auditTotal = 0
    do {
      const params = new URLSearchParams({
        version: '1',
        current: String(auditPage),
        pageSize: '100',
        module: 'system',
        operatorName: actorName,
        timeZone: 'Asia/Shanghai',
      })
      const result = await api.call<{
        list: { id: string }[]
        total: number
      }>(`/audit/events?${params}`)
      auditTotal = result.total
      expectedIds.push(...result.list.map((item) => item.id))
      auditPage += 1
    } while (expectedIds.length < auditTotal)
    expect(expectedIds.length).toBe(auditTotal)
    expect(expectedIds.length).toBeGreaterThan(20)
    expect(expectedIds.length).toBeLessThanOrEqual(2000)

    await openExports(page)
    await page.getByTestId('audit-export-module').fill('system')
    await page.getByTestId('audit-export-operator').fill(actorName)
    const savedUrl = page.waitForURL(
      (url) =>
        url.searchParams.get('module') === 'system' &&
        url.searchParams.get('operatorName') === actorName
    )
    await page.getByTestId('audit-export-save-query').click()
    await savedUrl
    await page.reload()
    await expect(page.getByTestId('audit-export-module')).toHaveValue('system')
    await expect(page.getByTestId('audit-export-operator')).toHaveValue(
      actorName
    )
    await expect(page.getByTestId('audit-export-page')).toBeVisible()

    const downloaded: Record<string, unknown>[] = []
    for (const format of ['csv', 'xlsx', 'pdf'] as const) {
      await page.getByTestId('audit-export-format').selectOption(format)
      const createdResponse = waitResponse(page, '/audit/exports', 'POST')
      await page.getByTestId('audit-export-create').click()
      const created = await createdAuditExport(
        await createdResponse,
        `${format} audit export creation`
      )
      jobIds.push(created.id)
      const card = page.getByTestId(`audit-export-job-${created.id}`)
      await expect(card).toContainText('已完成', { timeout: 120000 })
      await card.locator('.audit-exports__inspect').click()
      await expect(page.getByTestId('audit-export-detail')).toContainText(
        '服务器任务详情'
      )
      const job = await api.call<AuditExportJobV1>(
        `/audit/exports/${encodeURIComponent(created.id)}`
      )
      expect(job.totalRows).toBeGreaterThan(20)
      expect(job.artifact?.scanEngine).toMatch(/^ClamAV /)
      expect(job.artifact?.format).toBe(format)
      const byteResponse = waitResponse(
        page,
        `/audit/exports/${created.id}/download`,
        'GET'
      )
      const downloadEvent = page.waitForEvent('download')
      await card.getByTestId(`audit-export-download-${created.id}`).click()
      const [response, download] = await Promise.all([
        byteResponse,
        downloadEvent,
      ])
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain(
        String(job.artifact?.mimeType).split(';')[0]
      )
      const responseBytes = await response.body()
      const downloadPath = testInfo.outputPath(`${format}-${created.id}`)
      await download.saveAs(downloadPath)
      const bytes = await readFile(downloadPath)
      expect(bytes.length).toBe(job.artifact?.size)
      expect(job.totalRows).toBe(expectedIds.length)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        job.artifact?.sha256
      )
      if (format === 'csv') {
        const bom = Buffer.from([0xef, 0xbb, 0xbf])
        expect(bytes.subarray(0, bom.length).equals(bom)).toBe(true)
        const normalizedResponse = responseBytes
          .subarray(0, bom.length)
          .equals(bom)
          ? responseBytes
          : Buffer.concat([bom, responseBytes])
        expect(normalizedResponse.equals(bytes)).toBe(true)
        expect([0, bom.length]).toContain(bytes.length - responseBytes.length)
      } else expect(responseBytes.equals(bytes)).toBe(true)
      const facts = await exportedFacts(format, bytes)
      if (format === 'pdf') {
        const compactPdfText = facts.text.replace(/\s+/gu, '')
        expect(compactPdfText).toContain('授权审计事实')
        expectedIds.forEach((id) => expect(compactPdfText).toContain(id))
        expect(facts.signature).toBe('%PDF')
      } else expect([...facts.ids].sort()).toEqual([...expectedIds].sort())
      expect(facts.sources.every((source) => source === 'server')).toBe(true)
      expect(facts.sources.length).toBeGreaterThan(0)
      downloaded.push({
        id: created.id,
        format,
        totalRows: job.totalRows,
        bytes: bytes.length,
        responseBodyBytes: responseBytes.length,
        sha256: job.artifact?.sha256,
        mimeType: job.artifact?.mimeType,
      })
      const archiveResponse = waitResponse(
        page,
        `/audit/exports/${created.id}/archive`,
        'POST'
      )
      await card.getByTestId(`audit-export-archive-${created.id}`).click()
      expect((await archiveResponse).status()).toBe(200)
      await expect(
        card.getByTestId(`audit-export-unarchive-${created.id}`)
      ).toBeVisible()
      const unarchiveResponse = waitResponse(
        page,
        `/audit/exports/${created.id}/archive`,
        'POST'
      )
      await card.getByTestId(`audit-export-unarchive-${created.id}`).click()
      expect((await unarchiveResponse).status()).toBe(200)
    }

    await page.getByTestId('audit-export-module').fill('future-module')
    await page.getByTestId('audit-export-format').selectOption('csv')
    const zeroUrl = page.waitForURL(/module=future-module/)
    await page.getByTestId('audit-export-save-query').click()
    await zeroUrl
    const zeroCreated = waitResponse(page, '/audit/exports', 'POST')
    await page.getByTestId('audit-export-create').click()
    const zeroJob = await createdAuditExport(
      await zeroCreated,
      'zero-row audit export creation'
    )
    jobIds.push(zeroJob.id)
    await expect(
      page.getByTestId(`audit-export-job-${zeroJob.id}`)
    ).toContainText('已完成', { timeout: 120000 })
    const zero = await api.call<AuditExportJobV1>(
      `/audit/exports/${zeroJob.id}`
    )
    expect(zero.totalRows).toBe(0)
    const zeroBytesResponse = await api.raw(
      `/audit/exports/${zero.id}/download`
    )
    expect(zeroBytesResponse.status()).toBe(200)
    const zeroFacts = await exportedFacts(
      'csv',
      Buffer.from(await zeroBytesResponse.body())
    )
    expect(zeroFacts.ids).toEqual([])
    expect(zeroFacts.signature).toBe('事实ID')

    await attach(testInfo, 'audit-export-artifacts', {
      completeMatchingSetExceedsVisiblePage: true,
      operatorName: actorName,
      expectedFactIds: expectedIds,
      downloaded,
      zeroRowJobId: zero.id,
      capabilities: capability.formats,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (api) {
      for (const id of jobIds) {
        try {
          const job = await api.call<AuditExportJobV1>(`/audit/exports/${id}`)
          if (job.allowedActions.includes('archive'))
            await api.call(`/audit/exports/${id}/archive`, 'POST', {
              version: 1,
              expectedRevision: job.revision,
              archived: true,
            })
        } catch (error) {
          errors.push(error)
        }
      }
      if (actorUserId) {
        try {
          const auth = await api.call<{ revision: number }>(
            `/system/users/${actorUserId}/authorization`
          )
          await api.call(`/system/users/${actorUserId}/authorization`, 'POST', {
            roleIds: [],
            directPermissions: [],
            expectedRevision: auth.revision,
          })
          const actor = await api.call<{ revision: number }>(
            `/system/users/${actorUserId}`
          )
          await api.call(`/system/users/${actorUserId}`, 'DELETE', {
            expectedRevision: actor.revision,
          })
        } catch (error) {
          errors.push(error)
        }
      }
      for (const id of roleIds.reverse()) {
        try {
          const role = await api.call<ManagedRole>(`/system/roles/${id}`)
          await api.call(`/system/roles/${id}`, 'DELETE', {
            expectedRevision: role.revision,
          })
        } catch (error) {
          errors.push(error)
        }
      }
    }
    await Promise.all([context.close(), actorContext.close()])
    if (errors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        '审计导出浏览器验收清理失败'
      )
  }
})

test('audit export metadata remains current-scope, field revocation restricts artifacts, foreign tenant is hidden and transport errors clear old rows', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(300000)
  const contexts: BrowserContext[] = []
  const roleIds: string[] = []
  let userId: string | undefined
  let jobId: string | undefined
  let adminApi: ReturnType<typeof caller> | undefined
  let primaryError: unknown
  try {
    const [adminContext, readerContext, foreignContext] = await Promise.all(
      Array.from({ length: 3 }, () =>
        browser.newContext({ viewport: { width: 1280, height: 800 } })
      )
    )
    contexts.push(adminContext, readerContext, foreignContext)
    const [admin, reader, foreign] = await Promise.all(
      contexts.map((context) => context.newPage())
    )
    await Promise.all([login(admin, 'a-admin'), login(foreign, 'b-admin')])
    adminApi = caller(request, await tokenOf(admin))
    const suffix = randomUUID().slice(0, 8)
    const username = `audit-export-reader-${suffix}`
    const password = 'Audit-export-browser-2026'
    const user = await adminApi.call<{ id: string; revision: number }>(
      '/system/users',
      'POST',
      {
        username,
        name: `审计导出读者-${suffix}`,
        phone: '',
        email: '',
        initialPassword: password,
        status: 'enabled',
      }
    )
    userId = user.id
    const permissions = [
      'audit:read',
      'audit:export:list',
      'audit:export:create',
      'audit:export:archive',
      'audit:export:download',
    ]
    const role = await adminApi.call<ManagedRole>('/system/roles', 'POST', {
      roleName: `审计导出角色-${suffix}`,
      roleKey: `audit-export-reader-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions,
    })
    roleIds.push(role.id)
    const scope = await adminApi.call<{ revision: number }>(
      `/permissions/data-scopes/${role.id}`,
      'PUT',
      {
        dataScope: 'self',
        departmentIds: [],
        fieldPermissions: ['username', 'name'],
        expectedRevision: 1,
      }
    )
    await adminApi.call(`/system/users/${user.id}/authorization`, 'POST', {
      roleIds: [role.id],
      directPermissions: [],
      expectedRevision: user.revision,
    })
    await login(reader, username, password)
    const readerApi = caller(request, await tokenOf(reader))
    await openExports(reader)
    const createdResponse = waitResponse(reader, '/audit/exports', 'POST')
    await reader.getByTestId('audit-export-create').click()
    const created = await createdAuditExport(
      await createdResponse,
      'scoped audit export creation'
    )
    jobId = created.id
    const card = reader.getByTestId(`audit-export-job-${created.id}`)
    await expect(card).toContainText('已完成', { timeout: 120000 })
    await card.locator('.audit-exports__inspect').click()
    const unrestrictedDetail = reader.getByTestId('audit-export-detail')
    await expect(unrestrictedDetail).toContainText('固定筛选')
    await expect(unrestrictedDetail).toContainText('SHA-256')
    expect(
      (
        await caller(request, await tokenOf(foreign), 'tenant-b').raw(
          `/audit/exports/${created.id}`
        )
      ).status()
    ).toBe(404)

    await adminApi.call(`/permissions/data-scopes/${role.id}`, 'PUT', {
      dataScope: 'self',
      departmentIds: [],
      fieldPermissions: ['username'],
      expectedRevision: scope.revision,
    })
    const restrictedRead = waitResponse(reader, '/audit/exports', 'GET')
    await reader.getByTestId('audit-export-refresh').click()
    expect((await restrictedRead).status()).toBe(200)
    await expect(card).toContainText('当前权限不足')
    await expect(reader.getByTestId('audit-export-detail')).toContainText(
      '当前权限不能读取'
    )
    await expect(reader.getByTestId('audit-export-detail')).not.toContainText(
      'SHA-256'
    )
    await expect(
      card.getByTestId(`audit-export-download-${created.id}`)
    ).toHaveCount(0)
    const restricted = await readerApi.call<AuditExportJobV1>(
      `/audit/exports/${created.id}`
    )
    expect(restricted.restricted).toBe(true)
    expect(restricted.query).toBeNull()
    expect(restricted.artifact).toBeNull()

    const pattern = '**/api/audit/exports?*'
    const abortReads = async (route: import('@playwright/test').Route) => {
      if (route.request().method() === 'GET') await route.abort('failed')
      else await route.continue()
    }
    await reader.route(pattern, abortReads)
    await reader.getByTestId('audit-export-refresh').click()
    await expect(reader.getByTestId('audit-export-error')).toBeVisible()
    await expect(reader.locator('.audit-exports__job')).toHaveCount(0)
    await reader.unroute(pattern, abortReads)
    const recovered = waitResponse(reader, '/audit/exports', 'GET')
    await reader.getByTestId('audit-export-refresh').click()
    expect((await recovered).status()).toBe(200)
    await expect(
      reader.getByTestId(`audit-export-job-${created.id}`)
    ).toBeVisible()

    const currentRole = await adminApi.call<ManagedRole>(
      `/system/roles/${role.id}`
    )
    await adminApi.call(`/system/roles/${role.id}`, 'PUT', {
      ...roleInput(currentRole, []),
    })
    await reader.getByTestId('audit-export-refresh').click()
    await expect(reader).toHaveURL(/not-allowed|login/)

    await attach(testInfo, 'audit-export-rights', {
      jobId: created.id,
      foreignStatus: 404,
      fieldRevocationRestricted: true,
      queryAndArtifactHidden: true,
      transportFailureCleared: true,
      realRefreshRecovered: true,
      currentPermissionRevoked: true,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (adminApi && jobId) {
      try {
        const job = await adminApi.call<AuditExportJobV1>(
          `/audit/exports/${jobId}`
        )
        if (job.allowedActions.includes('archive'))
          await adminApi.call(`/audit/exports/${jobId}/archive`, 'POST', {
            version: 1,
            expectedRevision: job.revision,
            archived: true,
          })
      } catch (error) {
        errors.push(error)
      }
    }
    if (adminApi && userId) {
      try {
        const auth = await adminApi.call<{ revision: number }>(
          `/system/users/${userId}/authorization`
        )
        await adminApi.call(`/system/users/${userId}/authorization`, 'POST', {
          roleIds: [],
          directPermissions: [],
          expectedRevision: auth.revision,
        })
        const user = await adminApi.call<{ revision: number }>(
          `/system/users/${userId}`
        )
        await adminApi.call(`/system/users/${userId}`, 'DELETE', {
          expectedRevision: user.revision,
        })
      } catch (error) {
        errors.push(error)
      }
      for (const id of roleIds) {
        try {
          const role = await adminApi.call<ManagedRole>(`/system/roles/${id}`)
          await adminApi.call(`/system/roles/${id}`, 'DELETE', {
            expectedRevision: role.revision,
          })
        } catch (error) {
          errors.push(error)
        }
      }
    }
    await Promise.all(contexts.map((context) => context.close()))
    if (errors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        '审计导出权限验收清理失败'
      )
  }
})
