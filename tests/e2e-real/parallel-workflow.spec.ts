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
  const d = page.getByRole('dialog', { name: '确认操作', exact: true })
  await d.getByRole('button', { name: '确认', exact: true }).click()
  await expect(d).not.toBeVisible()
}
test('real parallel designer creates a paired fork and an all-sign node; two live branches and three signatures join once after reopening', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext())
  )
  const [admin, employee, first, second, foreign] = await Promise.all(
    contexts.map((c) => c.newPage())
  )
  const suffix = randomUUID().slice(0, 8)
  const name = `并行会签-${suffix}`
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  try {
    await login(admin, 'a-admin')
    const token = await admin.evaluate(() => localStorage.getItem('token'))
    const call = async (path: string, data?: unknown, method = 'POST') => {
      const r = await request.fetch(`${api}/api${path}`, {
        method,
        data,
        headers: {
          'x-access-token': token || '',
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
      })
      expect(r.status()).toBe(200)
      return (await r.json()).data
    }
    const app = await call('/application-center', {
      name,
      code: `parallel-${suffix}`,
      template: 'equipment',
    })
    const initial = (
      await call(`/workflows/${app.workflowDraftId}`, undefined, 'GET')
    ).schema
    const approvals = initial.nodes.filter(
      (n: { type: string }) => n.type === 'approval'
    )
    const firstId = approvals[0].id
    const secondId = approvals[1].id
    const copyId = initial.nodes.find(
      (n: { type: string }) => n.type === 'copy'
    ).id
    const startId = initial.nodes.find(
      (n: { type: string }) => n.type === 'start'
    ).id
    const endId = initial.nodes.find(
      (n: { type: string }) => n.type === 'end'
    ).id
    const members = await call('/tenants/tenant-a/members', undefined, 'GET')
    const adminName = members.find(
      (m: { id: string }) => m.id === 'a-admin'
    ).name
    const secondName = members.find(
      (m: { id: string }) => m.id === 'a-manager-2'
    ).name
    await admin.goto(`/applications/${app.id}/configuration`)
    await admin.getByText('配置流程', { exact: true }).click()
    await admin.getByTestId('workflow-palette-parallel').click()
    const picker = admin.getByLabel('选择流程节点', { exact: true })
    const forkId = await picker.inputValue()
    const joinId = `join-${forkId}`
    await admin
      .getByTestId('workflow-node-name')
      .locator('input')
      .fill('同步分支')
    await admin.getByLabel('并行分支 1', { exact: true }).selectOption(firstId)
    await admin.getByLabel('并行分支 2', { exact: true }).selectOption(secondId)
    await admin.getByTestId('workflow-palette-sign').click()
    const signId = await picker.inputValue()
    await admin
      .getByTestId('workflow-node-name')
      .locator('input')
      .fill('联合会签')
    await admin.getByLabel('会签签署人', { exact: true }).click()
    await admin
      .locator('.arco-select-option')
      .filter({ hasText: secondName })
      .click()
    await admin
      .locator('.arco-select-option')
      .filter({ hasText: adminName })
      .click()
    await admin.keyboard.press('Escape')
    await admin
      .getByLabel('会签通过规则', { exact: true })
      .selectOption('quorum')
    await admin.getByLabel('会签批准票数', { exact: true }).fill('0')
    await admin.getByLabel('会签批准票数', { exact: true }).press('Tab')
    await admin.getByTestId('application-save-workflow').click()
    await expect(admin.getByTestId('application-error')).toBeVisible()
    await expect(admin.getByLabel('会签批准票数', { exact: true })).toHaveValue(
      '0'
    )
    await expect(admin.getByTestId('application-publish')).toBeDisabled()
    await admin.getByLabel('会签通过规则', { exact: true }).selectOption('all')
    const connect = async (source: string, target: string) => {
      await picker.selectOption(source)
      await admin.getByLabel('下一节点', { exact: true }).selectOption(target)
    }
    await connect(startId, forkId)
    await connect(firstId, joinId)
    await connect(secondId, signId)
    await connect(signId, joinId)
    await connect(joinId, copyId)
    await connect(copyId, endId)
    await admin.getByTestId('application-save-workflow').click()
    await expect(admin.getByText('流程已保存', { exact: true })).toBeVisible()
    await admin.reload()
    await admin.getByText('配置流程', { exact: true }).click()
    await admin.getByLabel('选择流程节点', { exact: true }).selectOption(signId)
    await expect(admin.getByLabel('会签通过规则', { exact: true })).toHaveValue(
      'all'
    )
    const saved = await call(
      `/workflows/${app.workflowDraftId}`,
      undefined,
      'GET'
    )
    expect(saved.schema.version).toBe(3)
    expect(
      saved.schema.nodes
        .find((n: { id: string }) => n.id === signId)
        .config.approvers.sort()
    ).toEqual(['a-admin', 'a-manager-2'])
    await admin.getByTestId('application-publish').click()
    await confirm(admin)
    await expect(
      admin.getByText('发布成功，当前为 v1', { exact: true })
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
    const field = (label: string) =>
      record
        .locator('.arco-form-item')
        .filter({ hasText: label })
        .locator('input,textarea')
        .first()
    await field('设备名称').fill('并行设备')
    await field('领用数量').fill('1')
    await field('领用用途').fill('真实并行与会签')
    await employee.getByTestId('business-save').click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    const url = employee.url()
    await employee.getByTestId('business-submit').click()
    await confirm(employee)
    await expect(
      employee
        .getByTestId('parallel-progress')
        .locator(`[data-activity-node="${forkId}"]`)
    ).toContainText('0/2')
    await login(first, 'a-manager-1')
    await login(second, 'a-manager-2')
    await first.goto(url)
    await second.goto(url)
    await expect(first.getByTestId('business-approve')).toBeVisible()
    await expect(second.getByTestId('business-approve')).toBeVisible()
    await first.getByTestId('business-approve').click()
    await confirm(first)
    await employee.reload()
    await expect(
      employee
        .getByTestId('parallel-progress')
        .locator(`[data-activity-node="${forkId}"]`)
    ).toContainText('1/2')
    await second.getByTestId('business-approve').click()
    await confirm(second)
    await expect(second.getByTestId('business-approve')).toBeVisible()
    await second.getByTestId('business-approve').click()
    await confirm(second)
    await employee.reload()
    await expect(
      employee.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await expect(
      employee
        .getByTestId('parallel-progress')
        .locator(`[data-activity-node="${signId}"]`)
    ).toContainText('已批准 1/2')
    await admin.goto(url)
    await admin.getByTestId('business-approve').click()
    await confirm(admin)
    await expect(
      admin.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.reload()
    await expect(
      employee.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await expect(
      employee
        .getByTestId('parallel-progress')
        .locator(`[data-activity-node="${forkId}"]`)
    ).toContainText('2/2')
    await employee.screenshot({
      path: 'test-results/full-product/parallel-approved-runtime.png',
    })
    await login(foreign, 'b-admin')
    await foreign.goto(url)
    await expect(foreign.getByTestId('business-error')).toBeVisible()
    await expect(foreign.getByTestId('parallel-progress')).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})
