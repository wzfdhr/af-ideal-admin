/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
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
  BusinessRecord,
  DataScreenDetails,
  DataScreenRunResultV1,
  ManagedRole,
} from '@af-admin/contracts'

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

interface Caller {
  call: <T>(
    endpoint: string,
    method?: string,
    body?: unknown,
    key?: string
  ) => Promise<T>
  raw: (
    endpoint: string,
    method?: string,
    body?: unknown,
    key?: string
  ) => Promise<import('@playwright/test').APIResponse>
}
const caller = (
  request: APIRequestContext,
  token: string,
  tenantId = 'tenant-a'
): Caller => {
  const raw = (
    endpoint: string,
    method?: string,
    body?: unknown,
    key?: string
  ) =>
    request.fetch(`${apiOrigin}/api${endpoint}`, {
      method: method || 'GET',
      headers: {
        'x-access-token': token,
        'x-tenant-id': tenantId,
        'idempotency-key': key || randomUUID(),
      },
      ...(body === undefined ? {} : { data: body }),
    })
  const call = async <T>(
    endpoint: string,
    method?: string,
    body?: unknown,
    key?: string
  ): Promise<T> => {
    const response = await raw(endpoint, method, body, key)
    expect(response.status(), `${method || 'GET'} ${endpoint}`).toBe(200)
    return (await response.json()).data as T
  }
  return { raw, call }
}
const responseAt = (page: Page, endpoint: string, method: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${endpoint}` &&
      response.request().method() === method
  )
const responseData = async <T>(response: Response): Promise<T> => {
  expect(response.status(), response.url()).toBe(200)
  return (await response.json()).data as T
}

interface FixtureReport {
  definitionId: string
  versionId: string
  revision: number
}
interface FixtureScreen {
  definitionId: string
  releaseId: string
  revision: number
  contentHash: string
}
interface DemoFixture {
  applicationId: string
  formDraftId: string
  workflowDraftId: string
  sourceReleaseId: string
  sourceReleaseVersion: number
  recordIds: string[]
  expectedCount: number
  fields: {
    reference: { kind: 'metadata' | 'field'; id: string }
    key: string
    label: string
    valueType: string
    coordinateAxis?: 'longitude' | 'latitude'
  }[]
  reports: {
    trend: FixtureReport
    distribution: FixtureReport
    detail: FixtureReport
  }
  screen: FixtureScreen
  verification: {
    sources: {
      sourceKey: string
      total: number
      status: string
      queriedAt: string
      dataCutoffAt: string | null
      resultHash: string
    }[]
  }
}
type DemoFixtures = Record<'operations' | 'sales' | 'equipment', DemoFixture>
interface FixtureLibrary {
  createDataScreenDemoFixtures: (
    call: Caller['call'],
    options: {
      suffix: string
      onProgress: (fixtures: Partial<DemoFixtures>) => Promise<void>
    }
  ) => Promise<DemoFixtures>
  createDataScreenFixtureRecord: (
    call: Caller['call'],
    fixture: DemoFixture,
    options: {
      suffix: string
      coordinateNull?: boolean
    }
  ) => Promise<{ id: string; revision: number }>
  cleanupDataScreenDemoFixtures: (
    call: Caller['call'],
    fixtures: Partial<DemoFixtures>
  ) => Promise<void>
}
const fixtureLibrary = async (): Promise<FixtureLibrary> => {
  // Variable import keeps this E2E compilable while the neutral .mjs helper is
  // consumed directly by Node and intentionally has no browser bundle type.
  const path = '../../scripts/seed-data-screen-demo.mjs'
  return (await import(path)) as FixtureLibrary
}
const layoutHash = (details: DataScreenDetails) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        details.draft.widgets.map((widget) => ({
          id: widget.id,
          kind: widget.kind,
          layout: widget.layout,
        }))
      )
    )
    .digest('hex')

const openScreen = async (page: Page, id: string) => {
  await page.goto('/visualization/dataScreen')
  await expect(page.getByTestId('reference-data-screen')).toBeVisible()
  await page.getByTestId(`screen-definition-${id}`).click()
  await expect(page.getByTestId('screen-canvas')).toBeVisible()
}

const setRoleScope = (
  api: Caller,
  role: ManagedRole,
  dataScope: 'all' | 'self'
) =>
  api.call(`/permissions/data-scopes/${role.id}`, 'PUT', {
    dataScope,
    departmentIds: [],
    fieldPermissions: [],
    expectedRevision: 1,
  })

const updateRolePermissions = async (
  api: Caller,
  roleId: string,
  transform: (permissions: string[]) => string[]
) => {
  const role = await api.call<ManagedRole>(`/system/roles/${roleId}`)
  return api.call<ManagedRole>(`/system/roles/${role.id}`, 'PUT', {
    roleName: role.roleName,
    roleKey: role.roleKey,
    roleSort: role.roleSort,
    remark: role.remark || '',
    status: role.status,
    permissions: transform(role.permissions),
    expectedRevision: role.revision,
  })
}

const cleanupTestOwnedResources = async ({
  api,
  extraScreenIds,
  userId,
  roleIds,
}: {
  api: Caller
  extraScreenIds: string[]
  userId?: string
  roleIds: string[]
}) => {
  for (const id of Array.from(new Set(extraScreenIds))) {
    const screen = await api.call<DataScreenDetails>(
      `/data-screens/definitions/${encodeURIComponent(id)}`
    )
    if (!screen.archived)
      await api.call(
        `/data-screens/definitions/${encodeURIComponent(id)}/archive`,
        'POST',
        { expectedRevision: screen.revision }
      )
  }
  if (userId) {
    const authorization = await api.call<{ revision: number }>(
      `/system/users/${encodeURIComponent(userId)}/authorization`
    )
    await api.call(
      `/system/users/${encodeURIComponent(userId)}/authorization`,
      'POST',
      {
        roleIds: [],
        directPermissions: [],
        expectedRevision: authorization.revision,
      }
    )
    const member = await api.call<{ revision: number }>(
      `/system/users/${encodeURIComponent(userId)}`
    )
    await api.call(`/system/users/${encodeURIComponent(userId)}`, 'DELETE', {
      expectedRevision: member.revision,
    })
  }
  for (const roleId of roleIds) {
    const role = await api.call<ManagedRole>(
      `/system/roles/${encodeURIComponent(roleId)}`
    )
    await api.call(`/system/roles/${encodeURIComponent(roleId)}`, 'DELETE', {
      expectedRevision: role.revision,
    })
  }
}

const attachFacts = async (
  testInfo: TestInfo,
  facts: Record<string, unknown>
) => {
  const path = testInfo.outputPath('data-screens-server-facts.json')
  await writeFile(path, JSON.stringify(facts, null, 2))
  await testInfo.attach('data-screens-server-facts', {
    path,
    contentType: 'application/json',
  })
}

const cleanupOwnedRecords = async (api: Caller, recordIds: string[]) => {
  for (const id of Array.from(new Set(recordIds))) {
    const record = await api.call<BusinessRecord>(
      `/business/records/${encodeURIComponent(id)}`
    )
    if (record.status === 'running')
      await api.call(
        `/business/records/${encodeURIComponent(id)}/withdraw`,
        'POST',
        {
          expectedRevision: record.revision,
          comment: 'FP028/029真实浏览器验收结束，当前观看者撤回自己的流程',
        }
      )
  }
}

const detachReaderRecords = (
  fixtures: Partial<DemoFixtures>,
  recordIds: string[]
) => {
  const owned = new Set(recordIds)
  Object.values(fixtures).forEach((fixture) => {
    if (fixture)
      fixture.recordIds = fixture.recordIds.filter((id) => !owned.has(id))
  })
}

const throwCleanupFailures = (
  primaryError: unknown,
  cleanupErrors: unknown[]
) => {
  if (!cleanupErrors.length) return
  throw new AggregateError(
    primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
    primaryError ? '真实大屏主流程与精确清理均失败' : '真实大屏精确清理失败'
  )
}

test('real data screens bind three independent templates, persist canvas editing and preserve immutable release operations', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(420000)
  const contexts: BrowserContext[] = []
  const progress: Partial<DemoFixtures> = {}
  const extraScreenIds: string[] = []
  let adminApi: Caller | undefined
  let fixtures: DemoFixtures | undefined
  let library: FixtureLibrary | undefined
  let baseline: { revision: number; activeReleaseId: string | null } | undefined
  let primaryError: unknown
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    contexts.push(context)
    const admin = await context.newPage()
    await login(admin, 'a-admin')
    adminApi = caller(request, await tokenOf(admin))
    baseline = await adminApi.call('/applications/leave')
    library = await fixtureLibrary()
    const suffix = randomUUID().slice(0, 8)
    fixtures = await library.createDataScreenDemoFixtures(adminApi.call, {
      suffix,
      onProgress: async (current) => {
        Object.assign(progress, current)
      },
    })

    await admin.goto('/visualization/dataScreen')
    await expect(admin.getByTestId('reference-data-screen')).toBeVisible()
    for (const key of ['operations', 'sales', 'equipment'] as const) {
      const fixture = fixtures[key]
      await admin.getByTestId('screen-template').selectOption(key)
      await admin
        .getByTestId('screen-binding-trend')
        .selectOption(fixture.reports.trend.versionId)
      await admin
        .getByTestId('screen-binding-distribution')
        .selectOption(fixture.reports.distribution.versionId)
      await admin
        .getByTestId('screen-binding-detail')
        .selectOption(fixture.reports.detail.versionId)
      await admin.getByTestId('screen-apply-template').click()
      await expect(admin.getByTestId('screen-title')).toHaveValue(/大屏$/)
    }

    const fixture = fixtures.operations
    await openScreen(admin, fixture.screen.definitionId)
    const before = await adminApi.call<DataScreenDetails>(
      `/data-screens/definitions/${fixture.screen.definitionId}`
    )
    const target = before.draft.widgets[0]
    await admin.getByTestId(`screen-widget-${target.id}`).click()
    const x = admin.getByTestId('screen-prop-x')
    await x.fill(String(target.layout.x + 16))
    await x.press('Tab')
    await admin.getByTestId('screen-canvas').focus()
    await admin.keyboard.press('ArrowRight')
    const frame = admin.getByTestId(`screen-widget-${target.id}`)
    const box = await frame.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      await admin.mouse.move(box.x + box.width / 2, box.y + 24)
      await admin.mouse.down()
      await admin.mouse.move(box.x + box.width / 2 + 24, box.y + 40)
      await admin.mouse.up()
      const handle = frame.locator('.handle-se')
      const handleBox = await handle.boundingBox()
      expect(handleBox).not.toBeNull()
      if (handleBox) {
        await admin.mouse.move(handleBox.x + 4, handleBox.y + 4)
        await admin.mouse.down()
        await admin.mouse.move(handleBox.x + 28, handleBox.y + 20)
        await admin.mouse.up()
      }
    }
    const savedResponse = responseAt(
      admin,
      `/data-screens/definitions/${fixture.screen.definitionId}`,
      'PUT'
    )
    await admin.getByTestId('screen-save').click()
    const saved = await responseData<DataScreenDetails>(await savedResponse)
    expect(layoutHash(saved)).not.toBe(layoutHash(before))

    await admin.reload()
    await admin
      .getByTestId(`screen-definition-${fixture.screen.definitionId}`)
      .click()
    await admin.getByTestId(`screen-widget-${target.id}`).click()
    const reopened = await adminApi.call<DataScreenDetails>(
      `/data-screens/definitions/${fixture.screen.definitionId}`
    )
    expect(layoutHash(reopened)).toBe(layoutHash(saved))

    const replacement = await context.newPage()
    await admin.close()
    await openScreen(replacement, fixture.screen.definitionId)
    await replacement.getByTestId(`screen-widget-${target.id}`).click()
    await expect(replacement.getByTestId('screen-prop-x')).toHaveValue(
      String(
        reopened.draft.widgets.find((widget) => widget.id === target.id)?.layout
          .x
      )
    )
    const previewResponse = responseAt(
      replacement,
      '/data-screens/preview',
      'POST'
    )
    await replacement.getByTestId('screen-preview').click()
    const preview = await responseData<DataScreenRunResultV1>(
      await previewResponse
    )
    expect(preview).toMatchObject({ releaseId: 'preview', releaseVersion: 0 })
    await expect(replacement.locator('.metric b').first()).toContainText(
      String(fixture.expectedCount)
    )
    const runResponse = responseAt(
      replacement,
      `/data-screens/definitions/${fixture.screen.definitionId}/run`,
      'POST'
    )
    await replacement.getByTestId('screen-run-release').click()
    const run = await responseData<DataScreenRunResultV1>(await runResponse)
    expect(run.releaseId).toBe(fixture.screen.releaseId)
    const tableWidget = replacement.getByTestId('screen-widget-detail')
    const tableControl = tableWidget.getByRole('button', {
      name: /暂停滚动|继续滚动/,
    })
    if ((await tableControl.textContent())?.includes('继续'))
      await tableControl.click()
    await tableWidget
      .getByRole('button', { name: '暂停滚动', exact: true })
      .click()
    await expect(
      tableWidget.getByRole('button', { name: '继续滚动', exact: true })
    ).toBeVisible()
    await expect(replacement.locator('.left-panel')).toBeVisible()
    await expect(replacement.locator('.right-panel')).toBeVisible()
    await replacement.getByTestId('screen-fullscreen').click()
    await expect(replacement.getByTestId('screen-fullscreen')).toContainText(
      '退出全屏'
    )
    await expect(replacement.locator('.left-panel')).toBeHidden()
    await expect(replacement.locator('.right-panel')).toBeHidden()
    await expect(replacement.locator('.stage-toolbar')).toBeHidden()
    expect(
      await replacement.evaluate(
        () =>
          Boolean(document.fullscreenElement) &&
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.documentElement.scrollHeight <= window.innerHeight
      )
    ).toBe(true)
    await replacement.getByTestId('screen-fullscreen').click()
    await expect(replacement.locator('.left-panel')).toBeVisible()
    await expect(replacement.locator('.right-panel')).toBeVisible()
    await expect(replacement.locator('.stage-toolbar')).toBeVisible()

    await replacement.getByTestId('screen-preview').click()
    await replacement.locator('input[type="color"]').fill('#722ED1')
    const publishResponse = responseAt(
      replacement,
      `/data-screens/definitions/${fixture.screen.definitionId}/publish`,
      'POST'
    )
    await replacement.getByTestId('screen-publish').click()
    const published = await responseData<DataScreenDetails>(
      await publishResponse
    )
    expect(published.versions[0].version).toBeGreaterThan(1)
    await replacement
      .getByTestId('screen-rollback-release')
      .selectOption(fixture.screen.releaseId)
    const rollbackResponse = responseAt(
      replacement,
      `/data-screens/definitions/${fixture.screen.definitionId}/rollback`,
      'POST'
    )
    await replacement.getByTestId('screen-rollback').click()
    const rolledBack = await responseData<DataScreenDetails>(
      await rollbackResponse
    )
    expect(rolledBack.activeReleaseId).toBe(fixture.screen.releaseId)
    const copyResponse = responseAt(
      replacement,
      `/data-screens/definitions/${fixture.screen.definitionId}/copy`,
      'POST'
    )
    await replacement.getByTestId('screen-copy').click()
    const copied = await responseData<DataScreenDetails>(await copyResponse)
    extraScreenIds.push(copied.id)
    expect(copied.id).not.toBe(fixture.screen.definitionId)

    await attachFacts(testInfo, {
      fixtureIds: Object.fromEntries(
        Object.entries(fixtures).map(([key, value]) => [
          key,
          {
            applicationId: value.applicationId,
            reportVersionIds: Object.values(value.reports).map(
              (report) => report.versionId
            ),
            screenId: value.screen.definitionId,
          },
        ])
      ),
      persistedLayoutHash: layoutHash(saved),
      reopenedLayoutHash: layoutHash(reopened),
      preview: {
        releaseId: preview.releaseId,
        releaseVersion: preview.releaseVersion,
      },
      run: {
        releaseId: run.releaseId,
        sources: run.sources.map((source) => ({
          sourceKey: source.sourceKey,
          total: source.result?.total,
          status: source.status,
          queriedAt: source.queriedAt,
          dataCutoffAt: source.dataCutoffAt,
        })),
      },
      publishedVersions: published.versions.map((version) => version.version),
      rolledBackReleaseId: rolledBack.activeReleaseId,
      copiedScreenId: copied.id,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanupErrors: unknown[] = []
    if (adminApi)
      try {
        await library?.cleanupDataScreenDemoFixtures(
          adminApi.call,
          fixtures || progress
        )
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (adminApi)
      try {
        await cleanupTestOwnedResources({
          api: adminApi,
          extraScreenIds,
          roleIds: [],
        })
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (adminApi && baseline) {
      try {
        const after = await adminApi.call<{
          revision: number
          activeReleaseId: string | null
        }>('/applications/leave')
        expect(after).toMatchObject(baseline)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await Promise.all(contexts.map((context) => context.close()))
    } catch (error) {
      cleanupErrors.push(error)
    }
    throwCleanupFailures(primaryError, cleanupErrors)
  }
})

test('current viewer polling is self-scoped and clears data for revocation, source archival and cross-tenant reads while network failure is explicitly stale', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(420000)
  const contexts: BrowserContext[] = []
  const progress: Partial<DemoFixtures> = {}
  const extraRecordIds: string[] = []
  const roleIds: string[] = []
  let userId: string | undefined
  let adminApi: Caller | undefined
  let readerApi: Caller | undefined
  let fixtures: DemoFixtures | undefined
  let library: FixtureLibrary | undefined
  let baseline: { revision: number; activeReleaseId: string | null } | undefined
  let primaryError: unknown
  try {
    const [adminContext, employeeContext, foreignContext, readerContext] =
      await Promise.all(
        Array.from({ length: 4 }, () =>
          browser.newContext({ viewport: { width: 1440, height: 900 } })
        )
      )
    contexts.push(adminContext, employeeContext, foreignContext, readerContext)
    const [admin, employee, foreign, reader] = await Promise.all(
      contexts.map((context) => context.newPage())
    )
    await Promise.all([
      login(admin, 'a-admin'),
      login(employee, 'a-employee'),
      login(foreign, 'b-admin'),
    ])
    adminApi = caller(request, await tokenOf(admin))
    const employeeApi = caller(request, await tokenOf(employee))
    const foreignApi = caller(request, await tokenOf(foreign), 'tenant-b')
    expect(
      (await employeeApi.raw('/data-screens/templates')).status()
    ).toBeLessThan(500)
    baseline = await adminApi.call('/applications/leave')
    library = await fixtureLibrary()
    expect(typeof library.createDataScreenFixtureRecord).toBe('function')
    const suffix = randomUUID().slice(0, 8)
    fixtures = await library.createDataScreenDemoFixtures(adminApi.call, {
      suffix,
      onProgress: async (current) => {
        Object.assign(progress, current)
      },
    })
    const { sales } = fixtures
    expect(
      sales.fields.some(
        (field) =>
          field.valueType === 'coordinate' &&
          field.coordinateAxis === 'longitude'
      )
    ).toBe(true)
    expect(
      sales.fields.some(
        (field) =>
          field.valueType === 'coordinate' &&
          field.coordinateAxis === 'latitude'
      )
    ).toBe(true)

    const username = `screen-reader-${suffix}`
    const password = 'Screen-reader-browser-2026'
    const member = await adminApi.call<{ id: string; revision: number }>(
      '/system/users',
      'POST',
      {
        username,
        name: `大屏当前观看者-${suffix}`,
        initialPassword: password,
        phone: '',
        email: '',
        status: 'enabled',
      }
    )
    userId = member.id
    const screenRole = await adminApi.call<ManagedRole>(
      '/system/roles',
      'POST',
      {
        roleName: `大屏运行-${suffix}`,
        roleKey: `screen-run-${suffix}`,
        roleSort: 0,
        remark: '',
        status: 'enabled',
        permissions: [
          'screen:list',
          'screen:run',
          'report:query',
          'report:field:business',
        ],
      }
    )
    roleIds.push(screenRole.id)
    await setRoleScope(adminApi, screenRole, 'all')
    const reportPermissions = [
      'business:create',
      'business:read:self',
      'business:submit',
      'business:withdraw:self',
    ]
    const reportRole = await adminApi.call<ManagedRole>(
      '/system/roles',
      'POST',
      {
        roleName: `大屏本人数据-${suffix}`,
        roleKey: `screen-report-${suffix}`,
        roleSort: 0,
        remark: '',
        status: 'enabled',
        permissions: reportPermissions,
      }
    )
    roleIds.push(reportRole.id)
    await setRoleScope(adminApi, reportRole, 'self')
    await adminApi.call(`/system/users/${member.id}/authorization`, 'POST', {
      roleIds: [screenRole.id, reportRole.id],
      directPermissions: [],
      expectedRevision: member.revision,
    })
    await login(reader, username, password)
    readerApi = caller(request, await tokenOf(reader))

    const first = await library.createDataScreenFixtureRecord(
      readerApi.call,
      sales,
      {
        suffix: `self-${suffix}`,
      }
    )
    extraRecordIds.push(first.id)
    const run = await readerApi.call<DataScreenRunResultV1>(
      `/data-screens/definitions/${sales.screen.definitionId}/run`,
      'POST',
      { releaseId: sales.screen.releaseId }
    )
    expect(run.sources.every((source) => source.result?.total === 1)).toBe(true)
    expect(
      (
        await foreignApi.raw(
          `/data-screens/definitions/${sales.screen.definitionId}`
        )
      ).status()
    ).toBe(404)

    await openScreen(reader, sales.screen.definitionId)
    const runResponse = responseAt(
      reader,
      `/data-screens/definitions/${sales.screen.definitionId}/run`,
      'POST'
    )
    await reader.getByTestId('screen-run-release').click()
    await responseData(await runResponse)
    await expect(reader.locator('.metric b').first()).toHaveText('1')
    const map = reader.locator('[data-kind="map"]')
    await expect(map).toBeVisible()
    await expect(map.locator('.map-point')).toHaveCount(1)

    const nullCoordinate = await library.createDataScreenFixtureRecord(
      readerApi.call,
      sales,
      { suffix: `null-${suffix}`, coordinateNull: true }
    )
    extraRecordIds.push(nullCoordinate.id)
    await expect
      .poll(
        async () =>
          Number(await reader.locator('.metric b').first().textContent()),
        {
          timeout: 25000,
          intervals: [1000],
        }
      )
      .toBe(2)
    await expect(map.locator('.map-point')).toHaveCount(1)

    const validCoordinate = await library.createDataScreenFixtureRecord(
      readerApi.call,
      sales,
      { suffix: `poll-${suffix}` }
    )
    extraRecordIds.push(validCoordinate.id)
    await expect
      .poll(
        async () =>
          Number(await reader.locator('.metric b').first().textContent()),
        {
          timeout: 25000,
          intervals: [1000],
        }
      )
      .toBe(3)
    await expect(map.locator('.map-point')).toHaveCount(2)

    await reader.route(
      `**/api/data-screens/definitions/${sales.screen.definitionId}/run`,
      (route) => route.abort('failed'),
      { times: 1 }
    )
    await reader.getByTestId('screen-refresh').click()
    await expect(reader.locator('.stale').first()).toHaveText('过期')
    await expect(reader.locator('.metric b').first()).toHaveText('3')

    await updateRolePermissions(adminApi, screenRole.id, (permissions) =>
      permissions.filter((permission) => permission !== 'report:field:business')
    )
    await reader.getByTestId('screen-refresh').click()
    await expect(map.locator('.map-point')).toHaveCount(0)
    await expect(map).toContainText('不会生成位置')
    await expect(reader.locator('.metric b').first()).toHaveText('3')

    await updateRolePermissions(adminApi, screenRole.id, (permissions) =>
      Array.from(new Set([...permissions, 'report:field:business']))
    )
    await reader.getByTestId('screen-refresh').click()
    await expect(map.locator('.map-point')).toHaveCount(2)

    await updateRolePermissions(adminApi, screenRole.id, (permissions) =>
      permissions.filter((permission) => permission !== 'report:query')
    )
    await reader.getByTestId('screen-refresh').click()
    await expect(map).toContainText('已清除旧数据')
    await expect(map.locator('.map-point')).toHaveCount(0)
    await expect(reader.locator('.metric b')).toHaveCount(0)
    await updateRolePermissions(adminApi, screenRole.id, (permissions) =>
      Array.from(new Set([...permissions, 'report:query']))
    )
    await reader.getByTestId('screen-refresh').click()
    await expect(map.locator('.map-point')).toHaveCount(2)

    const application = await adminApi.call<{
      id: string
      revision: number
      status: string
    }>(`/application-center/${sales.applicationId}`)
    await adminApi.call(
      `/application-center/${sales.applicationId}/state`,
      'PUT',
      {
        status: 'archived',
        expectedRevision: application.revision,
      }
    )
    await reader.getByTestId('screen-refresh').click()
    await expect(map).toContainText(/来源已停用|来源不可用/)
    await expect(map.locator('.map-point')).toHaveCount(0)

    await attachFacts(testInfo, {
      currentViewer: member.id,
      screenId: sales.screen.definitionId,
      releaseId: sales.screen.releaseId,
      initialSelfTotals: run.sources.map((source) => ({
        sourceKey: source.sourceKey,
        total: source.result?.total,
      })),
      polledRecordIds: [first.id, nullCoordinate.id, validCoordinate.id],
      nullCoordinateDidNotCreatePoint: true,
      tenantBStatus: 404,
      networkState: 'stale-with-last-success',
      fieldRevocationState: 'coordinates-cleared-with-count-retained',
      queryRevocationState: 'rights-cleared',
      archivedSourceState: 'cleared',
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanupErrors: unknown[] = []
    if (readerApi)
      try {
        await cleanupOwnedRecords(readerApi, extraRecordIds)
        detachReaderRecords(fixtures || progress, extraRecordIds)
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (adminApi)
      try {
        await library?.cleanupDataScreenDemoFixtures(
          adminApi.call,
          fixtures || progress
        )
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (adminApi)
      try {
        await cleanupTestOwnedResources({
          api: adminApi,
          extraScreenIds: [],
          userId,
          roleIds,
        })
      } catch (error) {
        cleanupErrors.push(error)
      }
    if (adminApi && baseline) {
      try {
        const after = await adminApi.call<{
          revision: number
          activeReleaseId: string | null
        }>('/applications/leave')
        expect(after).toMatchObject(baseline)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await Promise.all(contexts.map((context) => context.close()))
    } catch (error) {
      cleanupErrors.push(error)
    }
    throwCleanupFailures(primaryError, cleanupErrors)
  }
})
