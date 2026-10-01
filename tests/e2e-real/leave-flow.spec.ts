import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const apiUrl = process.env.R1_API_URL || 'http://127.0.0.1:10888'

const login = async (page: Page, username: string) => {
  await page.goto('/login')
  await expect(page.getByTestId('demo-environment')).toBeVisible()
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(username)
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
}

const confirm = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: '确认操作' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

test('a revoked session keeps unsaved input for an explicit restore after reauthentication', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('dialog', (dialog) => dialog.accept())
  try {
    await login(page, 'a-employee')
    await page.goto('/leave/requests/new')
    await page.locator('textarea').fill('会话失效前已保存')
    await page.getByTestId('leave-save').click()
    await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    await expect(page.getByTestId('leave-save')).toBeEnabled()
    await expect(page.getByTestId('leave-detail')).toHaveAttribute(
      'aria-busy',
      'false'
    )
    const savedUrl = page.url()
    await page.locator('textarea').fill('会话失效后需要恢复的输入')
    await expect(page.getByTestId('leave-save-state')).toContainText(
      '有未保存修改'
    )
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const response = await request.post(`${apiUrl}/api/user/logout`, {
      headers: { 'x-access-token': token || '', 'x-tenant-id': 'tenant-a' },
    })
    expect(response.status()).toBe(200)
    const reauthentication = page.waitForURL(/\/login\?redirect=/)
    // A pending authenticated read may detect revocation before the attempted save.
    await Promise.race([
      reauthentication,
      page.getByTestId('leave-save').click(),
    ])
    await reauthentication
    await expect(page).toHaveURL(/\/login\?redirect=/)
    const retained = await page.evaluate(() =>
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('r1-leave-recovery:'))
        .some((key) => {
          const value = JSON.parse(sessionStorage.getItem(key) || '{}')
          return value.fields?.reason === '会话失效后需要恢复的输入'
        })
    )
    expect(retained).toBe(true)
    await login(page, 'a-employee')
    await page.goto(savedUrl)
    await expect(page.locator('textarea')).toHaveValue('会话失效前已保存')
    await page.getByTestId('leave-restore-input').click()
    await expect(page.locator('textarea')).toHaveValue(
      '会话失效后需要恢复的输入'
    )
    await page.getByTestId('leave-save').click()
    await expect(page.getByTestId('leave-save-state')).toContainText('已保存')
    await page.reload()
    await expect(page.locator('textarea')).toHaveValue(
      '会话失效后需要恢复的输入'
    )
    await expect(page.getByTestId('leave-restore-input')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
const create = async (page: Page, reason: string) => {
  await page.goto('/leave/requests/new')
  await expect(
    page.getByRole('heading', { name: '申请内容', exact: true })
  ).toBeVisible()
  await page.locator('textarea').fill(reason)
  await page.getByTestId('leave-save').click()
  await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
  await expect(page.locator('textarea')).toHaveValue(reason)
  const url = page.url()
  await page.reload()
  await expect(page.locator('textarea')).toHaveValue(reason)
  await page.getByTestId('leave-submit').click()
  await expect(
    page.getByRole('heading', { name: '审批中', exact: true })
  ).toBeVisible()
  return url
}

test('saved draft survives closing its tab and opening a new tab with the persisted identity', async ({
  browser,
}) => {
  const context = await browser.newContext()
  try {
    let page = await context.newPage()
    await login(page, 'a-employee')
    await page.goto('/leave/requests/new')
    await page.locator('textarea').fill('关闭重开验收草稿')
    await page.getByTestId('leave-save').click()
    await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    const savedUrl = page.url()
    const reopened = await context.newPage()
    await page.close()
    page = reopened
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto(savedUrl)
    await expect(page.locator('textarea')).toHaveValue('关闭重开验收草稿')
    await expect(page.getByTestId('leave-save-state')).toContainText('已保存')
    await page.goto('/leave/application')
    await expect(page).toHaveURL(/\/not-allowed$/)
    await expect(page.getByTestId('application-publish')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('new release requires an explicit draft migration, keeps old instances fixed and can be rolled back', async ({
  browser,
}) => {
  const employeeContext = await browser.newContext()
  const adminContext = await browser.newContext()
  const employee = await employeeContext.newPage()
  const admin = await adminContext.newPage()
  employee.on('dialog', (dialog) => dialog.accept())
  admin.on('dialog', (dialog) => dialog.accept())
  try {
    await login(employee, 'a-employee')
    const original = await create(employee, '发布时在途申请')
    const originalVersion = await employee
      .locator('aside .leave-panel')
      .last()
      .locator('p')
      .first()
      .innerText()
    await employee.goto('/leave/requests/new')
    await employee.locator('textarea').fill('等待明确迁移的草稿')
    await employee.getByTestId('leave-save').click()
    await expect(employee).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    const stale = employee.url()
    await login(admin, 'a-admin')
    await admin.goto('/leave/application')
    const oldRelease = await admin
      .getByTestId('application-release-select')
      .inputValue()
    await admin.getByTestId('application-publish').click()
    await confirm(admin)
    await expect(admin.getByText(/发布成功，当前为 v/)).toBeVisible()
    await employee.getByTestId('leave-submit').click()
    await expect(employee.getByTestId('leave-error')).toBeVisible()
    await expect(employee.locator('textarea')).toHaveValue('等待明确迁移的草稿')
    await employee.getByTestId('leave-preview-latest').click()
    await expect(employee.getByTestId('leave-migration-preview')).toBeVisible()
    await expect(employee.getByTestId('leave-confirm-migration')).toBeDisabled()
    await employee
      .getByText('我已预览新版，确认迁移当前草稿', { exact: true })
      .click()
    await expect(
      employee.getByRole('checkbox', { name: '我已预览新版，确认迁移当前草稿' })
    ).toBeChecked()
    await employee.getByTestId('leave-confirm-migration').click()
    await expect(employee.getByTestId('leave-save-state')).toContainText(
      '已保存'
    )
    await employee.getByTestId('leave-submit').click()
    await expect(
      employee.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await employee.goto(original)
    await expect(
      employee.locator('aside .leave-panel').last().locator('p').first()
    ).toHaveText(originalVersion)
    await admin
      .getByTestId('application-release-select')
      .selectOption(oldRelease)
    await admin.getByTestId('application-rollback').click()
    await confirm(admin)
    await expect(admin.getByText('活动版本已切换')).toBeVisible()
    await employee.goto('/leave/requests/new')
    await expect(
      employee.locator('aside .leave-panel').last().locator('p').first()
    ).toHaveText(originalVersion)
    await employee.goto(stale)
    await expect(
      employee.locator('aside .leave-panel').last().locator('p').first()
    ).not.toHaveText(originalVersion)
  } finally {
    await employeeContext.close()
    await adminContext.close()
  }
})

test('real production frontend supports saved drafts, two reviewers, result notification and audit', async ({
  browser,
}) => {
  const employeeContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const auditorContext = await browser.newContext()
  const employee = await employeeContext.newPage()
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  const auditor = await auditorContext.newPage()
  try {
    await login(employee, 'a-employee')
    const url = await create(employee, '浏览器完整链路验收')
    await login(first, 'a-manager-1')
    const detailPath = new URL(url).pathname
    await first.locator(`a[href="${detailPath}"]`).click()
    await expect(first).toHaveURL(url)
    await expect(first.getByTestId('leave-review-panel')).toBeVisible()
    await first.getByTestId('leave-review-comment').fill('第一主管已核实')
    await first.getByTestId('leave-approve').click()
    await confirm(first)
    await expect(first.getByTestId('leave-review-panel')).not.toBeVisible()
    await first.goto('/dashboard/workplace')
    await expect(first.locator(`a[href="${detailPath}"]`)).toHaveCount(0)
    await login(second, 'a-manager-2')
    await second.goto(url)
    await expect(second.getByTestId('leave-review-panel')).toBeVisible()
    await second.getByTestId('leave-approve').click()
    await confirm(second)
    await expect(
      second.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.reload()
    await expect(
      employee.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await expect(employee.getByTestId('leave-history')).toContainText(
      '第一主管已核实'
    )
    await employee.screenshot({
      path: 'test-results/r1-m2/approved-flow.png',
      fullPage: true,
    })
    await employee.goto('/message/center')
    await expect(async () => {
      await employee.getByTestId('message-query').click()
      await expect(employee.getByText('请假申请已通过').first()).toBeVisible({
        timeout: 1000,
      })
      await expect(employee.locator(`a[href="${detailPath}"]`)).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 15000 })
    await employee.locator(`a[href="${detailPath}"]`).click()
    await expect(employee).toHaveURL(url)
    await expect(
      employee.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await login(auditor, 'a-auditor')
    const id = url.split('/').pop()
    await auditor.goto(`/audit/logs?targetId=${id}`)
    await expect(auditor.getByTestId('audit-log-page')).toBeVisible()
    await expect(auditor.locator('tbody')).toContainText('submit')
    await expect(auditor.locator('tbody')).not.toContainText(
      '浏览器完整链路验收'
    )
  } finally {
    await employeeContext.close()
    await firstContext.close()
    await secondContext.close()
    await auditorContext.close()
  }
})

test('manager can reject and employee can withdraw through actual UI', async ({
  browser,
}) => {
  const employeeContext = await browser.newContext()
  const managerContext = await browser.newContext()
  const employee = await employeeContext.newPage()
  const manager = await managerContext.newPage()
  try {
    await login(employee, 'a-employee')
    const rejected = await create(employee, '浏览器驳回验收')
    await login(manager, 'a-manager-1')
    await manager.goto(rejected)
    await manager.getByTestId('leave-review-comment').fill('补充材料后重新申请')
    await manager.getByTestId('leave-reject').click()
    await confirm(manager)
    await expect(
      manager.getByRole('heading', { name: '已驳回', exact: true })
    ).toBeVisible()
    await employee.reload()
    await expect(employee.getByTestId('leave-copy')).toBeVisible()
    await employee.getByTestId('leave-copy').click()
    await expect(
      employee.getByRole('heading', { name: '填写请假申请', exact: true })
    ).toBeVisible()
    await expect(employee.locator('textarea')).toHaveValue('浏览器驳回验收')
    await employee.getByTestId('leave-save').click()
    await expect(employee).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    expect(employee.url()).not.toBe(rejected)
    await employee.goto(rejected)
    await expect(
      employee.getByRole('heading', { name: '已驳回', exact: true })
    ).toBeVisible()
    await expect(employee.getByTestId('leave-history')).toContainText(
      '补充材料后重新申请'
    )
    const withdrawn = await create(employee, '浏览器撤回验收')
    await employee.getByTestId('leave-withdraw').click()
    await confirm(employee)
    await expect(
      employee.getByRole('heading', { name: '已撤回', exact: true })
    ).toBeVisible()
    await manager.goto(withdrawn)
    await expect(manager.getByTestId('leave-review-panel')).not.toBeVisible()
  } finally {
    await employeeContext.close()
    await managerContext.close()
  }
})

test('configuration page loads actual designers and publishes a combined release', async ({
  page,
}) => {
  await login(page, 'a-admin')
  await page.goto('/leave/application')
  await expect(page.getByTestId('leave-application')).toBeVisible()
  await expect(page.getByTestId('application-publish')).toBeEnabled()
  await page.getByTestId('application-publish').click()
  await confirm(page)
  await expect(page.getByText(/发布成功，当前为 v/)).toBeVisible()
})

test('tenant switch discards delayed old responses and leaves another tab in its own context', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const first = await context.newPage()
  const second = await context.newPage()
  try {
    await login(first, 'cross-tenant-employee')
    await first.goto('/leave/requests/new')
    await first.locator('textarea').fill('A 租户隔离草稿')
    await first.getByTestId('leave-save').click()
    await expect(first).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    const original = first.url()
    await login(second, 'cross-tenant-employee')
    const delayed = first.waitForRequest((request) =>
      request.url().includes('/api/leave-requests')
    )
    await first.goto('/leave/requests')
    await delayed
    await first.getByTestId('tenant-context-select').selectOption('tenant-b')
    await expect(first.getByTestId('tenant-context-select')).toHaveValue(
      'tenant-b'
    )
    await expect(second.getByTestId('tenant-context-select')).toHaveValue(
      'tenant-a'
    )
    await first.goto('/leave/requests')
    await expect(first.getByText('A 租户隔离草稿')).not.toBeVisible()
    await first.goto(original)
    await expect(first.getByTestId('leave-error')).toBeVisible()
    await expect(first.locator('textarea')).toHaveCount(0)
    await second.goto(original)
    await expect(second.locator('textarea')).toHaveValue('A 租户隔离草稿')
  } finally {
    await context.close()
  }
})

test('real save conflict keeps local input and permits an explicit reload', async ({
  page,
  request,
}) => {
  await login(page, 'a-employee')
  await page.goto('/leave/requests/new')
  await page.locator('textarea').fill('原始冲突草稿')
  await page.getByTestId('leave-save').click()
  await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
  await expect(page.getByTestId('leave-save')).toBeEnabled()
  await expect(page.getByTestId('leave-detail')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  const id = page.url().split('/').pop()
  const auth = await request.post(`${apiUrl}/api/user/login`, {
    data: { username: 'a-employee', password: 'a-employee' },
  })
  expect(auth.ok()).toBe(true)
  const token = (await auth.json()).data.token as string
  const headers = { 'X-Access-Token': token, 'X-Tenant-Id': 'tenant-a' }
  const loaded = await request.get(`${apiUrl}/api/leave-requests/${id}`, {
    headers,
  })
  const data = (await loaded.json()).data as {
    revision: number
    leaveType: string
    startDate: string
    startSlot: string
    endDate: string
    endSlot: string
  }
  const updated = await request.patch(`${apiUrl}/api/leave-requests/${id}`, {
    headers,
    data: {
      expectedRevision: data.revision,
      fields: {
        leaveType: data.leaveType,
        startDate: data.startDate,
        startSlot: data.startSlot,
        endDate: data.endDate,
        endSlot: data.endSlot,
        reason: '服务器新版本',
      },
    },
  })
  expect(updated.ok()).toBe(true)
  await page.locator('textarea').fill('本地应保留的输入')
  await page.getByTestId('leave-save').click()
  await expect(page.getByTestId('leave-conflict-reload')).toBeVisible()
  await expect(page.locator('textarea')).toHaveValue('本地应保留的输入')
  await page.getByTestId('leave-conflict-reload').click()
  await confirm(page)
  await expect(page.locator('textarea')).toHaveValue('服务器新版本')
})

test('administrator edits a field label in the existing designer and saves it before publishing', async ({
  page,
}) => {
  await login(page, 'a-admin')
  await page.goto('/leave/application')
  await expect(page.getByTestId('application-publish')).toBeEnabled()
  await page.locator('.widget-wrapper').filter({ hasText: '请假事由' }).click()
  const label = page
    .locator('.config-panel .arco-form-item')
    .filter({ hasText: '字段标签' })
    .locator('input')
  await expect(label).toBeVisible()
  await label.fill('请假事由（配置验收）')
  await expect(page.getByTestId('application-publish')).toBeDisabled()
  await page.getByTestId('application-save-form').click()
  await expect(page.getByText('表单草稿已保存')).toBeVisible()
  await expect(page.getByTestId('application-publish')).toBeEnabled()
  await page
    .locator('.widget-wrapper')
    .filter({ hasText: '请假事由（配置验收）' })
    .click()
  await label.fill('请假事由')
  await page.getByTestId('application-save-form').click()
  await expect(page.getByTestId('application-publish')).toBeEnabled()
})

test('compact viewport has usable primary actions and keyboard focus', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })
  const page = await context.newPage()
  try {
    await login(page, 'a-employee')
    await page.goto('/leave/requests/new')
    await expect(page.locator('textarea')).toBeVisible()
    await page.getByTestId('leave-save').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('leave-submit')).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: 'test-results/r1-m2/compact-form.png',
      fullPage: true,
    })
  } finally {
    await context.close()
  }
})
