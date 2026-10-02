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
test('real role grants reach an existing member session and revocation removes menu, route and raw API access', async ({
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
  const username = `role-page-${suffix}`
  const password = 'Role-private-page-password-2026'
  const name = `角色页面验收-${suffix}`
  try {
    await login(admin, 'a-admin')
    await admin.goto('/system/userSystem')
    await admin.getByRole('button', { name: '新增用户', exact: true }).click()
    const userEditor = admin.getByTestId('member-editor-modal')
    await userEditor.getByPlaceholder('请输入账号名称').fill(username)
    await userEditor.getByPlaceholder('请输入成员姓名').fill('动态角色验收成员')
    await userEditor.getByLabel('初始密码').fill(password)
    await userEditor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(userEditor).not.toBeVisible()
    await login(member, username, password)
    await member.goto('/system/userSystem')
    await expect(member).toHaveURL(/not-allowed/)
    const oldToken = await member.evaluate(() => localStorage.getItem('token'))
    await admin.goto('/system/roleSystem')
    await expect(admin.getByTestId('reference-role-system')).toBeVisible()
    await admin.getByRole('button', { name: '新增角色', exact: true }).click()
    const roleEditor = admin.getByTestId('role-editor-modal')
    await roleEditor.getByPlaceholder('请输入角色名称').fill(name)
    await roleEditor
      .getByPlaceholder('请输入角色标识')
      .fill(`page-role-${suffix}`)
    await roleEditor.getByLabel('查看租户成员', { exact: true }).check()
    await roleEditor.getByLabel('查看成员详情', { exact: true }).check()
    await roleEditor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(roleEditor).not.toBeVisible()
    const roleRow = admin.locator('tbody tr').filter({ hasText: name })
    await expect(roleRow).toBeVisible()
    await admin.getByLabel('查询授权账号').fill(username)
    await admin.getByRole('button', { name: '查询成员', exact: true }).click()
    const memberRow = admin.locator('tbody tr').filter({ hasText: username })
    await memberRow
      .getByRole('button', { name: '配置授权', exact: true })
      .click()
    const assignment = admin.getByTestId('member-authorization-modal')
    await assignment.getByLabel(name, { exact: true }).check()
    await assignment.getByRole('button', { name: '确定', exact: true }).click()
    await expect(assignment).not.toBeVisible()
    await member.goto('/system/userSystem')
    await expect(member.getByTestId('reference-user-system')).toBeVisible()
    await expect(
      member.getByRole('button', { name: '新增用户', exact: true })
    ).toHaveCount(0)
    await expect(member.locator('tbody')).toContainText(username)
    await expect(
      member.getByText('用户配置', { exact: true }).first()
    ).toBeVisible()
    await admin.reload()
    await expect(roleRow).toBeVisible()
    await login(other, 'b-admin')
    await other.goto('/system/roleSystem')
    await expect(other.locator('tbody').filter({ hasText: name })).toHaveCount(
      0
    )
    await roleRow.getByRole('button', { name: '编辑', exact: true }).click()
    await roleEditor.getByLabel('查看租户成员', { exact: true }).uncheck()
    await roleEditor.getByLabel('查看成员详情', { exact: true }).uncheck()
    await roleEditor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(roleEditor).not.toBeVisible()
    const denied = await request.get(
      `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api/system/users`,
      {
        headers: {
          'x-access-token': oldToken || '',
          'x-tenant-id': 'tenant-a',
        },
      }
    )
    expect(denied.status()).toBe(403)
    await member.goto('/dashboard/workplace')
    await expect(member.getByText('用户配置', { exact: true })).toHaveCount(0)
    await member.goto('/system/userSystem')
    await expect(member).toHaveURL(/not-allowed/)
    await admin.screenshot({
      path: 'test-results/full-product/roles-real-revocation.png',
      fullPage: true,
    })
    await admin.getByLabel('查询授权账号').fill(username)
    await admin.getByRole('button', { name: '查询成员', exact: true }).click()
    await memberRow
      .getByRole('button', { name: '配置授权', exact: true })
      .click()
    await assignment.getByLabel(name, { exact: true }).uncheck()
    await assignment.getByRole('button', { name: '确定', exact: true }).click()
    await expect(assignment).not.toBeVisible()
    await roleRow.getByRole('button', { name: '删除', exact: true }).click()
    await admin
      .getByRole('dialog', { name: '确认操作', exact: true })
      .getByRole('button', { name: '确认', exact: true })
      .click()
    await expect(roleRow).toHaveCount(0)
  } finally {
    await adminContext.close()
    await memberContext.close()
    await otherContext.close()
  }
})
