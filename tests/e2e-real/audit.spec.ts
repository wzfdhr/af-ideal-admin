/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type {
  APIRequestContext,
  BrowserContext,
  Page,
  TestInfo,
} from '@playwright/test'
import type { ManagedRole } from '@af-admin/contracts'

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
const responseData = async <T>(
  response: Awaited<ReturnType<ReturnType<typeof caller>['raw']>>
) => (await response.json()).data as T
const openAudit = async (page: Page) => {
  await page.goto('/audit/logs')
  await expect(page.getByTestId('audit-v1-page')).toBeVisible()
  await expect(
    page.getByText('来源：server · 投影版本：1', { exact: false })
  ).toBeVisible()
}
const waitAuditRead = (page: Page) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/audit/events' &&
      response.request().method() === 'GET'
  )
const queryAudit = async (page: Page) => {
  const response = waitAuditRead(page)
  await page.getByTestId('audit-query').click()
  expect((await response).status()).toBe(200)
  await expect(page.getByTestId('audit-loading')).toHaveCount(0)
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
const attach = async (testInfo: TestInfo, name: string, facts: unknown) => {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, JSON.stringify(facts, null, 2))
  await testInfo.attach(name, { path, contentType: 'application/json' })
}

test('real audit UI uses stable server pagination, exact trace filters and reload-safe one-sided dates', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  const createdRoleIds: string[] = []
  let api: ReturnType<typeof caller> | undefined
  let primaryError: unknown
  try {
    await login(page, 'a-admin')
    api = caller(request, await tokenOf(page))
    const suffix = randomUUID().slice(0, 8)
    let exactTrace = ''
    for (let index = 0; index < 12; index += 1) {
      const response = await api.raw('/system/roles', 'POST', {
        roleName: `审计分页-${suffix}-${index}`,
        roleKey: `audit-page-${suffix}-${index}`,
        roleSort: index,
        remark: '',
        status: 'enabled',
        permissions: ['audit:read'],
      })
      expect(response.status()).toBe(200)
      const envelope = await response.json()
      const role = envelope.data as ManagedRole
      createdRoleIds.push(role.id)
      if (index === 0) exactTrace = envelope.traceId as string
      const updated = await api.call<ManagedRole>(
        `/system/roles/${role.id}`,
        'PUT',
        {
          ...roleInput(role),
          remark: `审计分页更新-${index}`,
        }
      )
      expect(updated.revision).toBeGreaterThan(role.revision)
    }

    await openAudit(page)
    await page.getByTestId('audit-trace').fill(exactTrace)
    await queryAudit(page)
    const traceRows = page.locator('tbody tr')
    await expect(traceRows).toHaveCount(1)
    await expect(traceRows.first()).toContainText(exactTrace)
    await expect(traceRows.first()).toContainText('成功')

    const resetRead = waitAuditRead(page)
    await page.getByTestId('audit-reset').click()
    expect((await resetRead).status()).toBe(200)
    await page.getByTestId('audit-module').fill('system')
    await queryAudit(page)
    const total = Number(
      (await page.locator('.audit-v1__summary b').textContent()) || '0'
    )
    expect(total).toBeGreaterThan(20)
    await expect(page.locator('tbody tr')).toHaveCount(20)
    const nextRead = waitAuditRead(page)
    await page.getByTestId('audit-next').click()
    expect((await nextRead).status()).toBe(200)
    await expect(page.getByText(/第 2 \/ /)).toBeVisible()
    const sizeRead = waitAuditRead(page)
    await page.getByTestId('audit-page-size').selectOption('100')
    expect((await sizeRead).status()).toBe(200)
    await expect(page.getByTestId('audit-loading')).toHaveCount(0)
    expect(await page.locator('tbody tr').count()).toBeLessThanOrEqual(100)

    await page.getByTestId('audit-date-to').fill('2026-10-13')
    await page.getByTestId('audit-date-from').fill('')
    await queryAudit(page)
    expect(page.url()).toContain('to=2026-10-13')
    expect(page.url()).not.toContain('from=')
    await page.reload()
    await expect(page.getByTestId('audit-date-to')).toHaveValue('2026-10-13')
    await expect(page.getByTestId('audit-date-from')).toHaveValue('')
    const persistedUrl = page.url()
    const reopened = await context.newPage()
    await page.close()
    await reopened.goto(persistedUrl)
    await expect(reopened.getByTestId('audit-v1-page')).toBeVisible()
    await expect(reopened.getByTestId('audit-date-to')).toHaveValue(
      '2026-10-13'
    )

    await attach(testInfo, 'audit-pagination-facts', {
      exactTrace,
      generatedRoleFacts: createdRoleIds.length * 2,
      total,
      singleEndedTo: '2026-10-13',
      source: 'server',
      projectionVersion: 1,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const cleanupErrors: unknown[] = []
    if (api) {
      for (const id of createdRoleIds.reverse()) {
        try {
          const role = await api.call<ManagedRole>(`/system/roles/${id}`)
          await api.call(`/system/roles/${id}`, 'DELETE', {
            expectedRevision: role.revision,
          })
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
    }
    await context.close()
    if (cleanupErrors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
        '审计分页验收清理失败'
      )
  }
})

test('real audit UI enforces current member scope and field masking, rejects telemetry forgery and clears results after revocation', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000)
  const contexts: BrowserContext[] = []
  const roleIds: string[] = []
  const userIds: string[] = []
  let adminApi: ReturnType<typeof caller> | undefined
  let departmentId: string | undefined
  let fallbackDepartmentId: string | undefined
  let primaryError: unknown
  try {
    const [adminContext, actorContext, readerContext, foreignContext] =
      await Promise.all(
        Array.from({ length: 4 }, () =>
          browser.newContext({ viewport: { width: 1280, height: 800 } })
        )
      )
    contexts.push(adminContext, actorContext, readerContext, foreignContext)
    const [admin, actor, reader, foreign] = await Promise.all(
      contexts.map((item) => item.newPage())
    )
    await Promise.all([login(admin, 'a-admin'), login(foreign, 'b-admin')])
    adminApi = caller(request, await tokenOf(admin))
    const ownedAdmin = adminApi
    const foreignApi = caller(request, await tokenOf(foreign), 'tenant-b')
    const suffix = randomUUID().slice(0, 8)
    const existingDepartments = await adminApi.call<{
      list: { id: string }[]
    }>('/system/departments?current=1&pageSize=100&keyword=')
    expect(existingDepartments.list.length).toBeGreaterThan(0)
    fallbackDepartmentId = existingDepartments.list[0].id
    const department = await adminApi.call<{ id: string; revision: number }>(
      '/system/departments',
      'POST',
      {
        departmentName: `审计范围-${suffix}`,
        parentId: null,
        leader: '',
        sort: 0,
        status: 'enabled',
      }
    )
    departmentId = department.id
    const makeUser = async (
      kind: string,
      name: string,
      permissions: string[],
      fields: string[]
    ) => {
      const username = `audit-${kind}-${suffix}`
      const password = 'Audit-browser-private-2026'
      const user = await ownedAdmin.call<{ id: string; revision: number }>(
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
      userIds.push(user.id)
      const membership = await ownedAdmin.call<{ revision: number }>(
        `/system/organization-members/${user.id}/assign`,
        'POST',
        {
          departmentId: department.id,
          positionId: null,
          expectedRevision: user.revision,
        }
      )
      const role = await ownedAdmin.call<ManagedRole>('/system/roles', 'POST', {
        roleName: `审计${kind}-${suffix}`,
        roleKey: `audit-${kind}-${suffix}`,
        roleSort: 0,
        remark: '',
        status: 'enabled',
        permissions,
      })
      roleIds.push(role.id)
      const scope = await ownedAdmin.call<{ revision: number }>(
        `/permissions/data-scopes/${role.id}`,
        'PUT',
        {
          dataScope: kind === 'reader' ? 'department' : 'self',
          departmentIds: [],
          fieldPermissions: fields,
          expectedRevision: 1,
        }
      )
      await ownedAdmin.call(`/system/users/${user.id}/authorization`, 'POST', {
        roleIds: [role.id],
        directPermissions: [],
        expectedRevision: membership.revision,
      })
      return {
        ...user,
        username,
        password,
        role,
        scopeRevision: scope.revision,
      }
    }
    const actorUser = await makeUser(
      'actor',
      `Literal%_Operator-${suffix}`,
      ['leave:create', 'leave:read:self', 'leave:update:self'],
      ['username', 'name']
    )
    const readerUser = await makeUser(
      'reader',
      `Audit reader ${suffix}`,
      ['audit:read'],
      ['username', 'name']
    )
    await Promise.all([
      login(actor, actorUser.username, actorUser.password),
      login(reader, readerUser.username, readerUser.password),
    ])
    const actorApi = caller(request, await tokenOf(actor))
    const leave = await actorApi.call<{ activeReleaseId: string }>(
      '/applications/leave'
    )
    const createdResponse = await actorApi.raw('/leave-requests', 'POST', {
      applicationReleaseId: leave.activeReleaseId,
      fields: {
        leaveType: 'personal',
        startDate: '2026-10-13',
        startSlot: 'am',
        endDate: '2026-10-13',
        endSlot: 'pm',
        reason: '审计浏览器合成私有正文不得投影',
      },
    })
    expect(createdResponse.status()).toBe(200)
    const createdEnvelope = await createdResponse.json()
    const successTrace = createdEnvelope.traceId as string

    const deniedResponse = await actorApi.raw(
      `/system/roles/${readerUser.role.id}`,
      'PUT',
      {
        ...roleInput(readerUser.role),
        remark: '无权更新',
      }
    )
    expect(deniedResponse.status()).toBe(403)
    const deniedTrace = (await deniedResponse.json()).traceId as string

    const telemetryResponse = await actorApi.raw('/audit/events', 'POST', {
      source: 'server',
      result: 'success',
      module: 'system',
      traceId: successTrace,
      detail: { password: 'must-not-be-fact' },
    })
    expect(telemetryResponse.status()).toBe(200)
    const telemetryTrace = (await telemetryResponse.json()).traceId as string

    await openAudit(reader)
    await reader.getByTestId('audit-operator').fill('%_Operator')
    await reader.getByTestId('audit-trace').fill(successTrace)
    await queryAudit(reader)
    await expect(reader.locator('tbody tr')).toHaveCount(1)
    await expect(reader.locator('tbody')).toContainText(
      `Literal%_Operator-${suffix}`
    )

    await adminApi.call(
      `/permissions/data-scopes/${readerUser.role.id}`,
      'PUT',
      {
        dataScope: 'department',
        departmentIds: [],
        fieldPermissions: ['username'],
        expectedRevision: readerUser.scopeRevision,
      }
    )
    await reader.getByTestId('audit-operator').fill('')
    await reader.getByTestId('audit-trace').fill(successTrace)
    await queryAudit(reader)
    await expect(reader.locator('tbody')).toContainText(actorUser.id)
    await expect(reader.locator('tbody')).toContainText('操作人字段已隐藏')
    await expect(reader.locator('tbody')).not.toContainText('私有正文')

    await reader.getByTestId('audit-operator').fill('')
    await reader.getByTestId('audit-trace').fill(deniedTrace)
    await queryAudit(reader)
    await expect(reader.locator('tbody tr')).toHaveCount(1)
    await expect(reader.locator('tbody')).toContainText('失败')

    await reader.getByTestId('audit-trace').fill(telemetryTrace)
    await queryAudit(reader)
    await expect(reader.getByTestId('audit-empty')).toBeVisible()
    expect(
      (
        await foreignApi.raw(
          `/audit/events?traceId=${encodeURIComponent(successTrace)}`
        )
      ).status()
    ).toBe(200)
    const foreignFacts = await responseData<{ total: number }>(
      await foreignApi.raw(
        `/audit/events?traceId=${encodeURIComponent(successTrace)}`
      )
    )
    expect(foreignFacts.total).toBe(0)

    const auditEventsPattern = '**/api/audit/events*'
    const abortAuditReads = async (route: import('@playwright/test').Route) => {
      const interceptedRequest = route.request()
      if (
        interceptedRequest.method() === 'GET' &&
        new URL(interceptedRequest.url()).pathname === '/api/audit/events'
      )
        await route.abort('failed')
      else await route.continue()
    }
    await reader.route(auditEventsPattern, abortAuditReads)
    await reader.getByTestId('audit-trace').fill(successTrace)
    await reader.getByTestId('audit-query').click()
    await expect(reader.getByTestId('audit-error')).toBeVisible()
    await expect(reader.locator('tbody tr')).toHaveCount(0)
    await reader.unroute(auditEventsPattern, abortAuditReads)
    const recoveryRead = waitAuditRead(reader)
    await reader.getByTestId('audit-refresh').click()
    expect((await recoveryRead).status()).toBe(200)
    await expect(reader.getByTestId('audit-loading')).toHaveCount(0)
    await expect(reader.locator('tbody tr')).toHaveCount(1)
    await expect(reader.locator('tbody')).toContainText(successTrace)

    const currentRole = await adminApi.call<ManagedRole>(
      `/system/roles/${readerUser.role.id}`
    )
    await adminApi.call(`/system/roles/${currentRole.id}`, 'PUT', {
      ...roleInput(currentRole, []),
    })
    await reader.getByTestId('audit-refresh').click()
    await expect(reader).toHaveURL(/not-allowed|login/)

    await attach(testInfo, 'audit-scope-facts', {
      successTrace,
      deniedTrace,
      telemetryTrace,
      literalOperator: '%_Operator',
      operatorNameMasked: true,
      foreignTotal: 0,
      networkFailureCleared: true,
      realRefreshRecoveredTrace: successTrace,
      currentRevocation: true,
      source: 'server',
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (adminApi) {
      for (const userId of userIds.reverse()) {
        if (!fallbackDepartmentId) {
          errors.push(new Error('缺少可恢复成员组织归属的既有部门'))
        } else
          try {
            const assigned = await adminApi.call<{ revision: number }>(
              `/system/users/${userId}`
            )
            await adminApi.call(
              `/system/organization-members/${userId}/assign`,
              'POST',
              {
                departmentId: fallbackDepartmentId,
                positionId: null,
                expectedRevision: assigned.revision,
              }
            )
            const auth = await adminApi.call<{ revision: number }>(
              `/system/users/${userId}/authorization`
            )
            await adminApi.call(
              `/system/users/${userId}/authorization`,
              'POST',
              {
                roleIds: [],
                directPermissions: [],
                expectedRevision: auth.revision,
              }
            )
            const user = await adminApi.call<{ revision: number }>(
              `/system/users/${userId}`
            )
            await adminApi.call(`/system/users/${userId}`, 'DELETE', {
              expectedRevision: user.revision,
            })
          } catch (error) {
            errors.push(error)
          }
      }
      for (const roleId of roleIds.reverse()) {
        try {
          const role = await adminApi.call<ManagedRole>(
            `/system/roles/${roleId}`
          )
          await adminApi.call(`/system/roles/${roleId}`, 'DELETE', {
            expectedRevision: role.revision,
          })
        } catch (error) {
          errors.push(error)
        }
      }
      if (departmentId) {
        try {
          const department = await adminApi.call<{ revision: number }>(
            `/system/departments/${departmentId}`
          )
          await adminApi.call(`/system/departments/${departmentId}`, 'DELETE', {
            expectedRevision: department.revision,
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
        '审计范围验收清理失败'
      )
  }
})
