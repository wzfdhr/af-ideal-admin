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
const confirm = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
test('rule editor saves and reopens structured behavior; real employee clears hidden values, recovers validation errors and submits the pinned release', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const employeeContext = await browser.newContext()
  const otherContext = await browser.newContext()
  const page = await adminContext.newPage()
  const employee = await employeeContext.newPage()
  const other = await otherContext.newPage()
  const suffix = randomUUID().slice(0, 8)
  const name = `联动领用-${suffix}`
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  try {
    await login(page, 'a-admin')
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const call = async (path: string, data?: unknown, method = 'POST') => {
      const response = await request.fetch(`${api}/api${path}`, {
        method,
        data,
        headers: {
          'x-access-token': token || '',
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const app = await call('/application-center', {
      code: `rules-${suffix}`,
      name,
      description: '',
      template: 'equipment',
    })
    const draft = await call(
      `/form-schemas/${app.formDraftId}`,
      undefined,
      'GET'
    )
    const schema = structuredClone(draft.schema)
    schema.version = 2
    schema.widgetsConfig.push(
      {
        uid: 'recipient',
        type: 'input',
        name: '接收范围',
        config: {
          id: 'recipient',
          label: '接收范围',
          required: true,
          defaultValue: 'internal',
          maxLength: 30,
        },
      },
      {
        uid: 'contact',
        type: 'input',
        name: '联系邮箱',
        config: {
          id: 'contact',
          label: '联系邮箱',
          defaultValue: 'should-not-return@example.test',
          maxLength: 254,
        },
      },
      {
        uid: 'confirmation',
        type: 'input',
        name: '确认名称',
        config: {
          id: 'confirmation',
          label: '确认名称',
          required: true,
          maxLength: 100,
        },
      }
    )
    await call(
      `/form-schemas/${draft.id}`,
      { schema, expectedRevision: draft.revision },
      'PUT'
    )
    await page.goto(`/applications/${app.id}/configuration`)
    const selectWidget = async (label: string) => {
      await page
        .locator('.widget-wrapper')
        .filter({
          has: page.locator('.arco-form-item-label', { hasText: label }),
        })
        .click()
      await expect(
        page.getByRole('region', { name: '字段校验与联动' })
      ).toBeVisible()
    }
    await selectWidget('联系邮箱')
    await page.getByLabel('最小字符数', { exact: true }).fill('8')
    await page.getByLabel('最小字符数', { exact: true }).press('Tab')
    await page.getByLabel('格式校验', { exact: true }).selectOption('email')
    await page
      .getByLabel('条件显示驱动字段', { exact: true })
      .selectOption('recipient')
    await page.getByLabel('条件显示匹配值', { exact: true }).fill('external')
    await page
      .getByLabel('条件必填驱动字段', { exact: true })
      .selectOption('recipient')
    await page.getByLabel('条件必填匹配值', { exact: true }).fill('external')
    await selectWidget('确认名称')
    await page.getByLabel('比较字段', { exact: true }).selectOption('itemName')
    await page.getByTestId('application-save-form').click()
    await expect(page.getByText('表单已保存', { exact: true })).toBeVisible()
    await page.reload()
    await selectWidget('联系邮箱')
    await expect(page.getByLabel('格式校验', { exact: true })).toHaveValue(
      'email'
    )
    await expect(
      page.getByLabel('条件显示匹配值', { exact: true })
    ).toHaveValue('external')
    const saved = await call(`/form-schemas/${draft.id}`, undefined, 'GET')
    expect(
      saved.schema.widgetsConfig.find(
        (widget: { uid: string }) => widget.uid === 'contact'
      ).config.validation
    ).toEqual({ minLength: 8, format: 'email' })
    await page.getByTestId('application-publish').click()
    await confirm(page)
    await expect(
      page.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    await login(employee, 'a-employee')
    await employee.goto('/business/records')
    await employee
      .getByLabel('业务应用', { exact: true })
      .selectOption({ label: name })
    await employee
      .getByRole('button', { name: '新建业务申请', exact: true })
      .click()
    const record = employee.getByTestId('business-record')
    const input = (label: string) =>
      record
        .locator('.arco-form-item')
        .filter({
          has: employee.locator('.arco-form-item-label', { hasText: label }),
        })
        .locator('input,textarea')
        .first()
    await expect(input('接收范围')).toHaveValue('internal')
    await expect(input('联系邮箱')).toHaveCount(0)
    await input('设备名称').fill('真实设备')
    await input('领用数量').fill('1')
    await input('领用用途').fill('验证结构化规则')
    await input('确认名称').fill('不一致')
    await employee.getByTestId('business-save').click()
    await expect(employee.getByTestId('business-error')).toContainText(
      '字段比较'
    )
    await expect(input('设备名称')).toHaveValue('真实设备')
    await input('确认名称').fill('真实设备')
    await input('接收范围').fill('external')
    await expect(input('联系邮箱')).toBeVisible()
    await input('联系邮箱').fill('bad-mail')
    await employee.getByTestId('business-save').click()
    await expect(employee.getByTestId('business-error')).toContainText(
      '邮箱格式无效'
    )
    await input('联系邮箱').fill('stale@example.test')
    await input('接收范围').fill('internal')
    await expect(input('联系邮箱')).toHaveCount(0)
    await input('接收范围').fill('external')
    await expect(input('联系邮箱')).toHaveValue('')
    await employee.getByTestId('business-save').click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    const url = employee.url()
    await employee.getByTestId('business-submit').click()
    await confirm(employee)
    await expect(employee.getByTestId('business-error')).toContainText('必填')
    await input('联系邮箱').fill('real@example.test')
    await employee.getByTestId('business-save').click()
    await employee.reload()
    await expect(input('联系邮箱')).toHaveValue('real@example.test')
    await employee.getByTestId('business-submit').click()
    await confirm(employee)
    await expect(
      employee.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await employee.screenshot({
      path: 'test-results/full-product/form-behavior-runtime.png',
    })
    await login(other, 'b-employee')
    await other.goto(url)
    await expect(other.getByTestId('business-error')).toBeVisible()
    await expect(other.getByTestId('business-record')).not.toContainText(
      'real@example.test'
    )
  } finally {
    await adminContext.close()
    await employeeContext.close()
    await otherContext.close()
  }
})
