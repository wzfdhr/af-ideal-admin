import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page } from '@playwright/test'

const login = async (page: Page, user: string, password = user) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}

test('saved member scope survives reload and immediately restricts the existing member session and preview', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const otherContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const member = await memberContext.newPage()
  const other = await otherContext.newPage()
  const suffix = randomUUID().slice(0, 8)
  const username = `scope-page-${suffix}`
  const password = 'Scope-private-browser-password-2026'
  const roleName = `范围页面验收-${suffix}`
  try {
    await login(admin, 'a-admin')
    const token = await admin.evaluate(() => localStorage.getItem('token'))
    const write = async (path: string, body: unknown) => {
      const response = await request.post(
        `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${path}`,
        {
          headers: {
            'x-access-token': token || '',
            'x-tenant-id': 'tenant-a',
            'idempotency-key': randomUUID(),
          },
          data: body,
        }
      )
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const user = await write('/system/users', {
      username,
      name: '字段隐藏验收成员',
      phone: '',
      email: '',
      initialPassword: password,
      status: 'enabled',
    })
    const role = await write('/system/roles', {
      roleName,
      roleKey: `browser-scope-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions: ['system:user:list', 'system:user:detail'],
    })
    await write(`/system/users/${user.id}/authorization`, {
      roleIds: [role.id],
      directPermissions: [],
      expectedRevision: user.revision,
    })
    await login(member, username, password)
    await member.goto('/system/userSystem')
    await expect(member.locator('tbody tr')).toHaveCount(1)
    await admin.goto('/permissions/backend/data-scope')
    await expect(admin.getByTestId('member-data-scope-page')).toBeVisible()
    const row = admin.locator('tbody tr').filter({ hasText: roleName })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '配置', exact: true }).click()
    const editor = admin.getByTestId('member-scope-editor')
    await editor.getByLabel('成员数据范围', { exact: true }).selectOption('all')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await member.reload()
    await expect
      .poll(() => member.locator('tbody tr').count())
      .toBeGreaterThan(1)
    await row.getByRole('button', { name: '配置', exact: true }).click()
    await editor
      .getByLabel('成员数据范围', { exact: true })
      .selectOption('self')
    await editor.getByLabel('成员姓名', { exact: true }).uncheck()
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await admin.reload()
    await expect(row).toContainText('本人')
    await row.getByRole('button', { name: '配置', exact: true }).click()
    await expect(
      editor.getByLabel('成员姓名', { exact: true })
    ).not.toBeChecked()
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    await member.reload()
    await expect(member.locator('tbody tr')).toHaveCount(1)
    await expect(member.locator('tbody')).toContainText(username)
    await expect(member.locator('tbody')).not.toContainText('字段隐藏验收成员')
    await row.getByRole('button', { name: '预览', exact: true }).click()
    const preview = admin.getByTestId('member-scope-preview')
    await preview.getByLabel('预览访问者').selectOption(user.id)
    await preview.getByRole('button', { name: '预览', exact: true }).click()
    await expect(preview.locator('tbody tr')).toHaveCount(1)
    await expect(preview.locator('tbody')).toContainText('无字段权限')
    await expect(preview.locator('tbody')).not.toContainText('a-admin')
    await login(other, 'b-admin')
    await other.goto('/permissions/backend/data-scope')
    await expect(other.getByTestId('member-data-scope-page')).toBeVisible()
    await expect(other.locator('tbody')).not.toContainText(roleName)
    await admin.screenshot({
      path: 'test-results/full-product/data-scope-real-preview.png',
      fullPage: true,
    })
  } finally {
    await adminContext.close()
    await memberContext.close()
    await otherContext.close()
  }
})
