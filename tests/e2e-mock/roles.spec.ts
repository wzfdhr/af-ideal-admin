import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const login = async (page: Page, user: string) => {
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(user)
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
}
const logout = async (page: Page) => {
  if (!(await page.getByText('工作台', { exact: true }).isVisible()))
    await page.getByText('仪表盘', { exact: true }).click()
  await page.getByText('工作台', { exact: true }).click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
  await page.locator('.arco-avatar').last().click()
  await page.getByText('注销登录', { exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
}
test('development role grants and revocations share one permission state across login, menu and directory APIs', async ({
  page,
}) => {
  const name = `Mock授权-${randomUUID().slice(0, 8)}`
  await page.goto('/login')
  await login(page, 'a-admin')
  await page.getByText('系统配置', { exact: true }).click()
  await page.getByText('角色配置', { exact: true }).click()
  await expect(page.getByTestId('reference-role-system')).toBeVisible()
  await page.getByRole('button', { name: '新增角色', exact: true }).click()
  const editor = page.getByTestId('role-editor-modal')
  await editor.getByPlaceholder('请输入角色名称').fill(name)
  await editor
    .getByPlaceholder('请输入角色标识')
    .fill(`mock-${randomUUID().slice(0, 8)}`)
  await editor.getByLabel('查看部门目录', { exact: true }).check()
  await editor.getByRole('button', { name: '确定', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await page.getByLabel('查询授权账号').fill('a-employee')
  await page.getByRole('button', { name: '查询成员', exact: true }).click()
  const row = page.locator('tbody tr').filter({ hasText: 'a-employee' })
  await row.getByRole('button', { name: '配置授权', exact: true }).click()
  const authorization = page.getByTestId('member-authorization-modal')
  await authorization.getByLabel(name, { exact: true }).check()
  await authorization.getByRole('button', { name: '确定', exact: true }).click()
  await expect(authorization).not.toBeVisible()
  await logout(page)
  await login(page, 'a-employee')
  await page.getByText('系统配置', { exact: true }).click()
  await page.getByText('部门配置', { exact: true }).click()
  await expect(page.getByTestId('department-tree-panel')).toContainText(
    '业务部'
  )
  await expect(
    page.getByRole('button', { name: '新增部门', exact: true })
  ).toHaveCount(0)
  await logout(page)
  await login(page, 'a-admin')
  await page.getByText('系统配置', { exact: true }).click()
  await page.getByText('角色配置', { exact: true }).click()
  await page
    .locator('tbody tr')
    .filter({ hasText: name })
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  await editor.getByLabel('查看部门目录', { exact: true }).uncheck()
  await editor.getByRole('button', { name: '确定', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await logout(page)
  await login(page, 'a-employee')
  await expect(page.getByText('部门配置', { exact: true })).toHaveCount(0)
})
