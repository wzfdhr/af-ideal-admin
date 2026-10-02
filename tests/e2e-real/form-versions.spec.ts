import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page } from '@playwright/test'

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
test('real published forms compare against edited drafts and another release, reopen beyond 100 drafts, and preserve pinned business records', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const employeeContext = await browser.newContext()
  const otherContext = await browser.newContext()
  const page = await context.newPage()
  const employee = await employeeContext.newPage()
  const other = await otherContext.newPage()
  const suffix = randomUUID().slice(0, 8)
  const name = `版本对比-${suffix}`
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  try {
    await login(page, 'a-admin')
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const call = async (path: string, data?: unknown, method = 'POST') => {
      const response = await request.fetch(`${api}/api${path}`, {
        method,
        data,
        headers: {
          'x-access-token': token || '',
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const app = await call('/application-center', {
      code: `version-${suffix}`,
      name,
      description: '',
      template: 'equipment',
    })
    await page.goto(`/applications/${app.id}/configuration`)
    await page
      .locator('.arco-tabs-tab-title')
      .filter({ hasText: /^表单版本对比$/ })
      .click()
    await expect(page.getByTestId('form-comparison-empty')).toBeVisible()
    await page.getByTestId('application-publish').click()
    await confirm(page)
    await expect(
      page.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    const first = (await call(`/applications/${app.id}`, undefined, 'GET'))
      .releases[0]
    await expect(page.getByTestId('form-comparison-equal')).toBeVisible()
    // The real first catalogue page no longer contains this application's draft.
    const createExtra = async (index: number) =>
      call('/form-schemas', {
        name: `后续草稿-${suffix}-${index}`,
        schema: first.formSnapshot,
      })
    await Promise.all(Array.from({ length: 101 }, (_, i) => createExtra(i)))
    expect(
      (
        await call('/form-schemas?current=1&pageSize=100', undefined, 'GET')
      ).list.some((item: { id: string }) => item.id === app.formDraftId)
    ).toBe(false)
    await page.reload()
    await expect(
      page.locator('.widget-wrapper').filter({ hasText: '设备名称' })
    ).toBeVisible()
    await login(employee, 'a-employee')
    await employee.goto('/business/records')
    await employee
      .getByLabel('业务应用', { exact: true })
      .selectOption({ label: name })
    await employee
      .getByRole('button', { name: '新建业务申请', exact: true })
      .click()
    const record = employee.getByTestId('business-record')
    const input = (label: string) =>
      record
        .locator('.arco-form-item')
        .filter({ hasText: label })
        .locator('input,textarea')
        .first()
    await input('设备名称').fill('原发布设备')
    await input('领用数量').fill('1')
    await input('领用用途').fill('旧版本固定验收')
    await employee.getByTestId('business-save').click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    const recordUrl = employee.url()
    await employee.getByTestId('business-submit').click()
    await confirm(employee)
    await expect(
      employee.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await page
      .locator('.widget-wrapper')
      .filter({ hasText: '设备名称' })
      .click()
    await page
      .locator('.config-panel .arco-form-item')
      .filter({ hasText: '字段标签' })
      .locator('input')
      .fill('资产名称')
    await page.getByLabel('最小字符数', { exact: true }).fill('101')
    await page.getByLabel('最小字符数', { exact: true }).press('Tab')
    await page
      .locator('.arco-tabs-tab-title')
      .filter({ hasText: /^表单版本对比$/ })
      .click()
    await expect(page.getByTestId('form-comparison-error')).toBeVisible()
    await page.getByText('预览发布内容', { exact: true }).click()
    await expect(page.getByTestId('application-preview-error')).toBeVisible()
    await page.getByText('配置表单', { exact: true }).click()
    await expect(
      page
        .locator('.config-panel .arco-form-item')
        .filter({ hasText: '字段标签' })
        .locator('input')
    ).toHaveValue('资产名称')
    await page.getByLabel('最小字符数', { exact: true }).fill('2')
    await page.getByLabel('最小字符数', { exact: true }).press('Tab')
    await page
      .locator('.arco-tabs-tab-title')
      .filter({ hasText: /^表单版本对比$/ })
      .click()
    const comparison = page.getByTestId('form-version-comparison')
    await expect(comparison.getByRole('status')).toContainText('未保存修改')
    await expect(
      comparison.locator('[data-change-key="itemName"]')
    ).toContainText('设备名称')
    await expect(
      comparison.locator('[data-change-key="itemName"]')
    ).toContainText('资产名称')
    await page.getByText('配置表单', { exact: true }).click()
    await page.getByTestId('application-save-form').click()
    await expect(page.getByText('表单已保存', { exact: true })).toBeVisible()
    await page.getByTestId('application-publish').click()
    await confirm(page)
    await expect(
      page.getByText('发布成功，当前为 v2', { exact: true })
    ).toBeVisible()
    await page
      .locator('.arco-tabs-tab-title')
      .filter({ hasText: /^表单版本对比$/ })
      .click()
    const detail = await call(`/applications/${app.id}`, undefined, 'GET')
    const second = detail.releases.find(
      (item: { releaseVersion: number }) => item.releaseVersion === 2
    )
    await comparison.getByLabel('表单对比基准版本').selectOption(first.id)
    await comparison.getByLabel('表单对比目标版本').selectOption(second.id)
    await expect(page.getByTestId('application-release-select')).toHaveValue(
      second.id
    )
    await expect(
      comparison.locator('[data-change-key="itemName"]')
    ).toContainText('资产名称')
    await page.setViewportSize({ width: 1280, height: 720 })
    await comparison.getByLabel('表单对比基准版本').focus()
    await expect(comparison.getByLabel('表单对比基准版本')).toBeFocused()
    await comparison.screenshot({
      path: 'test-results/full-product/form-version-comparison-runtime.png',
    })
    await page.reload()
    await page
      .locator('.arco-tabs-tab-title')
      .filter({ hasText: /^表单版本对比$/ })
      .click()
    await page.getByLabel('表单对比基准版本').selectOption(first.id)
    await page.getByLabel('表单对比目标版本').selectOption(second.id)
    await expect(page.locator('[data-change-key="itemName"]')).toContainText(
      '资产名称'
    )
    await employee.goto(recordUrl)
    await expect(employee.getByTestId('business-record')).toContainText(
      '设备名称'
    )
    await expect(employee.getByTestId('business-record')).not.toContainText(
      '资产名称'
    )
    await login(other, 'b-admin')
    await other.goto(`/applications/${app.id}/configuration`)
    await expect(other.getByTestId('application-error')).toBeVisible()
    await expect(other.getByTestId('form-version-comparison')).toHaveCount(0)
  } finally {
    await context.close()
    await employeeContext.close()
    await otherContext.close()
  }
})
