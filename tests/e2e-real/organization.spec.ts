import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page, Locator } from '@playwright/test'

const login = async (page: Page, user: string) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(user)
  await submitLogin(page)
}
const selectField = async (
  page: Page,
  editor: Locator,
  label: string,
  choice: string
) => {
  await editor
    .locator('.arco-form-item')
    .filter({ hasText: label })
    .locator('.arco-select-view')
    .click()
  await page
    .locator('.arco-select-option')
    .filter({ hasText: choice })
    .filter({ has: page.getByText(choice, { exact: true }) })
    .click()
}
const createDepartment = async (page: Page, name: string, parent?: string) => {
  await page.getByRole('button', { name: '新增部门', exact: true }).click()
  const editor = page.getByTestId('department-editor-modal')
  await editor.getByPlaceholder('请输入部门名称').fill(name)
  await editor.getByPlaceholder('请输入负责人').fill('合成负责人')
  if (parent) await selectField(page, editor, '父部门', parent)
  await editor.getByRole('button', { name: '确定', exact: true }).click()
  await expect(editor).not.toBeVisible()
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
test('organization tree survives reopening, excludes cyclic parents and rejects deletion with a child', async ({
  page,
}) => {
  const root = `层级验收-${randomUUID().slice(0, 8)}`
  const child = `${root}-子部门`
  await login(page, 'a-admin')
  await page.goto('/system/departmentSystem')
  await createDepartment(page, root)
  await createDepartment(page, child, root)
  const tree = page.getByTestId('department-tree-panel')
  const rootNode = tree
    .locator('li')
    .filter({ has: page.locator('summary').getByText(root, { exact: true }) })
    .first()
  await expect(rootNode).toContainText(child)
  await page.reload()
  await expect(tree).toContainText(child)
  await page.getByPlaceholder('请输入部门名称').fill(root)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  const rootRow = page
    .locator('tbody tr')
    .filter({ has: page.getByText(root, { exact: true }) })
  await rootRow.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByTestId('department-editor-modal')
  await editor
    .locator('.arco-form-item')
    .filter({ hasText: '父部门' })
    .locator('.arco-select-view')
    .click()
  await expect(
    page.locator('.arco-select-option').filter({ hasText: root })
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await rootRow.getByRole('button', { name: '删除', exact: true }).click()
  const deletion = page.getByTestId('department-delete-modal')
  await deletion.getByRole('button', { name: '确定', exact: true }).click()
  await expect(deletion).toBeVisible()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: '部门有关联成员、子部门或岗位，不能删除' })
  ).toBeVisible()
  await deletion.getByRole('button', { name: '取消', exact: true }).click()
  await expect(deletion).not.toBeVisible()
  const rootDetails = rootNode.locator('details').first()
  await rootNode.locator('summary').first().focus()
  await page.keyboard.press('Enter')
  await expect(rootDetails).toHaveJSProperty('open', false)
  await page.keyboard.press('Enter')
  await expect(rootDetails).toHaveJSProperty('open', true)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.screenshot({
    path: 'test-results/full-product/department-tree-1280.png',
    fullPage: true,
  })
  const childRow = page.locator('tbody tr').filter({ hasText: child })
  await childRow.getByRole('button', { name: '编辑', exact: true }).click()
  await selectField(page, editor, '父部门', '无（根部门）')
  await editor.getByRole('button', { name: '确定', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(rootNode.locator('li')).toHaveCount(0)
  const deleteDepartment = async (name: string) => {
    await page
      .locator('tbody tr')
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByRole('button', { name: '删除', exact: true })
      .click()
    await deletion.getByRole('button', { name: '确定', exact: true }).click()
    await expect(deletion).not.toBeVisible()
  }
  await deleteDepartment(child)
  await deleteDepartment(root)
})
test('positions and member binding persist through a new browser and prevent deleting a referenced position', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const name = `岗位验收-${randomUUID().slice(0, 8)}`
  let departmentId = ''
  try {
    await login(page, 'a-admin')
    await page.goto('/system/positionSystem')
    const employee = page.locator('tbody tr').filter({ hasText: 'A 员工' })
    await employee
      .getByRole('button', { name: '组织绑定', exact: true })
      .click()
    const assignment = page.getByRole('dialog', { name: '成员组织绑定' })
    departmentId = await assignment.getByLabel('成员部门').inputValue()
    await assignment.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '新增岗位', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '岗位编辑' })
    await page.keyboard.press('Escape')
    await expect(editor).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: '新增岗位', exact: true })
    ).toBeFocused()
    await page.getByRole('button', { name: '新增岗位', exact: true }).click()
    await editor.getByPlaceholder('请输入岗位名称').fill(name)
    await selectField(page, editor, '所属部门', '业务部')
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).not.toBeVisible()
    const position = page.locator('tbody tr').filter({ hasText: name })
    await expect(position).toBeVisible()
    await position.getByRole('button', { name: '编辑', exact: true }).click()
    await editor.getByPlaceholder('请输入岗位名称').fill(`${name}-更新`)
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await employee
      .getByRole('button', { name: '组织绑定', exact: true })
      .click()
    await assignment
      .getByLabel('成员岗位')
      .selectOption({ label: `${name}-更新` })
    await assignment
      .getByRole('button', { name: '保存绑定', exact: true })
      .click()
    await expect(assignment).not.toBeVisible()
    await page.reload()
    await employee
      .getByRole('button', { name: '组织绑定', exact: true })
      .click()
    await expect(
      assignment.getByLabel('成员岗位').locator('option:checked')
    ).toHaveText(`${name}-更新`)
    await assignment.getByRole('button', { name: '取消', exact: true }).click()
    await position.getByRole('button', { name: '删除', exact: true }).click()
    await page
      .getByRole('dialog', { name: '确认操作', exact: true })
      .getByRole('button', { name: '确认', exact: true })
      .click()
    await expect(
      page.getByRole('dialog', { name: '确认操作', exact: true })
    ).not.toBeVisible()
    await expect(
      page.getByTestId('position-system').getByRole('alert')
    ).toHaveText('岗位有关联成员，不能删除')
    await page.screenshot({
      path: 'test-results/full-product/position-binding-1440.png',
      fullPage: true,
    })
    const other = await browser.newContext()
    try {
      const fresh = await other.newPage()
      await login(fresh, 'a-admin')
      await fresh.goto('/system/positionSystem')
      await fresh
        .locator('tbody tr')
        .filter({ hasText: 'A 员工' })
        .getByRole('button', { name: '组织绑定', exact: true })
        .click()
      const reopened = fresh.getByRole('dialog', { name: '成员组织绑定' })
      await expect(
        reopened.getByLabel('成员岗位').locator('option:checked')
      ).toHaveText(`${name}-更新`)
      await reopened.getByRole('button', { name: '取消', exact: true }).click()
    } finally {
      await other.close()
    }
    const tenantB = await browser.newContext()
    try {
      const fresh = await tenantB.newPage()
      await login(fresh, 'b-admin')
      const positionsLoaded = fresh.waitForResponse(
        (response) =>
          response.url().includes('/api/system/positions') &&
          response.request().method() === 'GET' &&
          response.status() === 200
      )
      await fresh.goto('/system/positionSystem')
      await positionsLoaded
      await expect(fresh.getByTestId('position-system')).toBeVisible()
      await expect(fresh.getByText('B 员工', { exact: true })).toBeVisible()
      await expect(
        fresh.locator('tbody').filter({ hasText: name })
      ).toHaveCount(0)
      await fresh.goto('/system/departmentSystem')
      await expect(
        fresh.getByTestId('department-tree-panel')
      ).not.toContainText(name)
    } finally {
      await tenantB.close()
    }
    await employee
      .getByRole('button', { name: '组织绑定', exact: true })
      .click()
    await assignment.getByLabel('成员部门').selectOption(departmentId)
    await assignment.getByLabel('成员岗位').selectOption('')
    await assignment
      .getByRole('button', { name: '保存绑定', exact: true })
      .click()
    await expect(assignment).not.toBeVisible()
    await position.getByRole('button', { name: '删除', exact: true }).click()
    await page
      .getByRole('dialog', { name: '确认操作', exact: true })
      .getByRole('button', { name: '确认', exact: true })
      .click()
    await expect(position).toHaveCount(0)
  } finally {
    await context.close()
  }
})
