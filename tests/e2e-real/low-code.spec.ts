import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page, APIRequestContext } from '@playwright/test'

const login = async (page: Page, user: string) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(user)
  await submitLogin(page)
}
const confirm = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
const caller =
  (request: APIRequestContext, token: string, tenant = 'tenant-a') =>
  async (path: string, data?: unknown, method = 'GET') => {
    const response = await request.fetch(
      `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${path}`,
      {
        method,
        data,
        headers: {
          'x-access-token': token,
          'x-tenant-id': tenant,
          'idempotency-key': randomUUID(),
        },
      }
    )
    expect(response.status()).toBe(200)
    return (await response.json()).data
  }
const publishApp = async (call: ReturnType<typeof caller>, name: string) => {
  const app = await call(
    '/application-center',
    {
      name,
      code: `lc-ui-${randomUUID().slice(0, 8)}`,
      template: 'equipment',
    },
    'POST'
  )
  const form = await call(`/form-schemas/${app.formDraftId}`)
  const workflow = await call(`/workflows/${app.workflowDraftId}`)
  const release = await call(
    `/applications/${app.id}/releases`,
    {
      formDraftId: form.id,
      workflowDraftId: workflow.id,
      formRevision: form.revision,
      workflowRevision: workflow.revision,
      expectedRevision: app.revision,
    },
    'POST'
  )
  return { app, release }
}

test('configured low-code business page saves and reopens, then all five actions perform real employee records and the common approval flow', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext())
  )
  const [admin, employee, first, second] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const name = `低代码设备页-${randomUUID().slice(0, 8)}`
  const title = `真实设备管理-${randomUUID().slice(0, 8)}`
  try {
    await login(admin, 'a-admin')
    const call = caller(
      request,
      (await admin.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const app = await publishApp(call, name)
    await admin.goto('/Scalability/lowCodeBuilder')
    await expect(
      admin.getByTestId('persistent-low-code-designer')
    ).toBeVisible()
    await admin.getByLabel('生成页面名称', { exact: true }).fill(name)
    await admin
      .getByLabel('生成页面业务发布版', { exact: true })
      .selectOption(app.release.id)
    const created = admin.waitForResponse(
      (value) =>
        value.url().includes('/api/low-code/pages/from-application') &&
        value.request().method() === 'POST'
    )
    await admin.getByTestId('persistent-page-generate').click()
    const page = (await (await created).json()).data
    const editor = admin.getByTestId('persistent-page-editor')
    await expect(editor).toBeVisible()
    await editor.getByLabel('低代码页面标题', { exact: true }).fill(title)
    await editor
      .getByLabel('低代码布局宽度', { exact: true })
      .selectOption('24')
    await editor
      .getByRole('button', { name: '查看当前配置JSON', exact: true })
      .click()
      .catch(async () => {
        await editor.getByText('配置导入导出', { exact: true }).click()
        await editor
          .getByRole('button', { name: '查看当前配置JSON', exact: true })
          .click()
      })
    const json = editor.getByLabel('低代码配置JSON', { exact: true })
    const valid = await json.inputValue()
    const future = JSON.parse(valid)
    future.version = 3
    await json.fill(JSON.stringify(future))
    await editor
      .getByRole('button', { name: '校验并载入配置', exact: true })
      .click()
    await expect(admin.getByTestId('persistent-page-error')).toBeVisible()
    await expect(json).toHaveValue(JSON.stringify(future))
    await json.fill(valid)
    await editor
      .getByRole('button', { name: '校验并载入配置', exact: true })
      .click()
    await editor.getByTestId('persistent-page-save').click()
    await expect(admin.getByText('配置已保存', { exact: true })).toBeVisible()
    await admin.reload()
    const row = admin.locator('tbody tr').filter({ hasText: name })
    await row.getByRole('button', { name: '编辑配置', exact: true }).click()
    await expect(
      editor.getByLabel('低代码页面标题', { exact: true })
    ).toHaveValue(title)
    await editor.getByTestId('persistent-page-preview').click()
    await expect(
      editor.getByTestId('persistent-low-code-runtime')
    ).toBeVisible()
    await expect(
      editor.getByTestId('persistent-low-code-runtime')
    ).toContainText('正在预览未发布配置')
    await editor.getByTestId('persistent-page-publish').click()
    await confirm(admin)
    await expect(
      admin.getByText('页面发布成功，v1', { exact: true })
    ).toBeVisible()
    await login(employee, 'a-employee')
    await employee.goto(`/low-code/pages/${page.id}/run`)
    const runtime = employee.getByTestId('persistent-low-code-runtime')
    await expect(
      runtime.getByRole('heading', { name: title, exact: true })
    ).toBeVisible()
    await runtime.getByTestId('persistent-action-new').click()
    const modal = employee.getByTestId('persistent-business-modal')
    await expect(modal).toBeVisible()
    const field = (label: string) =>
      modal
        .locator('.arco-form-item')
        .filter({ hasText: label })
        .locator('input,textarea')
        .first()
    await field('设备名称').fill('低代码真实键盘')
    await field('领用数量').fill('2')
    await field('参考单价').fill('0.10')
    await modal.getByTestId('persistent-action-create').click()
    await confirm(employee)
    await expect(
      employee.getByText('业务草稿已保存', { exact: true })
    ).toBeVisible()
    await modal.getByTestId('persistent-action-start').click()
    await confirm(employee)
    await expect(modal.getByRole('alert').first()).toBeVisible()
    await expect(field('设备名称')).toHaveValue('低代码真实键盘')
    await field('领用用途').fill('真实低代码动作闭环')
    await expect(modal.getByTestId('persistent-action-start')).toBeDisabled()
    await modal.getByTestId('persistent-action-save').click()
    await confirm(employee)
    await expect(modal.getByTestId('persistent-action-start')).toBeEnabled()
    await modal.getByTestId('persistent-action-start').click()
    await confirm(employee)
    await expect(modal).not.toBeVisible()
    await expect(
      employee.getByText('已提交真实审批', { exact: true })
    ).toBeVisible()
    await runtime.getByTestId('persistent-action-refresh').click()
    const recordRow = runtime
      .locator('tbody tr')
      .filter({ hasText: '低代码真实键盘' })
    await expect(recordRow).toContainText('审批中')
    await runtime.getByTestId('persistent-action-refresh-total').click()
    await expect(
      runtime.locator('[data-material-id="total"] strong')
    ).toHaveText('1')
    await runtime.getByTestId('persistent-action-refresh-chart').click()
    await expect(
      runtime.locator('[data-material-id="distribution"] canvas')
    ).toBeVisible()
    await recordRow
      .getByRole('button', { name: '查看详情', exact: true })
      .click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    const recordUrl = employee.url()
    await expect(employee.getByTestId('business-total')).toHaveText('0.20 元')
    await login(first, 'a-manager-1')
    await first.goto(recordUrl)
    await first.getByTestId('business-approve').click()
    await confirm(first)
    await login(second, 'a-manager-2')
    await second.goto(recordUrl)
    await second.getByTestId('business-approve').click()
    await confirm(second)
    await expect(
      second.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.goto(`/low-code/pages/${page.id}/run`)
    await employee.getByTestId('persistent-action-query').click()
    await expect(
      employee.locator('tbody tr').filter({ hasText: '低代码真实键盘' })
    ).toContainText('已通过')
    await employee.screenshot({
      path: 'test-results/full-product/low-code-20261003/runtime-approved.png',
    })
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('published page rollout stays fixed per user and low-code commands refuse tenant and capability bypasses', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () => browser.newContext())
  )
  const [admin, employee, foreign] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const name = `低代码版本-${randomUUID().slice(0, 8)}`
  try {
    await login(admin, 'a-admin')
    const call = caller(
      request,
      (await admin.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const app = await publishApp(call, name)
    const page = await call(
      '/low-code/pages/from-application',
      { name, applicationReleaseId: app.release.id },
      'POST'
    )
    const v1 = await call(
      `/low-code/pages/${page.id}/publish`,
      { expectedRevision: page.revision },
      'POST'
    )
    let current = await call(`/low-code/pages/${page.id}`)
    const nextSchema = { ...current.schema, title: '灰度新业务页' }
    current = await call(
      `/low-code/pages/${page.id}`,
      { name, schema: nextSchema, expectedRevision: current.revision },
      'PUT'
    )
    const v2 = await call(
      `/low-code/pages/${page.id}/publish`,
      { expectedRevision: current.revision },
      'POST'
    )
    current = await call(`/low-code/pages/${page.id}`)
    await call(
      `/low-code/pages/${page.id}/rollout`,
      {
        expectedRevision: current.revision,
        releaseId: v1.id,
        rolloutReleaseId: v2.id,
        percent: 0,
      },
      'POST'
    )
    await login(employee, 'a-employee')
    await employee.goto(`/low-code/pages/${page.id}/run`)
    await expect(
      employee.getByRole('heading', { name, exact: true })
    ).toBeVisible()
    current = await call(`/low-code/pages/${page.id}`)
    await call(
      `/low-code/pages/${page.id}/rollout`,
      {
        expectedRevision: current.revision,
        releaseId: v1.id,
        rolloutReleaseId: v2.id,
        percent: 100,
      },
      'POST'
    )
    await employee.reload()
    await expect(
      employee.getByRole('heading', { name: '灰度新业务页', exact: true })
    ).toBeVisible()
    await employee.reload()
    await expect(
      employee.getByRole('heading', { name: '灰度新业务页', exact: true })
    ).toBeVisible()
    const token =
      (await employee.evaluate(() => localStorage.getItem('token'))) || ''
    const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
    const response = await request.post(
      `${api}/api/low-code/runtime/${page.id}/actions/create`,
      {
        headers: {
          'x-access-token': token,
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
        data: {
          releaseId: v1.id,
          fields: { itemName: '旧页写入', quantity: 1, reason: '应拒绝' },
        },
      }
    )
    expect(response.status()).toBe(409)
    await employee.goto('/Scalability/lowCodeBuilder')
    await expect(
      employee.getByText('没有访问权限', { exact: true })
    ).toBeVisible()
    await login(foreign, 'b-admin')
    await foreign.goto(`/low-code/pages/${page.id}/run`)
    await expect(foreign.getByTestId('low-code-runtime-error')).toBeVisible()
    await expect(
      foreign.getByTestId('persistent-low-code-runtime')
    ).not.toContainText('灰度新业务页')
    current = await call(`/low-code/pages/${page.id}`)
    await call(
      `/low-code/pages/${page.id}/rollout`,
      {
        expectedRevision: current.revision,
        releaseId: v1.id,
        rolloutReleaseId: null,
        percent: 0,
      },
      'POST'
    )
    await employee.goto(`/low-code/pages/${page.id}/run`)
    await expect(
      employee.getByRole('heading', { name, exact: true })
    ).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('a page-only account gets real data permission errors and cannot acquire business or configuration access from the runtime', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const member = await memberContext.newPage()
  const username = `lc-page-only-${randomUUID().slice(0, 8)}`
  try {
    await login(admin, 'a-admin')
    const call = caller(
      request,
      (await admin.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const app = await publishApp(call, username)
    const page = await call(
      '/low-code/pages/from-application',
      { name: '权限受限业务页', applicationReleaseId: app.release.id },
      'POST'
    )
    const release = await call(
      `/low-code/pages/${page.id}/publish`,
      { expectedRevision: page.revision },
      'POST'
    )
    const user = await call(
      '/system/users',
      {
        username,
        name: '低代码页面专权成员',
        phone: '',
        email: '',
        initialPassword: username,
        status: 'enabled',
      },
      'POST'
    )
    await call(
      `/system/users/${user.id}/authorization`,
      {
        roleIds: [],
        directPermissions: ['low-code:page:run'],
        expectedRevision: user.revision,
      },
      'POST'
    )
    await login(member, username)
    await member.goto(`/low-code/pages/${page.id}/run`)
    await expect(member.getByTestId('persistent-action-new')).toHaveCount(0)
    await expect(member.getByTestId('persistent-action-query')).toHaveCount(0)
    await expect(
      member.getByText('该来源缺少当前读取权限', { exact: true }).first()
    ).toBeVisible()
    const token =
      (await member.evaluate(() => localStorage.getItem('token'))) || ''
    const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
    const denied = await request.post(
      `${api}/api/low-code/runtime/${page.id}/actions/query`,
      {
        headers: {
          'x-access-token': token,
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
        data: { releaseId: release.id },
      }
    )
    expect(denied.status()).toBe(403)
    await member.goto('/Scalability/lowCodeBuilder')
    await expect(
      member.getByText('没有访问权限', { exact: true })
    ).toBeVisible()
  } finally {
    await adminContext.close()
    await memberContext.close()
  }
})
