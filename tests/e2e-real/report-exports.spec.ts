import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { APIRequestContext, Page } from '@playwright/test'
import type {
  ManagedRole,
  ReportExportFormat,
  ReportingDefinitionRecord,
  ReportingExportJob,
  ReportingQueryResultV1,
  ReportingSourceCataloguePage,
} from '@af-admin/contracts'

const apiUrl = process.env.R1_API_URL || 'http://127.0.0.1:10888'
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
  tenant = 'tenant-a'
) => {
  const raw = (path: string, method?: string, data?: unknown) =>
    request.fetch(`${apiUrl}/api${path}`, {
      method: method || 'GET',
      headers: {
        'x-access-token': token,
        'x-tenant-id': tenant,
        'idempotency-key': randomUUID(),
      },
      ...(data === undefined ? {} : { data }),
    })
  const call = async <T>(
    path: string,
    method?: string,
    data?: unknown
  ): Promise<T> => {
    const response = await raw(path, method, data)
    expect(response.status(), `${method} ${path}`).toBe(200)
    return (await response.json()).data as T
  }
  return { raw, call }
}
const responseAt = (page: Page, path: string, method = 'POST') =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${path}` &&
      response.request().method() === method
  )
interface ApplicationFixture {
  id: string
  revision: number
  formDraftId: string
  workflowDraftId: string
  status: string
}

test('real export UI produces and downloads scanned CSV XLSX PDF from all filtered rows, archives durably and denies stale field access and other tenants', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(300000)
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () =>
      browser.newContext({
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true,
      })
    )
  )
  const [admin, reader, foreign] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const suffix = randomUUID().slice(0, 8)
  const reportName = `真实文件导出-${suffix}`
  const username = `export-reader-${suffix}`
  const password = 'Export-reader-browser-2026'
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const from = `${today.slice(0, 7)}-01`
  let adminApi: ReturnType<typeof caller> | undefined
  let appId = ''
  let reportId = ''
  let memberId = ''
  let roleId = ''
  const jobs: ReportingExportJob[] = []
  try {
    await login(admin, 'a-admin')
    await login(foreign, 'b-admin')
    adminApi = caller(request, await tokenOf(admin))
    const foreignApi = caller(request, await tokenOf(foreign), 'tenant-b')
    const app = await adminApi.call<ApplicationFixture>(
      '/application-center',
      'POST',
      {
        name: `FP026实际来源-${suffix}`,
        code: `export-${suffix}`,
        template: 'equipment',
      }
    )
    appId = app.id
    const form = await adminApi.call<{ id: string; revision: number }>(
      `/form-schemas/${app.formDraftId}`
    )
    const workflow = await adminApi.call<{ id: string; revision: number }>(
      `/workflows/${app.workflowDraftId}`
    )
    const release = await adminApi.call<{ id: string; releaseVersion: number }>(
      `/applications/${app.id}/releases`,
      'POST',
      {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: app.revision,
      }
    )
    const catalogue = (
      await adminApi.call<ReportingSourceCataloguePage>(
        `/reporting/sources?current=1&pageSize=1&applicationId=${encodeURIComponent(
          app.id
        )}`
      )
    ).list[0]
    const equipment = catalogue.visibleFields.find(
      (field) => field.label === '设备名称'
    )
    expect(equipment).toBeDefined()
    if (!equipment) throw new Error('实际登记来源缺少设备名称字段')
    const definition = await adminApi.call<ReportingDefinitionRecord>(
      '/reporting/definitions',
      'POST',
      {
        schema: {
          version: 1,
          name: reportName,
          source: { kind: 'application-records', applicationId: app.id },
          kind: 'detail',
          metric: 'count',
          factTime: 'createdAt',
          timeZone: 'Asia/Shanghai',
          fields: [
            { kind: 'metadata', id: 'id' },
            { kind: 'metadata', id: 'createdAt' },
            { kind: 'metadata', id: 'status' },
            equipment.reference,
          ],
        },
      }
    )
    reportId = definition.id
    const published = await adminApi.call<ReportingDefinitionRecord>(
      `/reporting/definitions/${reportId}/publish`,
      'POST',
      { expectedRevision: definition.revision }
    )
    const versionId = published.activeVersionId
    if (!versionId) throw new Error('真实报表发布未返回固定版本')
    const permissions = [
      'report:query',
      'report:field:business',
      'report:export:list',
      'report:export:create',
      'report:export:cancel',
      'report:export:retry',
      'report:export:archive',
      'report:export:download',
      'business:create',
      'business:read:self',
    ]
    const member = await adminApi.call<{ id: string; revision: number }>(
      '/system/users',
      'POST',
      {
        username,
        name: `文件读者-${suffix}`,
        initialPassword: password,
        phone: '',
        email: '',
        status: 'enabled',
      }
    )
    memberId = member.id
    const role = await adminApi.call<ManagedRole>('/system/roles', 'POST', {
      roleName: `导出角色-${suffix}`,
      roleKey: `export-role-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions,
    })
    roleId = role.id
    await adminApi.call(`/system/users/${memberId}/authorization`, 'POST', {
      roleIds: [roleId],
      directPermissions: [],
      expectedRevision: member.revision,
    })
    await login(reader, username, password)
    const readerApi = caller(request, await tokenOf(reader))
    const recordNames = Array.from(
      { length: 12 },
      (_, index) => `中文设备-${suffix}-${index + 1}`
    )
    await Promise.all(
      recordNames.map((name) =>
        readerApi.call('/business/records', 'POST', {
          applicationReleaseId: release.id,
          fields: {
            itemName: name,
            quantity: 1,
            unitPrice: '12.34',
            reason: '真实文件导出验收',
          },
        })
      )
    )
    await adminApi.call('/business/records', 'POST', {
      applicationReleaseId: release.id,
      fields: {
        itemName: `管理员隔离-${suffix}`,
        quantity: 1,
        unitPrice: '12.34',
        reason: '其他成员记录不可进入文件',
      },
    })

    await reader.goto('/visualization/reportCenter')
    await reader.getByTestId('reporting-published-keyword').fill(reportName)
    await reader
      .getByRole('button', { name: '查询发布库', exact: true })
      .click()
    await reader.getByTestId('reporting-query-version').selectOption(versionId)
    await expect(reader.getByTestId('reporting-query-from')).toBeEnabled()
    await reader.getByTestId('reporting-query-from').fill(from)
    await reader.getByTestId('reporting-query-to').fill(today)
    const queried = responseAt(reader, `/reporting/versions/${versionId}/query`)
    await reader.getByTestId('reporting-query-submit').click()
    const queryFacts = (await (await queried).json())
      .data as ReportingQueryResultV1
    expect(queryFacts.total).toBe(12)
    expect(queryFacts.rows).toHaveLength(10)
    await expect(reader.getByTestId('reporting-export-create')).toContainText(
      '不受当前查询分页限制'
    )
    await expect(reader.getByTestId('reporting-export-submit')).toBeEnabled()

    // An actual transport failure preserves the selected format and current
    // filters. The successful retry still goes to the real server.
    await reader.getByTestId('reporting-export-format').selectOption('xlsx')
    await reader.route(
      '**/api/reporting/exports',
      (route) =>
        route.request().method() === 'POST'
          ? route.abort('failed')
          : route.continue(),
      { times: 1 }
    )
    await reader.getByTestId('reporting-export-submit').click()
    await expect(reader.getByTestId('reporting-export-error')).toBeVisible()
    await expect(reader.getByTestId('reporting-export-format')).toHaveValue(
      'xlsx'
    )
    await expect(reader.getByTestId('reporting-query-from')).toHaveValue(from)
    await (['csv', 'xlsx', 'pdf'] as ReportExportFormat[]).reduce<
      Promise<void>
    >(async (previous, format) => {
      await previous
      await reader.getByTestId('reporting-panel-reports').click()
      await reader.getByTestId('reporting-export-format').selectOption(format)
      const created = responseAt(reader, '/reporting/exports')
      await reader.getByTestId('reporting-export-submit').focus()
      await reader.keyboard.press('Enter')
      const response = await created
      expect(response.status()).toBe(200)
      const queued = (await response.json()).data as ReportingExportJob
      expect(queued.format).toBe(format)
      expect(queued.totalRows).toBe(12)
      await reader.getByTestId('reporting-panel-exports').focus()
      await reader.keyboard.press('Enter')
      let completed = queued
      await expect
        .poll(
          async () => {
            completed = await readerApi.call<ReportingExportJob>(
              `/reporting/exports/${queued.id}`
            )
            return completed.status
          },
          { timeout: 90000, intervals: [500, 1000, 2000] }
        )
        .toBe('completed')
      expect(completed.stage).toBe('completed')
      expect(completed.processedRows).toBe(12)
      expect(completed.artifact?.status).toBe('ready')
      expect(completed.artifact?.scanEngine).toMatch(/ClamAV/i)
      expect(completed.artifact?.sha256).toMatch(/^[0-9a-f]{64}$/)
      const { artifact } = completed
      if (!artifact) throw new Error('完成任务没有真实文件记录')
      jobs.push(completed)
      await reader.getByTestId('reporting-export-refresh').click()
      await expect(
        reader.getByTestId(`reporting-export-download-${completed.id}`)
      ).toBeVisible()
      const downloadPromise = reader.waitForEvent('download')
      await reader
        .getByTestId(`reporting-export-download-${completed.id}`)
        .focus()
      await reader.keyboard.press('Enter')
      const download = await downloadPromise
      expect(download.suggestedFilename()).toBe(artifact.fileName)
      const outputPath = testInfo.outputPath(`actual-report.${format}`)
      await download.saveAs(outputPath)
      const actualBytes = await readFile(outputPath)
      expect(actualBytes.length).toBe(artifact.size)
      expect(createHash('sha256').update(actualBytes).digest('hex')).toBe(
        artifact.sha256
      )
      if (format === 'csv') {
        const actual = actualBytes.toString('utf8')
        recordNames.forEach((name) => expect(actual).toContain(name))
        expect(actual).not.toContain(`管理员隔离-${suffix}`)
      } else if (format === 'xlsx')
        expect(actualBytes.subarray(0, 2).toString()).toBe('PK')
      else expect(actualBytes.subarray(0, 5).toString()).toBe('%PDF-')
      await testInfo.attach(`actual-${format}`, {
        path: outputPath,
        contentType: artifact.mimeType,
      })
      expect(
        (await foreignApi.raw(`/reporting/exports/${completed.id}`)).status()
      ).toBe(404)
      expect(
        (
          await foreignApi.raw(`/reporting/exports/${completed.id}/content`)
        ).status()
      ).toBe(404)
    }, Promise.resolve())
    const archiveJob = jobs[0]
    const archiveArtifact = archiveJob.artifact
    if (!archiveArtifact?.sha256) throw new Error('归档任务没有已扫描文件摘要')
    const archivedResponse = responseAt(
      reader,
      `/reporting/exports/${archiveJob.id}/archive`
    )
    await reader
      .getByTestId(`reporting-export-archive-${archiveJob.id}`)
      .click()
    expect((await (await archivedResponse).json()).data.archivedAt).toBeTruthy()
    await reader
      .getByTestId('reporting-export-archived')
      .selectOption('archived')
    await reader.getByTestId('reporting-export-search').click()
    await expect(
      reader.getByTestId(`reporting-export-unarchive-${archiveJob.id}`)
    ).toBeVisible()
    await reader.reload()
    await reader.getByTestId('reporting-panel-exports').click()
    await reader
      .getByTestId('reporting-export-archived')
      .selectOption('archived')
    await reader.getByTestId('reporting-export-search').click()
    await reader
      .getByTestId(`reporting-export-inspect-${archiveJob.id}`)
      .click()
    await expect(
      reader.getByTestId('reporting-export-fixed-query')
    ).toContainText(from)
    await expect(reader.getByTestId('reporting-export-sha256')).toContainText(
      archiveArtifact.sha256
    )
    await reader.screenshot({
      path: testInfo.outputPath('report-export-jobs-1280.png'),
      fullPage: true,
    })
    expect(
      await reader.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    const unarchive = responseAt(
      reader,
      `/reporting/exports/${archiveJob.id}/archive`
    )
    await reader
      .getByTestId(`reporting-export-unarchive-${archiveJob.id}`)
      .click()
    expect((await (await unarchive).json()).data.archivedAt).toBeNull()

    await adminApi.call(`/system/roles/${roleId}`, 'PUT', {
      roleName: role.roleName,
      roleKey: role.roleKey,
      roleSort: role.roleSort,
      remark: role.remark || '',
      status: role.status,
      permissions: permissions.filter(
        (permission) => permission !== 'report:field:business'
      ),
      expectedRevision: role.revision,
    })
    const restricted = await readerApi.call<ReportingExportJob>(
      `/reporting/exports/${archiveJob.id}`
    )
    expect(restricted.restricted).toBe(true)
    expect(restricted.query).toBeNull()
    expect(restricted.totalRows).toBeNull()
    expect(restricted.artifact?.sha256).toBeNull()
    expect(
      (
        await readerApi.raw(`/reporting/exports/${archiveJob.id}/content`)
      ).status()
    ).toBe(403)
    await reader.getByTestId('reporting-export-archived').selectOption('all')
    await reader.getByTestId('reporting-export-search').click()
    await expect(
      reader.getByTestId(`reporting-export-download-${archiveJob.id}`)
    ).toHaveCount(0)
    await reader
      .getByTestId(`reporting-export-inspect-${archiveJob.id}`)
      .click()
    await expect(
      reader.getByTestId('reporting-export-detail')
    ).not.toContainText(archiveArtifact.sha256)
    await expect(reader.getByTestId('reporting-export-detail')).toContainText(
      '固定筛选当前授权受限'
    )
    await testInfo.attach('real-export-server-facts', {
      body: Buffer.from(
        JSON.stringify(
          { reportId, release, queryFacts, jobs, restricted },
          null,
          2
        )
      ),
      contentType: 'application/json',
    })
  } finally {
    try {
      if (adminApi && reportId) {
        const report = await adminApi.call<ReportingDefinitionRecord>(
          `/reporting/definitions/${reportId}`
        )
        if (report.enabled)
          await adminApi.call(
            `/reporting/definitions/${reportId}/enabled`,
            'POST',
            { enabled: false, expectedRevision: report.revision }
          )
      }
      if (adminApi && memberId) {
        const authorization = await adminApi.call<{ revision: number }>(
          `/system/users/${memberId}/authorization`
        )
        await adminApi.call(`/system/users/${memberId}/authorization`, 'POST', {
          roleIds: [],
          directPermissions: [],
          expectedRevision: authorization.revision,
        })
        const member = await adminApi.call<{ revision: number }>(
          `/system/users/${memberId}`
        )
        await adminApi.call(`/system/users/${memberId}`, 'DELETE', {
          expectedRevision: member.revision,
        })
      }
      if (adminApi && roleId) {
        const role = await adminApi.call<{ revision: number }>(
          `/system/roles/${roleId}`
        )
        await adminApi.call(`/system/roles/${roleId}`, 'DELETE', {
          expectedRevision: role.revision,
        })
      }
      if (adminApi && appId) {
        const app = await adminApi.call<ApplicationFixture>(
          `/application-center/${appId}`
        )
        if (app.status === 'enabled')
          await adminApi.call(`/application-center/${appId}/state`, 'PUT', {
            status: 'archived',
            expectedRevision: app.revision,
          })
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  }
})
