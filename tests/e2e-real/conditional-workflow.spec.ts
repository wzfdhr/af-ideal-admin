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
test('condition designer edits real fields and connections, saves and reopens, then two actual employee records reach different reviewers', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext())
  )
  const [admin, employee, low, high, foreign] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const suffix = randomUUID().slice(0, 8)
  const name = `条件领用-${suffix}`
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  try {
    await login(admin, 'a-admin')
    const token = await admin.evaluate(() => localStorage.getItem('token'))
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
      name,
      code: `cond-${suffix}`,
      template: 'equipment',
    })
    const workflow = (
      await call(`/workflows/${app.workflowDraftId}`, undefined, 'GET')
    ).schema
    const approvals = workflow.nodes.filter(
      (node: { type: string }) => node.type === 'approval'
    )
    const lowId = approvals[0].id
    const highId = approvals[1].id
    const copyId = workflow.nodes.find(
      (node: { type: string }) => node.type === 'copy'
    ).id
    const endId = workflow.nodes.find(
      (node: { type: string }) => node.type === 'end'
    ).id
    const startId = workflow.nodes.find(
      (node: { type: string }) => node.type === 'start'
    ).id
    await admin.goto(`/applications/${app.id}/configuration`)
    await admin.getByText('配置流程', { exact: true }).click()
    await admin.getByTestId('workflow-palette-condition').click()
    const picker = admin.getByLabel('选择流程节点', { exact: true })
    const conditionId = await picker.inputValue()
    await admin
      .getByTestId('workflow-node-name')
      .locator('input')
      .fill('金额分流')
    await admin.getByLabel('条件值 1', { exact: true }).fill('')
    await admin.getByLabel('条件值 1', { exact: true }).press('Tab')
    await expect(
      admin.getByRole('region', { name: '条件节点配置' }).getByRole('alert')
    ).toBeVisible()
    await expect(admin.getByLabel('条件值 1', { exact: true })).toHaveValue('')
    await admin.getByTestId('application-save-workflow').click()
    await expect(admin.getByTestId('application-error')).toBeVisible()
    await expect(admin.getByLabel('条件值 1', { exact: true })).toHaveValue('')
    await expect(admin.getByTestId('application-publish')).toBeDisabled()
    await admin
      .getByLabel('条件字段 1', { exact: true })
      .selectOption('totalAmount')
    await admin.getByLabel('条件判断 1', { exact: true }).selectOption('gte')
    await admin.getByLabel('条件值 1', { exact: true }).fill('100.00')
    await admin.getByLabel('条件值 1', { exact: true }).press('Tab')
    await admin.getByLabel('匹配分支目标', { exact: true }).selectOption(highId)
    await admin.getByLabel('默认分支目标', { exact: true }).selectOption(lowId)
    const connect = async (source: string, target: string) => {
      await picker.selectOption(source)
      await admin.getByLabel('下一节点', { exact: true }).selectOption(target)
    }
    await connect(startId, conditionId)
    await connect(lowId, copyId)
    await connect(highId, copyId)
    await connect(copyId, endId)
    await admin.getByTestId('application-save-workflow').click()
    await expect(admin.getByText('流程已保存', { exact: true })).toBeVisible()
    await admin.reload()
    await admin.getByText('配置流程', { exact: true }).click()
    await admin
      .getByLabel('选择流程节点', { exact: true })
      .selectOption(conditionId)
    await expect(admin.getByLabel('条件值 1', { exact: true })).toHaveValue(
      '100.00'
    )
    await expect(admin.getByLabel('默认分支目标', { exact: true })).toHaveValue(
      lowId
    )
    await admin.getByTestId('application-publish').click()
    await confirm(admin)
    await expect(
      admin.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    await login(employee, 'a-employee')
    await login(low, 'a-manager-1')
    await login(high, 'a-manager-2')
    const urls: string[] = []
    const create = async (amount: string) => {
      await employee.goto('/business/records')
      await employee
        .getByLabel('业务应用', { exact: true })
        .selectOption({ label: name })
      await employee
        .getByRole('button', { name: '新建业务申请', exact: true })
        .click()
      const record = employee.getByTestId('business-record')
      const field = (label: string) =>
        record
          .locator('.arco-form-item')
          .filter({ hasText: label })
          .locator('input,textarea')
          .first()
      await field('设备名称').fill(`条件设备-${amount}`)
      await field('领用数量').fill('1')
      await field('参考单价').fill(amount)
      await field('领用用途').fill('验证真实金额分支')
      await employee.getByTestId('business-save').click()
      await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
      const url = employee.url()
      urls.push(url)
      await employee.getByTestId('business-submit').click()
      await confirm(employee)
      await expect(
        employee.getByRole('heading', { name: '审批中', exact: true })
      ).toBeVisible()
      return url
    }
    const lower = await create('99.99')
    await expect(employee.getByText('默认分支', { exact: false })).toBeVisible()
    await low.goto(lower)
    await expect(low.getByTestId('business-approve')).toBeVisible()
    await high.goto(lower)
    await expect(high.getByTestId('business-approve')).toHaveCount(0)
    await low.getByTestId('business-approve').click()
    await confirm(low)
    await expect(
      low.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    const upper = await create('100.00')
    await expect(employee.getByText('匹配分支', { exact: false })).toBeVisible()
    await high.goto(upper)
    await expect(high.getByTestId('business-approve')).toBeVisible()
    await low.goto(upper)
    await expect(low.getByTestId('business-approve')).toHaveCount(0)
    await high.getByTestId('business-approve').click()
    await confirm(high)
    await expect(
      high.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.goto(upper)
    await expect(
      employee.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.screenshot({
      path: 'test-results/full-product/condition-approved-runtime.png',
    })
    await admin.setViewportSize({ width: 1280, height: 720 })
    await admin.getByLabel('选择流程节点', { exact: true }).focus()
    await expect(
      admin.getByLabel('选择流程节点', { exact: true })
    ).toBeFocused()
    const panelBox = await admin
      .getByTestId('workflow-property-panel')
      .boundingBox()
    expect(panelBox?.height).toBeLessThan(1000)
    await admin.getByTestId('workflow-property-panel').screenshot({
      path: 'test-results/full-product/condition-editor-runtime.png',
    })
    await admin
      .getByLabel('默认分支目标', { exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      admin.getByLabel('默认分支目标', { exact: true })
    ).toBeInViewport()
    await admin.getByLabel('默认分支目标', { exact: true }).focus()
    await expect(
      admin.getByLabel('默认分支目标', { exact: true })
    ).toBeFocused()
    await admin.getByTestId('workflow-property-panel').screenshot({
      path: 'test-results/full-product/condition-editor-branches-runtime.png',
    })
    await login(foreign, 'b-admin')
    await foreign.goto(urls[0])
    await expect(foreign.getByTestId('business-error')).toBeVisible()
    await expect(foreign.getByTestId('business-record')).not.toContainText(
      '条件设备'
    )
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
