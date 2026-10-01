import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page } from '@playwright/test'

const apiUrl = process.env.R1_API_URL || 'http://127.0.0.1:10888'
const login = async (page: Page, username: string, password = username) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}
test('private user creation, corrected validation, masked profile editing, session disable and tenant isolation use actual services', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const memberContext = await browser.newContext()
  const otherContext = await browser.newContext()
  const page = await context.newPage()
  const member = await memberContext.newPage()
  const other = await otherContext.newPage()
  const username = `page-user-${randomUUID().slice(0, 8)}`
  const initialPassword = 'Private-page-fixture-password-2026'
  try {
    await login(page, 'a-admin')
    await page.goto('/system/userSystem')
    await expect(page.getByTestId('reference-user-system')).toBeVisible()
    await page.getByRole('button', { name: '新增用户', exact: true }).click()
    const editor = page.getByTestId('member-editor-modal')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).toBeVisible()
    await expect(
      editor.getByText('账号名称不能为空', { exact: true })
    ).toBeVisible()
    await editor.getByPlaceholder('请输入账号名称').fill(username)
    await editor.getByPlaceholder('请输入成员姓名').fill('真实用户验收')
    await editor.getByPlaceholder('请输入电话（可选）').fill('15000000001')
    await editor
      .getByPlaceholder('请输入邮箱（可选）')
      .fill('fixture@invalid.example')
    await editor.getByLabel('初始密码').fill(initialPassword)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await page.getByLabel('查询账号名称').fill(username)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    const row = page.locator('tbody tr').filter({ hasText: username })
    await expect(row).toBeVisible()
    await expect(row).toContainText('15*******01')
    await expect(row).not.toContainText('15000000001')
    await expect(row).not.toContainText('fixture@invalid.example')
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await editor.getByPlaceholder('请输入成员姓名').fill('编辑后真实成员')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await expect(row).toContainText('编辑后真实成员')
    await expect(row).toContainText('15*******01')
    await page.reload()
    await page.getByLabel('查询账号名称').fill(username)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await expect(row).toContainText('编辑后真实成员')
    await login(member, username, initialPassword)
    await expect(
      member.getByRole('heading', { name: '编辑后真实成员，欢迎回来' })
    ).toBeVisible()
    const beforeResetToken = await member.evaluate(() =>
      localStorage.getItem('token')
    )
    await row.getByRole('button', { name: '重置密码', exact: true }).click()
    const reset = page.getByTestId('member-password-modal')
    await reset.getByLabel('重置密码').fill('short')
    await reset.getByRole('button', { name: '确定', exact: true }).click()
    await expect(reset).toBeVisible()
    await expect(reset.getByLabel('重置密码')).toHaveValue('short')
    const newPassword = 'Rotated-private-page-password-2026'
    await reset.getByLabel('重置密码').fill(newPassword)
    await reset.getByRole('button', { name: '确定', exact: true }).click()
    await expect(reset).not.toBeVisible()
    const resetSession = await request.get(`${apiUrl}/api/user/info`, {
      headers: {
        'x-access-token': beforeResetToken || '',
        'x-tenant-id': 'tenant-a',
      },
    })
    expect(resetSession.status()).toBe(401)
    await member.reload()
    await expect(member).toHaveURL(/\/login/)
    await login(member, username, newPassword)
    const oldToken = await member.evaluate(() => localStorage.getItem('token'))
    await login(other, 'b-admin')
    await other.goto('/system/userSystem')
    await other.getByLabel('查询账号名称').fill(username)
    const filtered = other.waitForResponse(
      (response) =>
        response.url().includes('/api/system/users') &&
        response.url().includes(username) &&
        response.status() === 200
    )
    await other.getByRole('button', { name: '搜索', exact: true }).click()
    await filtered
    await expect(
      other.locator('tbody tr').filter({ hasText: username })
    ).toHaveCount(0)
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await editor
      .locator('.arco-form-item')
      .filter({ hasText: '成员状态' })
      .locator('.arco-select-view')
      .click()
    await page
      .locator('.arco-select-option')
      .getByText('停用', { exact: true })
      .click()
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await expect(row).toContainText('停用')
    await expect(row.getByText('停用', { exact: true })).toBeVisible()
    const revoked = await request.get(`${apiUrl}/api/user/info`, {
      headers: { 'x-access-token': oldToken || '', 'x-tenant-id': 'tenant-a' },
    })
    expect([401, 404]).toContain(revoked.status())
    await member.reload()
    await expect(member).toHaveURL(/\/login/)
    await page.screenshot({
      path: 'test-results/full-product/users-masked-and-disabled.png',
      fullPage: true,
    })
    await row.getByRole('button', { name: '撤销成员', exact: true }).click()
    await page
      .getByRole('dialog', { name: '确认操作', exact: true })
      .getByRole('button', { name: '确认', exact: true })
      .click()
    await expect(row).toHaveCount(0)
  } finally {
    await context.close()
    await memberContext.close()
    await otherContext.close()
  }
})
