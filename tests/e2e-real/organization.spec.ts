import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const login = async (page: Page, user: string) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(user)
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
}
test('department page completes real create, reopen, edit and delete with independent tenant isolation', async ({
  browser,
}) => {
  const a = await browser.newContext()
  const b = await browser.newContext()
  const first = await a.newPage()
  const second = await b.newPage()
  const name = `组织验收-${randomUUID().slice(0, 8)}`
  try {
    await login(first, 'a-admin')
    await first.goto('/system/departmentSystem')
    await first.getByRole('button', { name: '新增部门', exact: true }).click()
    const editor = first.getByTestId('department-editor-modal')
    await expect(editor).toBeVisible()
    await editor.getByPlaceholder('请输入部门名称').fill(name)
    await editor.getByPlaceholder('请输入负责人').fill('演示负责人')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    let row = first.locator('tbody tr').filter({ hasText: name })
    await expect(row).toBeVisible()
    await first.reload()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await editor.getByPlaceholder('请输入负责人').fill('更新负责人')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await expect(row).toContainText('更新负责人')
    await login(second, 'b-admin')
    await second.goto('/system/departmentSystem')
    await expect(second.locator('tbody')).not.toContainText(name)
    await first.screenshot({
      path: 'test-results/full-product/department-ui.png',
      fullPage: true,
    })
    await row.getByRole('button', { name: '删除', exact: true }).click()
    await first
      .getByTestId('department-delete-modal')
      .getByRole('button', { name: '确定', exact: true })
      .click()
    await expect(row).toHaveCount(0)
    await first.reload()
    row = first.locator('tbody tr').filter({ hasText: name })
    await expect(row).toHaveCount(0)
  } finally {
    await a.close()
    await b.close()
  }
})
