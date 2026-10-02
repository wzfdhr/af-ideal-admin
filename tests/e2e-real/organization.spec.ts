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
const findOrganizationMember = async (
  page: Page,
  name: string,
  remaining = 100
): Promise<Locator> => {
  expect(
    remaining,
    'member must be reachable through actual pagination'
  ).toBeGreaterThan(0)
  const list = page.getByTestId('organization-member-list')
  await expect(list.locator('tbody tr').first()).toBeVisible()
  await expect(list.locator('.arco-spin-loading')).toHaveCount(0)
  const member = list.locator('tbody tr').filter({ hasText: name })
  if (await member.count()) return member
  const next = list.locator('.arco-pagination-item-next')
  await expect(next).not.toHaveClass(/arco-pagination-item-disabled/)
  const loaded = page.waitForResponse(
    (response) =>
      response.url().includes('/api/system/organization-members') &&
      response.request().method() === 'GET' &&
      response.status() === 200
  )
  await next.click()
  await (await loaded).finished()
  return findOrganizationMember(page, name, remaining - 1)
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
test('department editing cannot import an unseen subtree into a scoped role and retains the rejected form', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const suffix = randomUUID().slice(0, 8)
  const destinationName = `授权根-${suffix}`
  const sourceName = `受保护移入-${suffix}`
  const username = `tree-scope-${suffix}`
  const password = 'Tree-scope-private-browser-2026'
  try {
    await login(page, 'a-admin')
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const call = async (path: string, data: unknown, method = 'POST') => {
      const response = await request.fetch(
        `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${path}`,
        {
          method,
          data,
          headers: {
            'x-access-token': token || '',
            'x-tenant-id': 'tenant-a',
            'idempotency-key': randomUUID(),
          },
        }
      )
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const destination = await call('/system/departments', {
      departmentName: destinationName,
      parentId: null,
      leader: '',
      sort: 0,
      status: 'enabled',
    })
    const source = await call('/system/departments', {
      departmentName: sourceName,
      parentId: null,
      leader: '',
      sort: 0,
      status: 'enabled',
    })
    const user = await call('/system/users', {
      username,
      name: '树范围合成操作者',
      phone: '',
      email: '',
      initialPassword: password,
      status: 'enabled',
    })
    const membership = await call(
      `/system/organization-members/${user.id}/assign`,
      {
        departmentId: destination.id,
        positionId: null,
        expectedRevision: user.revision,
      }
    )
    const role = await call('/system/roles', {
      roleName: `树范围-${suffix}`,
      roleKey: `tree-scope-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions: [
        'system:department:list',
        'system:department:update',
        'system:user:list',
        'system:user:detail',
      ],
    })
    await call(
      `/permissions/data-scopes/${role.id}`,
      {
        dataScope: 'department-and-children',
        departmentIds: [],
        fieldPermissions: ['username', 'name', 'dept', 'status'],
        expectedRevision: 1,
      },
      'PUT'
    )
    await call(`/system/users/${user.id}/authorization`, {
      roleIds: [role.id],
      directPermissions: [],
      expectedRevision: membership.revision,
    })
    await page.goto('/login')
    await page
      .getByRole('textbox', { name: '用户名', exact: true })
      .fill(username)
    await page
      .getByRole('textbox', { name: '密码', exact: true })
      .fill(password)
    await submitLogin(page)
    await page.goto('/system/departmentSystem')
    await page
      .locator('.department-system-page__query')
      .getByPlaceholder('请输入部门名称')
      .fill(sourceName)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    const row = page.locator('tbody tr').filter({ hasText: sourceName })
    await expect(row).toBeVisible()
    await expect(
      row.getByRole('button', { name: '编辑', exact: true })
    ).toHaveCount(0)
    const currentRole = await call(`/system/roles/${role.id}`, undefined, 'GET')
    await call(
      `/system/roles/${role.id}`,
      {
        roleName: currentRole.roleName,
        roleKey: currentRole.roleKey,
        roleSort: currentRole.roleSort,
        remark: currentRole.remark,
        status: currentRole.status,
        permissions: [...currentRole.permissions, 'system:department:detail'],
        expectedRevision: currentRole.revision,
      },
      'PUT'
    )
    await page.reload()
    await page
      .locator('.department-system-page__query')
      .getByPlaceholder('请输入部门名称')
      .fill(sourceName)
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const editor = page.getByTestId('department-editor-modal')
    await expect(editor).toBeVisible()
    await selectField(page, editor, '父部门', destinationName)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).toBeVisible()
    await expect(editor).toContainText(
      '不能通过角色或直接授权扩大自身可管理的数据范围或字段'
    )
    await expect(editor.getByPlaceholder('请输入部门名称')).toHaveValue(
      sourceName
    )
    await page.screenshot({
      path: 'test-results/full-product/department-tree-scope-rejection.png',
      fullPage: false,
      animations: 'disabled',
    })
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    const unchanged = await request.get(
      `${
        process.env.R1_API_URL || 'http://127.0.0.1:10888'
      }/api/system/departments/${source.id}`,
      { headers: { 'x-access-token': token || '', 'x-tenant-id': 'tenant-a' } }
    )
    expect(unchanged.status()).toBe(200)
    expect((await unchanged.json()).data.parentId).toBeNull()
    const revoke = await call(`/system/roles/${role.id}`, undefined, 'GET')
    await call(
      `/system/roles/${role.id}`,
      {
        roleName: revoke.roleName,
        roleKey: revoke.roleKey,
        roleSort: revoke.roleSort,
        remark: revoke.remark,
        status: revoke.status,
        permissions: revoke.permissions.filter(
          (code: string) => code !== 'system:department:update'
        ),
        expectedRevision: revoke.revision,
      },
      'PUT'
    )
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(editor).toBeVisible()
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page).toHaveURL(/not-allowed/)
  } finally {
    await context.close()
  }
})
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
    await first
      .locator('.department-system-page__query')
      .getByPlaceholder('请输入部门名称')
      .fill(name)
    await first.getByRole('button', { name: '搜索', exact: true }).click()
    let row = first.locator('tbody tr').filter({ hasText: name })
    await expect(row).toBeVisible()
    await first.reload()
    await first
      .locator('.department-system-page__query')
      .getByPlaceholder('请输入部门名称')
      .fill(name)
    await first.getByRole('button', { name: '搜索', exact: true }).click()
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
    await (await findOrganizationMember(page, 'A 员工'))
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
    await (await findOrganizationMember(page, 'A 员工'))
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
    await (await findOrganizationMember(page, 'A 员工'))
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
      const persistedEmployee = await findOrganizationMember(fresh, 'A 员工')
      await persistedEmployee
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
    await (await findOrganizationMember(page, 'A 员工'))
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
