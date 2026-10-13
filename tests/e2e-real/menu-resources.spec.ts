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

test('persisted menu resources change current navigation, survive refresh, refuse governance disable and preserve another tenant and actual backend authority', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ])
  const pages = await Promise.all(contexts.map((context) => context.newPage()))
  const [admin, other, member] = pages
  const suffix = randomUUID().slice(0, 8)
  const name = `菜单持久化-${suffix}`
  const getToken = async () =>
    admin.evaluate(() => localStorage.getItem('token'))
  const call = async (endpoint: string, body?: unknown, method = 'GET') => {
    const response = await request.fetch(
      `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${endpoint}`,
      {
        method,
        headers: {
          'x-access-token': (await getToken()) || '',
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
        ...(body ? { data: body } : {}),
      }
    )
    expect(response.status()).toBe(200)
    return (await response.json()).data
  }
  try {
    await login(admin, 'a-admin')
    await login(other, 'b-admin')
    await login(member, 'a-employee')
    await admin.goto('/system/menuSystem')
    await expect(admin.getByTestId('reference-menu-resources')).toBeVisible()
    await expect(admin.locator('tbody tr').first()).toBeVisible()
    await expect(
      admin.getByTestId('reference-menu-resources').getByRole('alert')
    ).not.toBeVisible()
    await admin.getByRole('button', { name: '新增资源', exact: true }).click()
    const editor = admin.getByTestId('menu-resource-editor')
    await editor.getByLabel('资源名称', { exact: true }).focus()
    await expect(editor.getByLabel('资源名称', { exact: true })).toBeFocused()
    await admin.keyboard.press('Tab')
    await expect(editor.getByLabel('资源类型', { exact: true })).toBeFocused()
    await editor.getByLabel('资源名称', { exact: true }).fill(name)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    const search = async (value: string) => {
      await admin.getByLabel('查询菜单名称').fill(value)
      const response = admin.waitForResponse(
        (r) =>
          r.url().includes('/api/system/menus?') &&
          new URL(r.url()).searchParams.get('menuName') === value &&
          r.request().method() === 'GET'
      )
      await admin.getByRole('button', { name: '搜索', exact: true }).click()
      expect((await response).status()).toBe(200)
    }
    await search(name)
    const row = admin.locator('tbody tr').filter({ hasText: name })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '编辑资源', exact: true }).click()
    await editor.getByLabel('资源名称', { exact: true }).fill(`${name}-重开`)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await admin.reload()
    await search(name)
    await expect(row).toContainText('重开')
    await admin.getByRole('button', { name: '新增资源', exact: true }).click()
    await editor.getByLabel('资源类型', { exact: true }).selectOption('menu')
    await editor
      .getByLabel('登记页面', { exact: true })
      .selectOption('dictSystem')
    await editor
      .getByLabel('资源名称', { exact: true })
      .fill(`字典引用-${suffix}`)
    const directories = await call(
      `/system/menus?menuName=${encodeURIComponent(name)}&pageSize=100`
    )
    const parent = directories.list.find(
      (item: { menuName: string }) => item.menuName === `${name}-重开`
    )
    expect(parent).toBeTruthy()
    await editor.getByLabel('父资源', { exact: true }).selectOption(parent.id)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await expect(admin.locator('.arco-menu')).toContainText(`${name}-重开`)
    await admin.reload()
    await expect(admin.locator('.arco-menu')).toContainText(
      `字典引用-${suffix}`
    )
    const controlled = await call('/system/menus/default-menuSystem')
    await search(controlled.menuName)
    const protectedRow = admin.locator('tbody tr').first()
    await protectedRow
      .getByRole('button', { name: '编辑资源', exact: true })
      .click()
    await editor
      .getByLabel('资源状态', { exact: true })
      .selectOption('disabled')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor.getByRole('alert')).toContainText('不能停用')
    await expect(editor.getByLabel('资源状态', { exact: true })).toHaveValue(
      'disabled'
    )
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    await other.goto('/system/menuSystem')
    await expect(other.getByTestId('reference-menu-resources')).toBeVisible()
    await other.getByLabel('查询菜单名称').fill(name)
    await other.getByRole('button', { name: '搜索', exact: true }).click()
    await expect(other.locator('tbody')).not.toContainText(name)
    await member.goto('/system/menuSystem')
    await expect(member).toHaveURL(/not-allowed/)
    await admin.goto('/system/menuSystem')
    const dictionary = await call('/system/menus/default-dictSystem')
    const write = (record: typeof dictionary, status: string) =>
      call(
        `/system/menus/${record.id}`,
        {
          menuName: record.menuName,
          menuType: record.menuType,
          routeKey: record.routeKey,
          parentId: record.parentId,
          permission: record.permission,
          sort: record.sort,
          status,
          expectedRevision: record.revision,
        },
        'PUT'
      )
    const resources = await call('/system/menus/catalogue')
    const routes = resources.parents.filter(
      (item: typeof dictionary) =>
        item.routeKey === 'dictSystem' && item.status === 'enabled'
    )
    const changed: typeof dictionary[] = []
    try {
      await routes.reduce(
        async (previous: Promise<void>, item: typeof dictionary) => {
          await previous
          changed.push(await write(item, 'disabled'))
        },
        Promise.resolve()
      )
      await admin.goto('/system/dictSystem')
      await expect(admin).toHaveURL(/not-allowed/)
      await other.goto('/system/dictSystem')
      await expect(other).toHaveURL(/system\/dictSystem/)
    } finally {
      await changed.reduce(
        async (previous: Promise<void>, item: typeof dictionary) => {
          await previous
          await write(item, 'enabled')
        },
        Promise.resolve()
      )
    }
    await admin.goto('/system/menuSystem')
    await search(name)
    await row.getByRole('button', { name: '编辑资源', exact: true }).click()
    await editor
      .getByLabel('资源状态', { exact: true })
      .selectOption('disabled')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await expect(admin.locator('.arco-menu')).not.toContainText(`${name}-重开`)
    const buttonParent = await call(
      '/system/menus',
      {
        menuName: `按钮业务入口-${suffix}`,
        menuType: 'menu',
        routeKey: 'businessRecordsList',
        parentId: null,
        permission: '',
        sort: 0,
        status: 'enabled',
      },
      'POST'
    )
    const button = await call(
      '/system/menus',
      {
        menuName: `创建按钮-${suffix}`,
        menuType: 'button',
        parentId: buttonParent.id,
        permission: 'business:create',
        sort: 0,
        status: 'disabled',
      },
      'POST'
    )
    try {
      await member.goto('/business/records')
      await expect(member.getByTestId('business-records-list')).toBeVisible()
      await expect(
        member.getByRole('button', { name: '新建业务申请', exact: true })
      ).not.toBeVisible()
      const token = await member.evaluate(() => localStorage.getItem('token'))
      const denied = await request.post(
        `${
          process.env.R1_API_URL || 'http://127.0.0.1:10888'
        }/api/system/menus`,
        {
          headers: {
            'x-access-token': token || '',
            'x-tenant-id': 'tenant-a',
            'idempotency-key': randomUUID(),
          },
          data: {
            menuName: '不能借菜单授予管理权',
            menuType: 'catalog',
            parentId: null,
            permission: '',
            sort: 0,
            status: 'enabled',
          },
        }
      )
      expect(denied.status()).toBe(403)
    } finally {
      await call(
        `/system/menus/${button.id}`,
        {
          menuName: button.menuName,
          menuType: button.menuType,
          parentId: button.parentId,
          permission: button.permission,
          sort: button.sort,
          status: 'enabled',
          expectedRevision: button.revision,
        },
        'PUT'
      )
    }
    await member.reload()
    await expect(
      member.getByRole('button', { name: '新建业务申请', exact: true })
    ).toBeVisible()
    await admin.setViewportSize({ width: 1280, height: 720 })
    await expect(
      admin.getByRole('button', { name: '新增资源', exact: true })
    ).toBeInViewport()
    await admin.screenshot({
      path: 'test-results/full-product/menus-20261013/persistent-menu-state.png',
    })
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
