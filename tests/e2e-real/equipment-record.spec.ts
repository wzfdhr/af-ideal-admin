import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page, Response } from '@playwright/test'

const login = async (page: Page, user: string) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(user)
  await submitLogin(page)
}
const confirm = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
const field = (page: Page, label: string) =>
  page
    .getByTestId('business-record')
    .locator('.arco-form-item')
    .filter({ hasText: label })
    .locator('input,textarea')
test('equipment template uses shared designers, true saved records and the common two-reviewer workflow without pretending to be leave', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const employeeContext = await browser.newContext()
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const employee = await employeeContext.newPage()
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()
  const suffix = randomUUID().slice(0, 8)
  const name = `设备领用验收-${suffix}`
  const code = `equip-${suffix}`
  try {
    await login(admin, 'a-admin')
    await admin.goto('/applications/center')
    await admin.getByRole('button', { name: '创建应用', exact: true }).click()
    const editor = admin.getByTestId('application-center-editor')
    await editor.getByLabel('应用名称', { exact: true }).fill(name)
    await editor.getByLabel('应用标识', { exact: true }).fill(code)
    await editor.getByLabel('初始模板').selectOption('equipment')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await admin.getByLabel('查询应用').fill(code)
    await admin.getByRole('button', { name: '查询', exact: true }).click()
    const appRow = admin.locator('tbody tr').filter({ hasText: code })
    await appRow.getByRole('button', { name: '配置', exact: true }).click()
    await expect(
      admin.getByRole('heading', { name, exact: true })
    ).toBeVisible()
    await admin.getByTestId('application-save-form').click()
    await admin.getByText('配置流程', { exact: true }).click()
    await admin.getByTestId('application-save-workflow').click()
    await admin.getByTestId('application-publish').click()
    await confirm(admin)
    await expect(
      admin.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    await login(employee, 'a-employee')
    await employee.goto('/business/records')
    await expect(employee.getByTestId('business-records-list')).toBeVisible()
    await employee
      .getByLabel('业务应用', { exact: true })
      .selectOption({ label: name })
    await employee
      .getByRole('button', { name: '新建业务申请', exact: true })
      .click()
    await expect(employee.getByTestId('business-record')).toBeVisible()
    await field(employee, '设备名称').fill(`键盘-${suffix}`)
    await field(employee, '领用数量').fill('3')
    await field(employee, '参考单价').fill('0.10')
    await field(employee, '领用用途').fill('真实设备领用闭环')
    await expect(employee.getByTestId('business-total')).toHaveText('0.30 元')
    await employee.getByTestId('business-save').click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    const url = employee.url()
    const id = new URL(url).pathname.split('/').at(-1)
    await employee.reload()
    await expect(field(employee, '设备名称')).toHaveValue(`键盘-${suffix}`)
    await expect(employee.getByTestId('business-total')).toHaveText('0.30 元')
    await employee.getByTestId('business-submit').click()
    await confirm(employee)
    await expect(
      employee.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await login(first, 'a-manager-1')
    const initialTasks = first.waitForResponse((response) => {
      const requestUrl = new URL(response.url())
      return (
        requestUrl.pathname === '/api/workflow-todos' &&
        requestUrl.searchParams.get('current') === '1' &&
        response.request().method() === 'GET'
      )
    })
    await first.goto('/Scalability/workflowCenter')
    const taskList = first.getByTestId('leave-runtime')
    const detailPath = new URL(url).pathname
    const findTask = async (response: Response): Promise<void> => {
      expect(response.status()).toBe(200)
      const requestUrl = new URL(response.url())
      const current = Number(requestUrl.searchParams.get('current'))
      const pageSize = Number(requestUrl.searchParams.get('pageSize'))
      const data = (await response.json()).data as {
        list: {
          requestId: string
          recordLink: string
          businessKind: string
        }[]
        total: number
      }
      const index = data.list.findIndex(
        (task) =>
          task.requestId === id &&
          task.recordLink === detailPath &&
          task.businessKind === 'generic'
      )
      await expect(taskList.locator('.arco-spin-loading')).toHaveCount(0)
      if (index >= 0) {
        const taskLink = taskList
          .locator('tbody tr')
          .nth(index)
          .getByRole('link', { name: '查看并处理', exact: true })
        await expect(taskLink).toHaveAttribute('href', detailPath)
        await taskLink.click()
        return
      }
      expect(
        current * pageSize,
        'the assigned equipment task must exist within the server-reported todo total'
      ).toBeLessThan(data.total)
      const next = taskList.locator('.arco-pagination-item-next')
      await expect(next).not.toHaveClass(/arco-pagination-item-disabled/)
      const loaded = first.waitForResponse((nextResponse) => {
        const nextUrl = new URL(nextResponse.url())
        return (
          nextUrl.pathname === '/api/workflow-todos' &&
          nextUrl.searchParams.get('current') === String(current + 1) &&
          nextUrl.searchParams.get('pageSize') === String(pageSize) &&
          nextResponse.request().method() === 'GET'
        )
      })
      await next.click()
      await findTask(await loaded)
    }
    await findTask(await initialTasks)
    await expect(first).toHaveURL(url)
    await expect(first.getByTestId('business-total')).toHaveText('0.30 元')
    await first.getByLabel('处理意见').fill('设备信息已核实')
    await first.getByTestId('business-approve').click()
    await confirm(first)
    await expect(first.getByTestId('business-approve')).toHaveCount(0)
    await login(second, 'a-manager-2')
    await second.goto(url)
    await second.getByLabel('处理意见').fill('同意领用')
    await second.getByTestId('business-approve').click()
    await confirm(second)
    await expect(
      second.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.reload()
    await expect(
      employee.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await expect(employee.getByTestId('business-save')).toHaveCount(0)
    await expect(employee.getByText('同意领用', { exact: false })).toBeVisible()
    const token = await employee.evaluate(() => localStorage.getItem('token'))
    const legacy = await request.get(
      `${
        process.env.R1_API_URL || 'http://127.0.0.1:10888'
      }/api/leave-requests/${id}`,
      { headers: { 'x-access-token': token || '', 'x-tenant-id': 'tenant-a' } }
    )
    expect(legacy.status()).toBe(404)
    await employee.screenshot({
      path: 'test-results/full-product/equipment-approved-runtime.png',
    })
  } finally {
    await adminContext.close()
    await employeeContext.close()
    await firstContext.close()
    await secondContext.close()
  }
})
