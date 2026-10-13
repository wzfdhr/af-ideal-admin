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
import type {
  AuditArchiveBatchV1,
  AuditArchiveRunV1,
  AuditEventPageV2,
  AuditExportFormat,
  AuditQueryV1,
  AuditRetentionPolicyV1,
  ManagedRole,
} from '@af-admin/contracts'

const apiOrigin = process.env.R1_API_URL || 'http://127.0.0.1:10888'
const governancePermissions = [
  'audit:read',
  'audit:retention:manage',
  'audit:export:create',
  'audit:export:archive',
  'audit:export:download',
  'system:role:create',
  'system:role:update',
]
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
  page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname === `/api${path}` && response.request().method() === method
    )
  })
const responseData = async <T>(
  response: Response,
  label: string
): Promise<T> => {
  const body = response.json()
  expect(await response.finished()).toBeNull()
  const payload = await body
  expect(
    response.status(),
    `${label} traceId=${payload?.traceId || 'missing'}`
  ).toBe(200)
  expect(payload?.data, `${label} returned no data`).toBeTruthy()
  return payload.data as T
}
const attach = async (testInfo: TestInfo, name: string, value: unknown) => {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, JSON.stringify(value, null, 2))
  await testInfo.attach(name, { path, contentType: 'application/json' })
}
const roleInput = (role: ManagedRole) => ({
  roleName: role.roleName,
  roleKey: role.roleKey,
  roleSort: role.roleSort,
  remark: role.remark || '',
  status: role.status,
  permissions: role.permissions,
  expectedRevision: role.revision,
})
interface OwnedActor {
  id: string
  username: string
  password: string
  name: string
  roleId: string
  scopeRevision: number
}
const createActor = async (
  admin: ReturnType<typeof caller>,
  suffix: string
): Promise<OwnedActor> => {
  const username = `audit-retention-${suffix}`
  const password = 'Audit-retention-browser-2026'
  const name = `归档执行者-${suffix}`
  const user = await admin.call<{ id: string; revision: number }>(
    '/system/users',
    'POST',
    {
      username,
      name,
      phone: '',
      email: '',
      initialPassword: password,
      status: 'enabled',
    }
  )
  const role = await admin.call<ManagedRole>('/system/roles', 'POST', {
    roleName: `归档执行角色-${suffix}`,
    roleKey: `audit-retention-${suffix}`,
    roleSort: 0,
    remark: '',
    status: 'enabled',
    permissions: governancePermissions,
  })
  const scope = await admin.call<{ revision: number }>(
    `/permissions/data-scopes/${role.id}`,
    'PUT',
    {
      dataScope: 'self',
      departmentIds: [],
      fieldPermissions: ['username', 'name'],
      expectedRevision: 1,
    }
  )
  await admin.call(`/system/users/${user.id}/authorization`, 'POST', {
    roleIds: [role.id],
    directPermissions: [],
    expectedRevision: user.revision,
  })
  return {
    id: user.id,
    username,
    password,
    name,
    roleId: role.id,
    scopeRevision: scope.revision,
  }
}
const cleanupActor = async (
  admin: ReturnType<typeof caller>,
  actor: OwnedActor | undefined,
  factRoleIds: string[]
) => {
  const errors: unknown[] = []
  for (const id of factRoleIds.reverse()) {
    try {
      const role = await admin.call<ManagedRole>(`/system/roles/${id}`)
      await admin.call(`/system/roles/${id}`, 'DELETE', {
        expectedRevision: role.revision,
      })
    } catch (error) {
      errors.push(error)
    }
  }
  if (actor) {
    try {
      const auth = await admin.call<{ revision: number }>(
        `/system/users/${actor.id}/authorization`
      )
      await admin.call(`/system/users/${actor.id}/authorization`, 'POST', {
        roleIds: [],
        directPermissions: [],
        expectedRevision: auth.revision,
      })
      const user = await admin.call<{ revision: number }>(
        `/system/users/${actor.id}`
      )
      await admin.call(`/system/users/${actor.id}`, 'DELETE', {
        expectedRevision: user.revision,
      })
    } catch (error) {
      errors.push(error)
    }
    try {
      const role = await admin.call<ManagedRole>(
        `/system/roles/${actor.roleId}`
      )
      await admin.call(`/system/roles/${actor.roleId}`, 'DELETE', {
        expectedRevision: role.revision,
      })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(errors, '审计归档身份夹具清理失败')
}
const produceFacts = async (
  actor: ReturnType<typeof caller>,
  factRoleIds: string[],
  suffix: string,
  count: number
) => {
  const created: ManagedRole[] = []
  for (let index = 0; index < count; index += 1) {
    const role = await actor.call<ManagedRole>('/system/roles', 'POST', {
      roleName: `归档事实-${suffix}-${index}`,
      roleKey: `archive-fact-${suffix}-${index}`,
      roleSort: index,
      remark: '',
      status: 'enabled',
      permissions: [],
    })
    factRoleIds.push(role.id)
    const updated = await actor.call<ManagedRole>(
      `/system/roles/${role.id}`,
      'PUT',
      { ...roleInput(role), remark: `归档事实更新-${index}` }
    )
    created.push(updated)
  }
  return created
}
const auditQuery = (overrides: Partial<AuditQueryV1> = {}): AuditQueryV1 => ({
  version: 1,
  current: 1,
  pageSize: 100,
  module: 'system',
  eventType: '',
  result: '',
  operatorName: '',
  targetId: '',
  traceId: '',
  from: '',
  to: '',
  timeZone: 'Asia/Shanghai',
  ...overrides,
})
const auditPage = (
  api: ReturnType<typeof caller>,
  query: AuditQueryV1,
  archiveState: 'all' | 'hot' | 'archived'
) => {
  const params = new URLSearchParams(
    Object.entries({ ...query, version: 2, archiveState }).map(
      ([key, value]) => [key, String(value)]
    )
  )
  return api.call<AuditEventPageV2>(`/audit/events?${params}`)
}
const openRetention = async (page: Page) => {
  await page.goto('/audit/retention')
  await expect(page.getByTestId('audit-retention-page')).toBeVisible()
  await expect(
    page.getByText('原始审计事实永久保留', { exact: false })
  ).toBeVisible()
}
const saveRunQuery = async (
  page: Page,
  query: AuditQueryV1,
  format: AuditExportFormat
) => {
  await page.getByTestId('audit-retention-operator').fill(query.operatorName)
  await page.getByTestId('audit-retention-module').fill(query.module)
  await page.getByTestId('audit-retention-target').fill(query.targetId)
  await page.getByTestId('audit-retention-trace').fill(query.traceId)
  await page.getByTestId('audit-retention-format').selectOption(format)
  const expected = page.waitForURL(
    (url) => {
      return (
        (url.searchParams.get('operatorName') || '') === query.operatorName &&
        (url.searchParams.get('module') || '') === query.module &&
        (url.searchParams.get('targetId') || '') === query.targetId &&
        (url.searchParams.get('traceId') || '') === query.traceId &&
        url.searchParams.get('format') === format
      )
    },
    { timeout: 15000 }
  )
  await page
    .getByRole('button', { name: '保存筛选到地址', exact: true })
    .click()
  await expected
}
const createRun = async (page: Page) => {
  const response = waitResponse(page, '/audit/archive-runs', 'POST')
  await page.getByTestId('audit-retention-create').click()
  return responseData<AuditArchiveRunV1>(await response, 'archive run creation')
}
const waitCompleted = async (
  page: Page,
  api: ReturnType<typeof caller>,
  id: string
) => {
  await expect
    .poll(
      async () =>
        (
          await api.call<AuditArchiveRunV1>(`/audit/archive-runs/${id}`)
        ).status,
      {
        timeout: 120000,
      }
    )
    .toBe('completed')
  await page.getByTestId('audit-retention-refresh').click()
  const card = page.getByTestId(`audit-retention-run-${id}`)
  await expect(card).toContainText('已完成')
  await card.locator('.audit-retention__inspect').click()
  await expect(page.getByTestId('audit-retention-detail')).toContainText(id)
}

const csvRows = (bytes: Buffer) => {
  const text = bytes.toString('utf8').replace(/^\uFEFF/u, '')
  const base = text.split('\r\n\r\n').at(-1) || ''
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < base.length; index += 1) {
    const character = base[index]
    if (quoted && character === '"' && base[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') quoted = !quoted
    else if (!quoted && character === ',') {
      row.push(cell)
      cell = ''
    } else if (!quoted && (character === '\r' || character === '\n')) {
      if (character === '\r' && base[index + 1] === '\n') index += 1
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
  const offsets = xref
    .slice(header[0].length)
    .split(/\r?\n/)
    .slice(0, Number(header[1]))
    .map((entry) => Number(entry.slice(0, 10)))
  const objects = new Map<number, { text: string; stream?: string }>()
  for (let index = 1; index < offsets.length; index += 1) {
    const offset = offsets[index]
    if (!Number.isSafeInteger(offset) || offset <= 0) continue
    const end = Math.min(
      xrefOffset,
      ...offsets.filter((value) => value > offset)
    )
    const objectBytes = bytes.subarray(offset, end)
    const text = objectBytes.toString('latin1')
    const marker = text.indexOf('stream\n')
    let stream: string | undefined
    if (marker >= 0) {
      const length = Number(/\/Length\s+(\d+)/.exec(text)?.[1])
      if (!Number.isSafeInteger(length)) throw new Error('PDF流长度无效')
      const raw = objectBytes.subarray(marker + 7, marker + 7 + length)
      stream = /\/Filter\s*\/FlateDecode/.test(text)
        ? inflateSync(raw).toString('latin1')
        : raw.toString('latin1')
    }
    objects.set(index, { text, stream })
  }
  const font = Array.from(objects.values()).find((value) =>
    /\/Subtype\s*\/Type0\b/.test(value.text)
  )
  const cmapId = Number(/\/ToUnicode\s+(\d+) 0 R/.exec(font?.text || '')?.[1])
  const cmap = objects.get(cmapId)?.stream
  if (!cmap) throw new Error('PDF缺少ToUnicode CMap')
  const unicode = new Map<number, string>()
  const decode = (hex: string) =>
    Buffer.from(hex.replaceAll(' ', ''), 'hex').swap16().toString('utf16le')
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const match of block[1].matchAll(/<([0-9a-f]{4})>\s*<([0-9a-f ]+)>/gi))
      unicode.set(Number.parseInt(match[1], 16), decode(match[2]))
  for (const match of cmap.matchAll(
    /<([0-9a-f]{4})>\s*<([0-9a-f]{4})>\s*\[([^\]]*)\]/gi
  )) {
    const first = Number.parseInt(match[1], 16)
    Array.from(match[3].matchAll(/<([0-9a-f ]*)>/gi)).forEach((value, index) =>
      unicode.set(first + index, decode(value[1]))
    )
  }
  const lines: string[] = []
  for (const object of objects.values()) {
    if (!object.stream || !/\bBT\b/.test(object.stream)) continue
    for (const block of object.stream.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
      let line = ''
      for (const match of block[1].matchAll(/<([0-9a-f]+)>/gi))
        for (let index = 0; index < match[1].length; index += 4) {
          const glyph = unicode.get(
            Number.parseInt(match[1].slice(index, index + 4), 16)
          )
          if (glyph === undefined) throw new Error('PDF正文字符缺少Unicode映射')
          line += glyph
        }
      lines.push(line)
    }
  }
  return lines.join('\n')
}
const downloadedFacts = async (format: AuditExportFormat, bytes: Buffer) => {
  if (format === 'csv') {
    const rows = csvRows(bytes)
    return {
      ids: rows.slice(1).map((row) => row[0]),
      sources: rows.slice(1).map((row) => row[14]),
      provenance: bytes.toString('utf8'),
    }
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const facts = workbook.getWorksheet('审计事实')
    const source = workbook.getWorksheet('归档批次来源')
    expect(facts).toBeDefined()
    expect(source?.getCell('B1').text).toContain('archive-batch')
    expect(source?.getCell('B2').value).toBe(2)
    const ids: string[] = []
    const sources: string[] = []
    facts?.eachRow((row, index) => {
      if (index > 1) {
        ids.push(String(row.getCell(1).value || ''))
        sources.push(String(row.getCell(15).value || ''))
      }
    })
    return { ids, sources, provenance: source?.getCell('B1').text || '' }
  }
  const text = pdfText(bytes)
  return {
    ids: Array.from(text.matchAll(/[A-Za-z0-9_-][A-Za-z0-9_.:-]{7,99}/g)).map(
      (match) => match[0]
    ),
    sources: text.includes('server / 1') ? ['server'] : [],
    provenance: text,
  }
}
const downloadFirstBatch = async (
  page: Page,
  api: ReturnType<typeof caller>,
  run: AuditArchiveRunV1,
  format: AuditExportFormat,
  expectedIds: string[],
  testInfo: TestInfo
) => {
  const batches = await api.call<{
    list: AuditArchiveBatchV1[]
    total: number
  }>(`/audit/archive-runs/${run.id}/batches?current=1&pageSize=100`)
  expect(batches.total).toBeGreaterThan(0)
  const batch = batches.list[0]
  expect(batch.producerVersion).toBe(2)
  expect(batch.artifact?.status).toBe('ready')
  expect(batch.artifact?.scanEngine).toMatch(/^ClamAV /)
  expect(batch.artifact?.sha256).toMatch(/^[a-f0-9]{64}$/)
  const response = waitResponse(
    page,
    `/audit/archive-runs/${run.id}/batches/${batch.id}/download`,
    'GET'
  )
  const downloadEvent = page.waitForEvent('download')
  await page.getByTestId(`audit-retention-download-${batch.id}`).click()
  const [http, download] = await Promise.all([response, downloadEvent])
  expect(http.status()).toBe(200)
  expect(http.headers()['content-type']).toContain(
    String(batch.artifact?.mimeType).split(';')[0]
  )
  const path = testInfo.outputPath(`${format}-${run.id}-${batch.id}`)
  await download.saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.length).toBe(batch.artifact?.size)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    batch.artifact?.sha256
  )
  const facts = await downloadedFacts(format, bytes)
  if (format === 'pdf') {
    expect(facts.provenance).toContain('审计逻辑归档批次')
    expect(facts.provenance).toContain('不是原始查询的完整匹配导出')
    expectedIds.forEach((id) => expect(facts.provenance).toContain(id))
  } else expect([...facts.ids].sort()).toEqual([...expectedIds].sort())
  expect(facts.sources.length).toBeGreaterThan(0)
  expect(facts.sources.every((source) => source === 'server')).toBe(true)
  expect(facts.provenance).toContain('archive-batch')
  return {
    runId: run.id,
    batchId: batch.id,
    format,
    size: bytes.length,
    sha256: batch.artifact?.sha256,
  }
}

test('manual logical archives keep all facts queryable, remove only hot membership and download scanned producer-v2 CSV XLSX PDF batches', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(480000)
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const actorContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const adminPage = await adminContext.newPage()
  const actorPage = await actorContext.newPage()
  const factRoleIds: string[] = []
  const runIds: string[] = []
  let actor: OwnedActor | undefined
  let adminApi: ReturnType<typeof caller> | undefined
  let priorPolicy: AuditRetentionPolicyV1 | undefined
  let policyMutated = false
  let primaryError: unknown
  try {
    await login(adminPage, 'a-admin')
    adminApi = caller(request, await tokenOf(adminPage))
    priorPolicy = await adminApi.call<AuditRetentionPolicyV1>(
      '/audit/retention-policy'
    )
    expect(
      priorPolicy.enabled,
      'shared source policy must be disabled before this test mutates it'
    ).toBe(false)
    await openRetention(adminPage)
    await expect(
      adminPage.getByTestId('audit-retention-policy-state')
    ).toBeVisible()
    await expect(
      adminPage.getByTestId('audit-retention-save-policy')
    ).toBeEnabled()
    await adminPage.getByTestId('audit-retention-enabled').check()
    await adminPage.getByTestId('audit-retention-hot-days').fill('1')
    const policySaved = waitResponse(
      adminPage,
      '/audit/retention-policy',
      'PUT'
    )
    await adminPage.getByTestId('audit-retention-save-policy').click()
    expect((await policySaved).status()).toBe(200)
    policyMutated = true
    const enabled = await adminApi.call<AuditRetentionPolicyV1>(
      '/audit/retention-policy'
    )
    expect(enabled.enabled).toBe(true)
    expect(enabled.hotDays).toBe(1)
    expect(enabled.executor?.id).toBe('a-admin')
    await adminPage.reload()
    await expect(adminPage.getByTestId('audit-retention-enabled')).toBeChecked()
    await expect(adminPage.getByTestId('audit-retention-hot-days')).toHaveValue(
      '1'
    )
    await adminPage.getByTestId('audit-retention-enabled').uncheck()
    const policyDisabled = waitResponse(
      adminPage,
      '/audit/retention-policy',
      'PUT'
    )
    await adminPage.getByTestId('audit-retention-save-policy').click()
    expect((await policyDisabled).status()).toBe(200)
    expect(
      (await adminApi.call<AuditRetentionPolicyV1>('/audit/retention-policy'))
        .enabled
    ).toBe(false)

    const suffix = randomUUID().slice(0, 8)
    actor = await createActor(adminApi, suffix)
    await login(actorPage, actor.username, actor.password)
    const actorApi = caller(request, await tokenOf(actorPage))
    await openRetention(actorPage)
    await expect(actorPage.getByTestId('audit-retention-create')).toBeEnabled()
    await actorPage
      .getByRole('button', { name: '保存筛选到地址', exact: true })
      .focus()
    await actorPage.keyboard.press('Tab')
    await expect(actorPage.getByTestId('audit-retention-create')).toBeFocused()

    const artifacts: Record<string, unknown>[] = []
    for (const format of ['csv', 'xlsx', 'pdf'] as const) {
      const roles = await produceFacts(
        actorApi,
        factRoleIds,
        `${suffix}-${format}`,
        format === 'csv' ? 11 : 1
      )
      let query = auditQuery({ operatorName: actor.name })
      if (format === 'xlsx') query = { ...query, targetId: roles[0].id }
      if (format === 'pdf') {
        const facts = await auditPage(actorApi, query, 'hot')
        const newest = facts.list.find((item) => item.target.id === roles[0].id)
        expect(newest).toBeDefined()
        query = { ...query, traceId: newest?.traceId || '' }
      }
      const hotBefore = await auditPage(actorApi, query, 'hot')
      const allBefore = await auditPage(actorApi, query, 'all')
      const expectedIds = hotBefore.list.map((item) => item.id)
      expect(expectedIds.length).toBe({ csv: 22, xlsx: 2, pdf: 1 }[format])
      expect(allBefore.list.map((item) => item.id)).toEqual(expectedIds)
      await saveRunQuery(actorPage, query, format)
      const run = await createRun(actorPage)
      runIds.push(run.id)
      await waitCompleted(actorPage, actorApi, run.id)
      const current = await actorApi.call<AuditArchiveRunV1>(
        `/audit/archive-runs/${run.id}`
      )
      expect(current.coverage.candidateTotal).toBe(expectedIds.length)
      expect(current.coverage.remainingTotal).toBe(0)
      expect((await auditPage(actorApi, query, 'hot')).list).toHaveLength(0)
      expect(
        (await auditPage(actorApi, query, 'archived')).list.map(
          (item) => item.id
        )
      ).toEqual(expectedIds)
      expect(
        (await auditPage(actorApi, query, 'all')).list.map((item) => item.id)
      ).toEqual(expectedIds)
      artifacts.push(
        await downloadFirstBatch(
          actorPage,
          actorApi,
          current,
          format,
          expectedIds,
          testInfo
        )
      )
    }
    const screenshot = testInfo.outputPath('audit-retention-1440.png')
    await actorPage.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach('audit-retention-1440', {
      path: screenshot,
      contentType: 'image/png',
    })
    await attach(testInfo, 'audit-retention-artifacts', {
      runIds,
      artifacts,
      source: 'server',
      producerVersion: 2,
      originalFactsRemainQueryable: true,
      hotMembershipRemoved: true,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (adminApi && policyMutated && priorPolicy) {
      try {
        const current = await adminApi.call<AuditRetentionPolicyV1>(
          '/audit/retention-policy'
        )
        await adminApi.call('/audit/retention-policy', 'PUT', {
          version: 1,
          expectedRevision: current.revision,
          enabled: priorPolicy.enabled,
          hotDays: priorPolicy.hotDays,
          timeZone: priorPolicy.timeZone,
        })
      } catch (error) {
        errors.push(error)
      }
    }
    if (adminApi) {
      try {
        await cleanupActor(adminApi, actor, factRoleIds)
      } catch (error) {
        errors.push(error)
      }
    }
    await Promise.all([adminContext.close(), actorContext.close()])
    if (errors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        '审计逻辑归档正向验收清理失败'
      )
  }
})

test('current retention scope clears selected hashes and batches on field revocation, hides foreign tenants and recovers only after real transport returns', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(300000)
  const contexts: BrowserContext[] = []
  const factRoleIds: string[] = []
  let actor: OwnedActor | undefined
  let runId: string | undefined
  let adminApi: ReturnType<typeof caller> | undefined
  let primaryError: unknown
  try {
    const [adminContext, actorContext, foreignContext] = await Promise.all(
      Array.from({ length: 3 }, () =>
        browser.newContext({ viewport: { width: 1280, height: 800 } })
      )
    )
    contexts.push(adminContext, actorContext, foreignContext)
    const [adminPage, actorPage, foreignPage] = await Promise.all(
      contexts.map((context) => context.newPage())
    )
    await Promise.all([
      login(adminPage, 'a-admin'),
      login(foreignPage, 'b-admin'),
    ])
    adminApi = caller(request, await tokenOf(adminPage))
    actor = await createActor(adminApi, randomUUID().slice(0, 8))
    await login(actorPage, actor.username, actor.password)
    const actorApi = caller(request, await tokenOf(actorPage))
    await produceFacts(actorApi, factRoleIds, randomUUID().slice(0, 8), 2)
    const query = auditQuery({ operatorName: actor.name })
    await openRetention(actorPage)
    await expect(actorPage.getByTestId('audit-retention-create')).toBeEnabled()
    await actorPage
      .getByRole('button', { name: '保存筛选到地址', exact: true })
      .focus()
    await actorPage.keyboard.press('Tab')
    await expect(actorPage.getByTestId('audit-retention-create')).toBeFocused()
    await saveRunQuery(actorPage, query, 'csv')
    const cancelled = await createRun(actorPage)
    const cancelledCard = actorPage.getByTestId(
      `audit-retention-run-${cancelled.id}`
    )
    await expect(
      cancelledCard.getByTestId(`audit-retention-cancel-${cancelled.id}`)
    ).toBeVisible()
    const cancelledResponse = waitResponse(
      actorPage,
      `/audit/archive-runs/${cancelled.id}/cancel`,
      'POST'
    )
    await cancelledCard
      .getByTestId(`audit-retention-cancel-${cancelled.id}`)
      .click()
    expect((await cancelledResponse).status()).toBe(200)
    await expect
      .poll(
        async () =>
          (
            await actorApi.call<AuditArchiveRunV1>(
              `/audit/archive-runs/${cancelled.id}`
            )
          ).status
      )
      .toBe('cancelled')

    const run = await createRun(actorPage)
    runId = run.id
    await waitCompleted(actorPage, actorApi, run.id)
    const detail = actorPage.getByTestId('audit-retention-detail')
    await expect(detail).toContainText('候选摘要')
    await expect(detail).toContainText('ClamAV', { ignoreCase: true })

    const pattern = '**/api/audit/archive-runs?*'
    const abortReads = async (route: import('@playwright/test').Route) => {
      if (route.request().method() === 'GET') await route.abort('failed')
      else await route.continue()
    }
    await actorPage.route(pattern, abortReads)
    await actorPage.getByTestId('audit-retention-refresh').click()
    await expect(actorPage.getByTestId('audit-retention-error')).toBeVisible()
    await expect(actorPage.locator('.audit-retention__run')).toHaveCount(0)
    await expect(actorPage.getByTestId('audit-retention-operator')).toHaveValue(
      actor.name
    )
    await actorPage.unroute(pattern, abortReads)
    const recovered = waitResponse(actorPage, '/audit/archive-runs', 'GET')
    await actorPage.getByTestId('audit-retention-refresh').click()
    expect((await recovered).status()).toBe(200)
    await expect(
      actorPage.getByTestId(`audit-retention-run-${run.id}`)
    ).toBeVisible()

    expect(
      (
        await caller(request, await tokenOf(foreignPage), 'tenant-b').raw(
          `/audit/archive-runs/${run.id}`
        )
      ).status()
    ).toBe(404)

    const scope = await adminApi.call<{ revision: number }>(
      `/permissions/data-scopes/${actor.roleId}`,
      'PUT',
      {
        dataScope: 'self',
        departmentIds: [],
        fieldPermissions: ['username'],
        expectedRevision: actor.scopeRevision,
      }
    )
    await actorPage.getByTestId('audit-retention-refresh').click()
    await expect(actorPage).toHaveURL(/not-allowed/)
    await expect(actorPage.getByText('没有访问权限')).toBeVisible()
    await expect(actorPage.getByTestId('audit-retention-detail')).toHaveCount(0)
    await expect(actorPage.getByText('候选摘要')).toHaveCount(0)
    await expect(actorPage.getByText('ClamAV', { exact: false })).toHaveCount(0)
    const restricted = await actorApi.call<AuditArchiveRunV1>(
      `/audit/archive-runs/${run.id}`
    )
    expect(restricted.restricted).toBe(true)
    expect(restricted.query).toBeNull()
    expect(restricted.candidateHash).toBeNull()

    const screenshot = testInfo.outputPath(
      'audit-retention-restricted-1280.png'
    )
    await actorPage.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach('audit-retention-restricted-1280', {
      path: screenshot,
      contentType: 'image/png',
    })

    const restoredScope = await adminApi.call<{ revision: number }>(
      `/permissions/data-scopes/${actor.roleId}`,
      'PUT',
      {
        dataScope: 'self',
        departmentIds: [],
        fieldPermissions: ['username', 'name'],
        expectedRevision: scope.revision,
      }
    )
    const retryRoles = await produceFacts(
      actorApi,
      factRoleIds,
      randomUUID().slice(0, 8),
      1
    )
    const retryQuery = auditQuery({
      operatorName: actor.name,
      targetId: retryRoles[0].id,
    })
    await openRetention(actorPage)
    await saveRunQuery(actorPage, retryQuery, 'csv')
    const blocked = await createRun(actorPage)
    const blockedScope = await adminApi.call<{ revision: number }>(
      `/permissions/data-scopes/${actor.roleId}`,
      'PUT',
      {
        dataScope: 'self',
        departmentIds: [],
        fieldPermissions: ['username'],
        expectedRevision: restoredScope.revision,
      }
    )
    await expect
      .poll(
        async () =>
          (
            await actorApi.call<AuditArchiveRunV1>(
              `/audit/archive-runs/${blocked.id}`
            )
          ).status,
        { timeout: 120000 }
      )
      .toBe('blocked')
    await adminApi.call(`/permissions/data-scopes/${actor.roleId}`, 'PUT', {
      dataScope: 'self',
      departmentIds: [],
      fieldPermissions: ['username', 'name'],
      expectedRevision: blockedScope.revision,
    })
    await actorPage.goto(
      `/audit/retention?runId=${encodeURIComponent(blocked.id)}`
    )
    await expect(actorPage.getByTestId('audit-retention-page')).toBeVisible()
    const blockedCard = actorPage.getByTestId(
      `audit-retention-run-${blocked.id}`
    )
    await expect(
      blockedCard.getByTestId(`audit-retention-retry-${blocked.id}`)
    ).toBeVisible()
    const retryResponse = waitResponse(
      actorPage,
      `/audit/archive-runs/${blocked.id}/retry`,
      'POST'
    )
    await blockedCard.getByTestId(`audit-retention-retry-${blocked.id}`).click()
    expect((await retryResponse).status()).toBe(200)
    await waitCompleted(actorPage, actorApi, blocked.id)

    const currentRole = await adminApi.call<ManagedRole>(
      `/system/roles/${actor.roleId}`
    )
    await adminApi.call(`/system/roles/${actor.roleId}`, 'PUT', {
      ...roleInput(currentRole),
      permissions: [],
    })
    await actorPage.getByTestId('audit-retention-refresh').click()
    await expect(actorPage).toHaveURL(/not-allowed|login/)
    const denied = await actorApi.raw(
      '/audit/archive-runs?current=1&pageSize=20'
    )
    expect(denied.status()).toBe(403)
    await attach(testInfo, 'audit-retention-scope', {
      runId,
      foreignStatus: 404,
      transportFailureCleared: true,
      realRefreshRecovered: true,
      fieldRevocationClearedPrivateFacts: true,
      currentPermissionRevoked: true,
      cancelRunId: cancelled.id,
      retryRunId: blocked.id,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (adminApi) {
      try {
        await cleanupActor(adminApi, actor, factRoleIds)
      } catch (error) {
        errors.push(error)
      }
    }
    await Promise.all(contexts.map((context) => context.close()))
    if (errors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        '审计逻辑归档权限验收清理失败'
      )
  }
})
