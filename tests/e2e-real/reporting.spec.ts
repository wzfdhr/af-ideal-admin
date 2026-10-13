import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { APIRequestContext, Page, Response } from '@playwright/test'
import type {
  ManagedRole,
  ReportingDefinitionRecord,
  ReportingQueryResultV1,
  ReportingQueryV1,
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
const caller = (
  request: APIRequestContext,
  token: string,
  tenantId = 'tenant-a'
) => {
  const raw = (endpoint: string, method?: string, data?: unknown) =>
    request.fetch(`${apiUrl}/api${endpoint}`, {
      method: method || 'GET',
      headers: {
        'x-access-token': token,
        'x-tenant-id': tenantId,
        'idempotency-key': randomUUID(),
      },
      ...(data === undefined ? {} : { data }),
    })
  const call = async <T>(
    endpoint: string,
    method?: string,
    data?: unknown
  ): Promise<T> => {
    const response = await raw(endpoint, method, data)
    expect(response.status(), `${method || 'GET'} ${endpoint}`).toBe(200)
    return (await response.json()).data as T
  }
  return { raw, call }
}
const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem('token') || '')
const responseAt = (page: Page, endpoint: string, method: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${endpoint}` &&
      response.request().method() === method
  )
const dataOf = async <T>(response: Response): Promise<T> => {
  expect(response.status(), response.url()).toBe(200)
  return (await response.json()).data as T
}
const command = async <T>(
  page: Page,
  testId: string,
  endpoint: string,
  method = 'POST',
  confirmation = true
) => {
  const response = responseAt(page, endpoint, method)
  await page.getByTestId(testId).click()
  if (confirmation) {
    const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
    await dialog.getByRole('button', { name: '确认', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog).not.toBeVisible()
  }
  return dataOf<T>(await response)
}
interface ApplicationFixture {
  id: string
  revision: number
  name: string
  formDraftId: string
  workflowDraftId: string
  activeReleaseId: string | null
  status: string
}
interface ReleaseFixture {
  id: string
  releaseVersion: number
}
const publishSource = async (
  call: ReturnType<typeof caller>['call'],
  app: ApplicationFixture
) => {
  const form = await call<{ id: string; revision: number }>(
    `/form-schemas/${app.formDraftId}`
  )
  const workflow = await call<{ id: string; revision: number }>(
    `/workflows/${app.workflowDraftId}`
  )
  return call<ReleaseFixture>(`/applications/${app.id}/releases`, 'POST', {
    formDraftId: form.id,
    workflowDraftId: workflow.id,
    formRevision: form.revision,
    workflowRevision: workflow.revision,
    expectedRevision: app.revision,
  })
}
const createRecord = (
  call: ReturnType<typeof caller>['call'],
  releaseId: string,
  name: string
) =>
  call<{ id: string; revision: number }>('/business/records', 'POST', {
    applicationReleaseId: releaseId,
    fields: {
      itemName: name,
      quantity: 1,
      unitPrice: '1.00',
      reason: 'FP025真实授权报表验收',
    },
  })
const queryPage = async (
  page: Page,
  versionId: string,
  from: string,
  to: string
) => {
  await page.getByTestId('reporting-query-version').selectOption(versionId)
  await expect(page.getByTestId('reporting-query-from')).toBeEnabled()
  await page.getByTestId('reporting-query-from').fill(from)
  await page.getByTestId('reporting-query-to').fill(to)
  const response = responseAt(
    page,
    `/reporting/versions/${versionId}/query`,
    'POST'
  )
  await page.getByTestId('reporting-query-submit').click()
  return dataOf<ReportingQueryResultV1>(await response)
}

test('real reporting saves and reopens controlled configuration, three published views query the fixed source and field revocation prevents filtering or data leakage across accounts and tenants', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000)
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 1280, height: 800 } })
    )
  )
  const [admin, employee, foreign, limited] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  ;[admin, employee, foreign, limited].forEach((page) =>
    page.on('dialog', (dialog) => dialog.accept())
  )
  const suffix = randomUUID().slice(0, 8)
  const reportName = `真实报表-${suffix}`
  const username = `report-reader-${suffix}`
  const password = 'Report-reader-browser-2026'
  const year = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(new Date())
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  let adminApi: ReturnType<typeof caller> | undefined
  let appId: string | undefined
  let reportId: string | undefined
  let memberId: string | undefined
  let roleId: string | undefined
  const facts: Record<string, unknown> = {}
  try {
    await login(admin, 'a-admin')
    await login(employee, 'a-employee')
    await login(foreign, 'b-admin')
    adminApi = caller(request, await tokenOf(admin))
    const employeeApi = caller(request, await tokenOf(employee))
    const foreignApi = caller(request, await tokenOf(foreign), 'tenant-b')
    const baseline = await adminApi.call<{
      revision: number
      activeReleaseId: string
    }>('/applications/leave')
    expect(baseline.activeReleaseId).toBeTruthy()
    const app = await adminApi.call<ApplicationFixture>(
      '/application-center',
      'POST',
      {
        name: `000 FP025受控来源-${suffix}`,
        code: `report-${suffix}`,
        template: 'equipment',
      }
    )
    appId = app.id
    const release = await publishSource(adminApi.call, app)
    const employeeRecords = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createRecord(
          employeeApi.call,
          release.id,
          `员工设备-${suffix}-${index + 1}`
        )
      )
    )
    await createRecord(adminApi.call, release.id, `管理员独有-${suffix}`)
    const catalogue = (
      await adminApi.call<ReportingSourceCataloguePage>(
        `/reporting/sources?current=1&pageSize=1&applicationId=${encodeURIComponent(
          app.id
        )}`
      )
    ).list.find((source) => source.source.applicationId === app.id)
    expect(catalogue).toBeDefined()
    const equipment = catalogue?.visibleFields.find(
      (field) => field.label === '设备名称'
    )
    expect(equipment).toBeDefined()
    const businessKey = equipment
      ? `${equipment.reference.kind}:${equipment.reference.id}`
      : ''
    facts.source = { appId: app.id, release, employeeRecords }

    await admin.goto('/visualization/reportCenter')
    await expect(admin.getByTestId('real-report-center')).toBeVisible()
    await admin.getByTestId('reporting-definition-new').click()
    await admin.getByTestId('reporting-definition-name').fill(reportName)
    await admin.getByTestId('reporting-definition-name').focus()
    await admin.keyboard.press('Tab')
    await expect(admin.getByTestId('reporting-source-keyword')).toBeFocused()
    await admin.getByTestId('reporting-source-keyword').fill(app.name)
    const sourceSearch = admin.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/reporting/sources' &&
        response.request().method() === 'GET' &&
        new URL(response.url()).searchParams.get('keyword') === app.name
    )
    await admin.getByTestId('reporting-source-keyword').press('Enter')
    const foundSources = await dataOf<ReportingSourceCataloguePage>(
      await sourceSearch
    )
    expect(
      foundSources.list.some((source) => source.source.applicationId === app.id)
    ).toBe(true)
    await admin.getByTestId('reporting-definition-source').selectOption(app.id)
    await admin
      .getByTestId('reporting-definition-timezone')
      .fill('Asia/Shanghai')
    await admin.getByTestId('reporting-template-kind').selectOption('trend')
    await admin.getByTestId('reporting-template-apply').click()
    await admin
      .getByTestId('reporting-draft-field-metadata:applicantName')
      .check()
    await admin.getByTestId(`reporting-draft-field-${businessKey}`).check()
    await admin.route(
      '**/api/reporting/definitions',
      (route) =>
        route.request().method() === 'POST'
          ? route.abort('failed')
          : route.continue(),
      { times: 1 }
    )
    await admin.getByTestId('reporting-definition-save').click()
    await expect(admin.getByTestId('reporting-error')).toBeVisible()
    await expect(admin.getByTestId('reporting-definition-name')).toHaveValue(
      reportName
    )
    const saved = await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-save',
      '/reporting/definitions',
      'POST',
      false
    )
    reportId = saved.id
    await admin.reload()
    await admin.getByTestId('reporting-definition-keyword').fill(reportName)
    await admin.getByRole('button', { name: '查询配置', exact: true }).click()
    await admin.getByTestId(`reporting-definition-${saved.id}`).click()
    await expect(admin.getByTestId('reporting-definition-name')).toHaveValue(
      reportName
    )
    await expect(
      admin.getByTestId('reporting-definition-timezone')
    ).toHaveValue('Asia/Shanghai')
    await expect(
      admin.getByTestId(`reporting-draft-field-${businessKey}`)
    ).toBeChecked()
    const first = await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-publish',
      `/reporting/definitions/${saved.id}/publish`
    )
    const trendId = first.activeVersionId || ''
    expect(trendId).toBeTruthy()
    await admin
      .getByTestId('reporting-definition-kind')
      .selectOption('distribution')
    await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-save',
      `/reporting/definitions/${saved.id}`,
      'PUT',
      false
    )
    const second = await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-publish',
      `/reporting/definitions/${saved.id}/publish`
    )
    const distributionId = second.activeVersionId || ''
    await admin.getByTestId('reporting-definition-kind').selectOption('detail')
    await admin.getByTestId('reporting-draft-field-metadata:id').check()
    await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-save',
      `/reporting/definitions/${saved.id}`,
      'PUT',
      false
    )
    const third = await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-publish',
      `/reporting/definitions/${saved.id}/publish`
    )
    const detailId = third.activeVersionId || ''
    expect(third.versions).toHaveLength(3)
    expect(
      third.versions?.every((version) => version.sourceReleaseId === release.id)
    ).toBe(true)
    await expect(
      admin.getByTestId('reporting-version-comparison')
    ).toContainText('固定来源')
    facts.published = third

    const privateReads: string[] = []
    employee.on('request', (value) => {
      const path = new URL(value.url()).pathname
      if (
        value.method() === 'GET' &&
        (path === '/api/reporting/definitions' ||
          path === `/api/reporting/definitions/${saved.id}` ||
          path === '/api/reporting/sources')
      )
        privateReads.push(path)
    })
    await employee.goto('/visualization/reportCenter')
    await expect(employee.getByTestId('real-report-center')).toBeVisible()
    await expect(employee.getByTestId('reporting-definition-new')).toHaveCount(
      0
    )
    await employee.getByTestId('reporting-published-keyword').fill(reportName)
    await employee
      .getByRole('button', { name: '查询发布库', exact: true })
      .click()
    const trend = await queryPage(employee, trendId, from, to)
    expect(trend).toMatchObject({
      kind: 'trend',
      total: 12,
      sourceReleaseId: release.id,
      releaseScope: 'fixed-published-source',
      timeZone: 'Asia/Shanghai',
      factTime: 'createdAt',
      metric: 'count',
    })
    expect(trend.trend.reduce((total, point) => total + point.count, 0)).toBe(
      12
    )
    await expect(employee.getByTestId('reporting-result-trend')).toBeVisible()
    await employee.evaluate(() => window.scrollTo(0, 0))
    await employee.screenshot({
      path: testInfo.outputPath('reporting-trend-1280.png'),
      fullPage: true,
    })
    const distribution = await queryPage(employee, distributionId, from, to)
    expect(distribution.total).toBe(12)
    expect(
      distribution.distribution.find((value) => value.status === 'draft')?.count
    ).toBe(12)
    await expect(
      employee.getByTestId('reporting-result-distribution')
    ).toContainText('12 条')
    await employee.evaluate(() => window.scrollTo(0, 0))
    await employee.screenshot({
      path: testInfo.outputPath('reporting-distribution-1280.png'),
      fullPage: true,
    })
    const detail = await queryPage(employee, detailId, from, to)
    expect(detail.total).toBe(12)
    expect(detail.rows).toHaveLength(10)
    await expect(employee.getByTestId('reporting-result-detail')).toContainText(
      '共 12 条'
    )
    const nextResponse = responseAt(
      employee,
      `/reporting/versions/${detailId}/query`,
      'POST'
    )
    await employee.getByTestId('reporting-result-next').click()
    const secondPage = await dataOf<ReportingQueryResultV1>(await nextResponse)
    expect(secondPage).toMatchObject({ current: 2, total: 12 })
    expect(secondPage.rows).toHaveLength(2)
    expect(privateReads).toEqual([])
    await expect(employee.getByTestId('report-export')).toHaveCount(0)
    await expect(employee.getByTestId('report-schedule-create')).toHaveCount(0)
    facts.employee = { trend, distribution, detail, secondPage }

    await employee.getByTestId('reporting-query-from').fill(to)
    await employee.getByTestId('reporting-query-to').fill(from)
    await employee.getByTestId('reporting-query-submit').click()
    await expect(employee.getByTestId('reporting-error')).toContainText(
      '日期闭区间'
    )
    await expect(employee.getByTestId('reporting-query-from')).toHaveValue(to)
    await employee.getByTestId('reporting-query-from').fill(from)
    await employee.getByTestId('reporting-query-to').fill(to)
    await employee.route(
      `**/api/reporting/versions/${detailId}/query`,
      (route) => route.abort('failed'),
      { times: 1 }
    )
    await employee.getByTestId('reporting-query-submit').click()
    await expect(employee.getByTestId('reporting-error')).toBeVisible()
    await expect(employee.getByTestId('reporting-query-to')).toHaveValue(to)
    await expect(employee.getByTestId('reporting-result-empty')).toHaveCount(0)
    const recovered = await queryPage(employee, detailId, from, to)
    expect(recovered.total).toBe(12)
    await expect(
      employee.getByText('网络异常，请稍后重试', { exact: true })
    ).toHaveCount(0, { timeout: 10000 })
    await employee.evaluate(() => window.scrollTo(0, 0))
    await employee.screenshot({
      path: testInfo.outputPath('reporting-detail-1280.png'),
      fullPage: true,
    })
    expect(
      await employee.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)

    expect(
      (await foreignApi.raw(`/reporting/definitions/${saved.id}`)).status()
    ).toBe(404)
    expect(
      (
        await foreignApi.raw(`/reporting/versions/${detailId}/catalogue`)
      ).status()
    ).toBe(404)
    await foreign.goto('/visualization/reportCenter')
    await foreign.getByTestId('reporting-published-keyword').fill(reportName)
    await foreign
      .getByRole('button', { name: '查询发布库', exact: true })
      .click()
    await expect(foreign.getByTestId('reporting-query-version')).toHaveCount(0)
    expect((await employeeApi.raw('/reporting/definitions')).status()).toBe(403)

    const member = await adminApi.call<{ id: string; revision: number }>(
      '/system/users',
      'POST',
      {
        username,
        name: `独立报表读者-${suffix}`,
        initialPassword: password,
        phone: '',
        email: '',
        status: 'enabled',
      }
    )
    memberId = member.id
    const permissions = [
      'report:query',
      'report:field:applicant',
      'report:field:business',
      'business:create',
      'business:read:self',
    ]
    const role = await adminApi.call<ManagedRole>('/system/roles', 'POST', {
      roleName: `报表角色-${suffix}`,
      roleKey: `report-role-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions,
    })
    roleId = role.id
    await adminApi.call(`/system/users/${member.id}/authorization`, 'POST', {
      roleIds: [role.id],
      directPermissions: [],
      expectedRevision: member.revision,
    })
    await login(limited, username, password)
    const limitedApi = caller(request, await tokenOf(limited))
    await createRecord(limitedApi.call, release.id, `字段撤权合成值-${suffix}`)
    await limited.goto('/visualization/reportCenter')
    await limited.getByTestId('reporting-published-keyword').fill(reportName)
    await limited
      .getByRole('button', { name: '查询发布库', exact: true })
      .click()
    const own = await queryPage(limited, detailId, from, to)
    expect(own.total).toBe(1)
    await expect(limited.getByTestId('real-reporting-results')).toContainText(
      `字段撤权合成值-${suffix}`
    )
    await limited.getByTestId('reporting-query-keyword').fill('字段撤权')
    await limited.getByTestId(`reporting-search-field-${businessKey}`).check()
    const roleInput = {
      roleName: role.roleName,
      roleKey: role.roleKey,
      roleSort: role.roleSort,
      remark: role.remark || '',
      status: role.status,
      permissions: permissions.filter(
        (value) => value !== 'report:field:business'
      ),
      expectedRevision: role.revision,
    }
    const narrowed = await adminApi.call<ManagedRole>(
      `/system/roles/${role.id}`,
      'PUT',
      roleInput
    )
    await limited.getByTestId('reporting-query-submit').click()
    await expect(limited.getByTestId('reporting-error')).toContainText(
      '当前不可用或未授权'
    )
    await expect(limited.getByTestId('reporting-query-keyword')).toHaveValue(
      '字段撤权'
    )
    await expect(
      limited.getByTestId(`reporting-search-field-${businessKey}`)
    ).toHaveCount(0)
    await expect(limited.getByTestId('real-reporting-results')).toHaveCount(0)
    const forbiddenQuery: ReportingQueryV1 = {
      version: 1,
      timeZone: 'Asia/Shanghai',
      dateRange: { from, to },
      statuses: [],
      keyword: '字段撤权',
      searchFields: equipment ? [equipment.reference] : [],
      sort: { field: { kind: 'metadata', id: 'createdAt' }, direction: 'desc' },
      current: 1,
      pageSize: 10,
    }
    expect(
      (
        await limitedApi.raw(`/reporting/versions/${detailId}/query`, 'POST', {
          query: forbiddenQuery,
        })
      ).status()
    ).toBe(403)
    await limited
      .getByRole('button', { name: '移除这些搜索选择', exact: true })
      .click()
    await limited.getByTestId('reporting-query-keyword').fill('')
    const hidden = await queryPage(limited, detailId, from, to)
    expect(hidden.total).toBe(1)
    expect(
      hidden.hiddenFields.some((field) => field.reference.kind === 'field')
    ).toBe(true)
    await expect(
      limited.getByTestId('real-reporting-results')
    ).not.toContainText(`字段撤权合成值-${suffix}`)
    facts.narrowed = hidden
    await adminApi.call(`/system/roles/${role.id}`, 'PUT', {
      ...roleInput,
      permissions: roleInput.permissions.filter(
        (value) => value !== 'report:query'
      ),
      expectedRevision: narrowed.revision,
    })
    expect(
      (
        await limitedApi.raw(`/reporting/versions/${detailId}/query`, 'POST', {
          query: { ...forbiddenQuery, keyword: '', searchFields: [] },
        })
      ).status()
    ).toBe(403)
    await limited.reload()
    await expect(limited).toHaveURL(/not-allowed/)

    const sourceDraft = await adminApi.call<{
      id: string
      revision: number
      schema: {
        widgetsConfig: { uid: string; config: { label?: string } }[]
        [key: string]: unknown
      }
    }>(`/form-schemas/${app.formDraftId}`)
    const sourceSchema = structuredClone(sourceDraft.schema)
    const renamed = sourceSchema.widgetsConfig.find(
      (widget) => widget.uid === 'itemName'
    )
    expect(renamed).toBeDefined()
    if (renamed) renamed.config.label = '新发布版设备名称'
    await adminApi.call(`/form-schemas/${sourceDraft.id}`, 'PUT', {
      schema: sourceSchema,
      expectedRevision: sourceDraft.revision,
    })
    const activeApp = await adminApi.call<ApplicationFixture>(
      `/application-center/${app.id}`
    )
    const nextRelease = await publishSource(adminApi.call, activeApp)
    expect(nextRelease.id).not.toBe(release.id)
    await createRecord(
      employeeApi.call,
      nextRelease.id,
      `新发布版不得混入-${suffix}`
    )
    const fixed = await queryPage(employee, detailId, from, to)
    expect(fixed.total).toBe(12)
    expect(fixed.sourceReleaseId).toBe(release.id)
    await expect(
      employee.getByTestId('real-reporting-results')
    ).not.toContainText('新发布版不得混入')
    facts.fixedAfterSourceUpgrade = fixed

    await admin.reload()
    await admin.getByTestId('reporting-definition-keyword').fill(reportName)
    await admin.getByRole('button', { name: '查询配置', exact: true }).click()
    await admin.getByTestId(`reporting-definition-${saved.id}`).click()
    const disabled = await command<ReportingDefinitionRecord>(
      admin,
      'reporting-definition-enabled',
      `/reporting/definitions/${saved.id}/enabled`
    )
    expect(disabled.enabled).toBe(false)
    const disabledCatalogue = responseAt(
      employee,
      `/reporting/versions/${detailId}/catalogue`,
      'GET'
    )
    await employee.getByTestId('reporting-query-submit').click()
    const deniedCatalogue = await disabledCatalogue
    expect(deniedCatalogue.status()).toBe(409)
    expect((await deniedCatalogue.json()).businessCode).toBe('REPORT_DISABLED')
    await expect(employee.getByTestId('reporting-error')).toContainText('停用')
    await expect(employee.getByTestId('reporting-query-from')).toHaveValue(from)
    await expect(employee.getByTestId('real-reporting-results')).toHaveCount(0)
    const disabledQuery = await employeeApi.raw(
      `/reporting/versions/${detailId}/query`,
      'POST',
      { query: { ...forbiddenQuery, keyword: '', searchFields: [] } }
    )
    expect(disabledQuery.status()).toBe(409)
    expect((await disabledQuery.json()).businessCode).toBe('REPORT_DISABLED')
    const leaveAfter = await adminApi.call<{
      revision: number
      activeReleaseId: string
    }>('/applications/leave')
    expect({
      revision: leaveAfter.revision,
      activeReleaseId: leaveAfter.activeReleaseId,
    }).toEqual({
      revision: baseline.revision,
      activeReleaseId: baseline.activeReleaseId,
    })
    await testInfo.attach('reporting-server-facts', {
      body: Buffer.from(JSON.stringify(facts, null, 2)),
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
            { expectedRevision: report.revision, enabled: false }
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
            expectedRevision: app.revision,
            status: 'archived',
          })
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  }
})
