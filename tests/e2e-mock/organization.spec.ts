import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'

test('explicit development Mock supports the department tree and positions without a reference API', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill('a-admin')
  await page.getByRole('textbox', { name: '密码', exact: true }).fill('a-admin')
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
  await page.goto('/system/departmentSystem')
  await expect(page.getByTestId('department-tree-panel')).toContainText(
    '业务部'
  )
  await page.getByRole('button', { name: '新增部门', exact: true }).click()
  const editor = page.getByTestId('department-editor-modal')
  const department = `Mock-${randomUUID().slice(0, 8)}`
  await editor.getByPlaceholder('请输入部门名称').fill(department)
  await editor.getByPlaceholder('请输入负责人').fill('合成负责人')
  await editor.getByRole('button', { name: '确定', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(page.getByTestId('department-tree-panel')).toContainText(
    department
  )
  await page.getByText('岗位与组织成员', { exact: true }).click()
  await expect(page.getByTestId('position-system')).toBeVisible()
  await page.getByRole('button', { name: '新增岗位', exact: true }).click()
  const positionEditor = page.getByRole('dialog', { name: '岗位编辑' })
  const position = `演示岗位-${randomUUID().slice(0, 8)}`
  await positionEditor.getByPlaceholder('请输入岗位名称').fill(position)
  await positionEditor
    .locator('.arco-form-item')
    .filter({ hasText: '所属部门' })
    .locator('.arco-select-view')
    .click()
  await page
    .locator('.arco-select-option')
    .getByText(department, { exact: true })
    .click()
  await positionEditor
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await expect(positionEditor).not.toBeVisible()
  await expect(
    page.locator('tbody tr').filter({ hasText: position })
  ).toBeVisible()
  expect(errors).toEqual([])
})
