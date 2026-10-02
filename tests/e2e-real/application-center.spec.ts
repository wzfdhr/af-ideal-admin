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
test('application center creates, reopens, publishes and runs an independent template, then archives and restores it without changing the source', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const otherContext = await browser.newContext()
  const page = await context.newPage()
  const other = await otherContext.newPage()
  const suffix = randomUUID().slice(0, 8)
  const name = `应用闭环-${suffix}`
  const code = `ui-app-${suffix}`
  try {
    await login(page, 'a-admin')
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const headers = { 'x-access-token': token || '', 'x-tenant-id': 'tenant-a' }
    const source = (
      await (
        await request.get(
          `${
            process.env.R1_API_URL || 'http://127.0.0.1:10888'
          }/api/applications/leave`,
          { headers }
        )
      ).json()
    ).data
    await page.goto('/applications/center')
    await expect(page.getByTestId('application-center')).toBeVisible()
    await page.getByRole('button', { name: '创建应用', exact: true }).click()
    const editor = page.getByTestId('application-center-editor')
    await editor.getByLabel('应用名称', { exact: true }).fill(name)
    await editor.getByLabel('应用标识', { exact: true }).fill(code)
    await editor.getByLabel('初始模板').selectOption('leave')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    const row = page.locator('tbody tr').filter({ hasText: code })
    await expect(row).toContainText('未发布')
    await page.reload()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '配置', exact: true }).click()
    await expect(page).toHaveURL(/\/applications\/[a-f0-9-]+\/configuration$/)
    const id = new URL(page.url()).pathname.split('/')[2]
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    const owned = (
      await (
        await request.get(
          `${
            process.env.R1_API_URL || 'http://127.0.0.1:10888'
          }/api/application-center/${id}`,
          { headers }
        )
      ).json()
    ).data
    expect(owned.formDraftId).not.toBe('form-leave')
    await expect(page.getByLabel('表单草稿', { exact: true })).toHaveValue(
      owned.formDraftId
    )
    await page.getByTestId('application-save-form').click()
    await page.getByText('配置流程', { exact: true }).click()
    await page.getByTestId('application-save-workflow').click()
    await page.getByTestId('application-publish').click()
    await confirm(page)
    await expect(
      page.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    await page.goto('/applications/center')
    await page.getByLabel('查询应用').fill(code)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(row).toContainText('已发布')
    await row.getByRole('button', { name: '运行', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`applicationId=${id}`))
    await page.locator('textarea').fill('独立应用真实浏览器运行')
    await page.getByTestId('leave-save').click()
    await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    const detailUrl = page.url()
    await page.getByTestId('leave-submit').click()
    await expect(
      page.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await page.goto('/applications/center')
    await page.getByLabel('查询应用').fill(code)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await row.getByRole('button', { name: '复制', exact: true }).click()
    await editor.getByLabel('应用标识', { exact: true }).fill(`copy-${suffix}`)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await row.getByRole('button', { name: '归档', exact: true }).click()
    await confirm(page)
    await expect(row).toContainText('已归档')
    await expect(
      row.getByRole('button', { name: '运行', exact: true })
    ).toHaveCount(0)
    await page.reload()
    await page.getByLabel('查询应用').fill(code)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(row).toContainText('已归档')
    await row.getByRole('button', { name: '恢复', exact: true }).click()
    await confirm(page)
    await expect(row).toContainText('已发布')
    await login(other, 'b-admin')
    await other.goto('/applications/center')
    await other.getByLabel('查询应用').fill(code)
    await other.getByRole('button', { name: '查询', exact: true }).click()
    await expect(other.locator('tbody')).not.toContainText(code)
    const unchanged = (
      await (
        await request.get(
          `${
            process.env.R1_API_URL || 'http://127.0.0.1:10888'
          }/api/applications/leave`,
          { headers }
        )
      ).json()
    ).data
    expect(unchanged.activeReleaseId).toBe(source.activeReleaseId)
    await page.goto(detailUrl)
    await expect(
      page.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await page.screenshot({
      path: 'test-results/full-product/application-center-runtime.png',
    })
  } finally {
    await context.close()
    await otherContext.close()
  }
})
