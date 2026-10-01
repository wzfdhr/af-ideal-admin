import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import fsPath from 'node:path'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page, APIRequestContext } from '@playwright/test'

const apiUrl = process.env.R1_API_URL || 'http://127.0.0.1:10888'

test('transport failures retain input, distinguish an error from an empty list, and recover without Mock', async ({
  browser,
}) => {
  const directory = await mkdtemp(fsPath.join(os.tmpdir(), 'r1-transport-'))
  const control = fsPath.join(directory, 'control.json')
  const child = spawn(process.execPath, ['scripts/serve-r1-preview.mjs'], {
    env: {
      ...process.env,
      R1_PREVIEW_PORT: '0',
      R1_API_URL: apiUrl,
      R1_TRANSPORT_CONTROL_FILE: control,
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const origin = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Acceptance transport did not start')),
      10000
    )
    child.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) {
        clearTimeout(timeout)
        resolve(match[0])
      }
    })
    child.on('exit', () => {
      clearTimeout(timeout)
      reject(new Error('Acceptance transport exited'))
    })
  })
  const context = await browser.newContext({ baseURL: origin })
  const page = await context.newPage()
  try {
    await login(page, 'b-employee')
    await page.goto('/leave/requests/new')
    await page.locator('textarea').fill('连接中断仍保留的输入')
    await writeFile(
      control,
      JSON.stringify({ block: ['POST:/api/leave-requests'] })
    )
    await page.getByTestId('leave-save').click()
    await expect(page.getByTestId('leave-error')).toBeVisible()
    await expect(page.locator('textarea')).toHaveValue('连接中断仍保留的输入')
    await expect(page).toHaveURL(/\/leave\/requests\/new$/)
    await writeFile(control, '{}')
    await page.getByTestId('leave-save').click()
    await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    await writeFile(
      control,
      JSON.stringify({ block: ['GET:/api/leave-requests'] })
    )
    await page.goto('/leave/requests')
    await expect(page.locator('.pro-table__error')).toBeVisible()
    await expect(page.getByTestId('pro-table-empty')).toHaveCount(0)
    await writeFile(control, '{}')
    await page
      .locator('.pro-table__error')
      .getByRole('button', { name: '重试' })
      .click()
    await expect(page.locator('.pro-table__error')).toHaveCount(0)
    await expect(page.locator('tbody')).toContainText('草稿')
    await page.getByTestId('leave-status-filter').selectOption('rejected')
    await expect(page.getByTestId('pro-table-empty')).toBeVisible()
    await page.getByTestId('leave-status-filter').selectOption('draft')
    await expect(
      page.getByRole('link', { name: '继续编辑' }).first()
    ).toBeVisible()
    await page.screenshot({
      path: 'test-results/r1-ux/recovered-list.png',
      fullPage: true,
    })
    await login(page, 'cross-tenant-employee')
    await page.goto('/leave/requests/new')
    await page.locator('textarea').fill('切换失败时保留的 A 租户草稿')
    await page.getByTestId('leave-save').click()
    await expect(page).toHaveURL(/\/leave\/requests\/[a-f0-9-]+$/)
    await expect(page.getByTestId('leave-detail')).toHaveAttribute(
      'aria-busy',
      'false'
    )
    await writeFile(
      control,
      JSON.stringify({ block: ['POST:/api/tenants/switch'] })
    )
    await page.getByTestId('tenant-context-select').selectOption('tenant-b')
    await expect(page.locator('.tenant-switcher [role="alert"]')).toBeVisible()
    await expect(page.getByTestId('tenant-context-select')).toHaveValue(
      'tenant-a'
    )
    await expect(page.locator('textarea')).toHaveValue(
      '切换失败时保留的 A 租户草稿'
    )
    await writeFile(control, '{}')
  } finally {
    await context.close()
    child.kill('SIGTERM')
    await rm(directory, { recursive: true, force: true })
  }
})
const login = async (page: Page, username: string) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(username)
  await submitLogin(page)
}
const authenticated = async (
  page: Page,
  request: APIRequestContext,
  tenant = 'tenant-a'
) => {
  const token = await page.evaluate(() => localStorage.getItem('token'))
  return {
    get: async (path: string) => {
      const response = await request.get(`${apiUrl}/api${path}`, {
        headers: { 'x-access-token': token || '', 'x-tenant-id': tenant },
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data
    },
    put: async (path: string, body: unknown) => {
      const response = await request.put(`${apiUrl}/api${path}`, {
        headers: { 'x-access-token': token || '', 'x-tenant-id': tenant },
        data: body,
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data
    },
  }
}

test('publish rejection identifies the actual workflow node and leaves the active release intact', async ({
  page,
  request,
}) => {
  await login(page, 'a-admin')
  const client = await authenticated(page, request)
  const old = await client.get('/workflows/workflow-leave')
  const application = await client.get('/applications/leave')
  const schema = structuredClone(old.schema)
  const node = schema.nodes.find(
    (item: { type: string }) => item.type === 'approval'
  )
  node.config.approvers = []
  try {
    await client.put('/workflows/workflow-leave', {
      schema,
      expectedRevision: old.revision,
    })
    await page.goto('/leave/application')
    await page.getByTestId('application-publish').click()
    await page
      .getByRole('dialog', { name: '确认操作' })
      .getByRole('button', { name: '确认', exact: true })
      .click()
    await expect(page.getByTestId('application-error')).toBeVisible()
    await expect(page.getByTestId('application-validation')).toContainText(
      node.id
    )
    await expect(page.getByTestId('application-validation')).toContainText(
      '处理人'
    )
    const after = await client.get('/applications/leave')
    expect(after.activeReleaseId).toBe(application.activeReleaseId)
    expect(after.releases.length).toBe(application.releases.length)
  } finally {
    const latest = await client.get('/workflows/workflow-leave')
    await client.put('/workflows/workflow-leave', {
      schema: old.schema,
      expectedRevision: latest.revision,
    })
  }
})

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]

test('invalid date order is identified and cancelling navigation retains the draft input', async ({
  page,
}) => {
  await login(page, 'a-employee')
  await page.goto('/leave/requests/new')
  await page.locator('textarea').fill('日期错误及离开保护验收')
  const dates = page.getByPlaceholder('请选择日期')
  await dates.nth(0).fill('2026-11-05')
  await dates.nth(0).press('Enter')
  await dates.nth(1).fill('2026-11-01')
  await dates.nth(1).press('Enter')
  await page.getByTestId('leave-save').click()
  await expect(page.getByTestId('leave-error')).toBeVisible()
  await expect(page.locator('.leave-field-errors')).toContainText('结束')
  await expect(page.locator('textarea')).toHaveValue('日期错误及离开保护验收')
  await page.getByRole('button', { name: '返回我的申请' }).click()
  const dialog = page.getByRole('dialog', { name: '确认操作' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page).toHaveURL(/\/leave\/requests\/new$/)
  await expect(page.locator('textarea')).toHaveValue('日期错误及离开保护验收')
})

viewports.forEach((viewport) => {
  test(`R1 pages and confirmation keep visible keyboard focus at ${viewport.width}x${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    try {
      await login(page, 'a-manager-1')
      await [
        '/dashboard/workplace',
        '/leave/requests',
        '/Scalability/workflowCenter',
        '/message/center',
      ].reduce(async (previous, path) => {
        await previous
        await page.goto(path)
        await expect(page.locator('main').first()).toBeVisible()
        if (path === '/message/center')
          await expect(page.getByTestId('message-query')).toBeEnabled()
        else
          await expect(
            page.locator('.pro-table[aria-busy="true"]')
          ).toHaveCount(0)
        await page.keyboard.press('Tab')
        const focus = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement
          const rect = element.getBoundingClientRect()
          return {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
          }
        })
        expect(focus.width).toBeGreaterThan(0)
        expect(focus.height).toBeGreaterThan(0)
        expect(focus.left).toBeGreaterThanOrEqual(0)
        expect(focus.right).toBeLessThanOrEqual(viewport.width)
        expect(focus.overflow).toBe(false)
        await page.screenshot({
          path: `test-results/r1-ux/${viewport.width}-${path
            .split('/')
            .pop()}.png`,
          fullPage: true,
        })
      }, Promise.resolve())
      await login(page, 'a-admin')
      await page.goto('/leave/application')
      await page.getByTestId('application-publish').focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: '确认操作' })
      await expect(dialog).toBeVisible()
      const cancel = dialog.getByRole('button', { name: '取消', exact: true })
      const accept = dialog.getByRole('button', { name: '确认', exact: true })
      await expect(cancel).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(accept).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(cancel).toBeFocused()
      await page.screenshot({
        path: `test-results/r1-ux/${viewport.width}-confirm-focus.png`,
      })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(page.getByTestId('application-publish')).toBeFocused()
      await expect(page.getByText(/发布成功，当前为 v/)).toHaveCount(0)
      await page.goto('/leave/application')
      await page.screenshot({
        path: `test-results/r1-ux/${viewport.width}-application.png`,
        fullPage: true,
      })
      await login(page, 'a-auditor')
      await page.goto('/audit/logs')
      await expect(page.getByTestId('audit-log-page')).toBeVisible()
      await page.screenshot({
        path: `test-results/r1-ux/${viewport.width}-audit.png`,
        fullPage: true,
      })
    } finally {
      await context.close()
    }
  })
})
