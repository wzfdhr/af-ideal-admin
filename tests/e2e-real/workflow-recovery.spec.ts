import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page } from '@playwright/test'

const login = async (page: Page, user: string, password = user) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill(user)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}
const confirm = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
test('real own-task transfer preserves errors and removes old actions, then supervisor recovers a revoked next reviewer without changing the release', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext())
  )
  const [admin, employee, original, newOwner, foreign] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  const suffix = randomUUID().slice(0, 8)
  const name = `交接恢复-${suffix}`
  let authorization:
    | { roleIds: string[]; directPermissions: string[] }
    | undefined
  let restored = false
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
      code: `assign-${suffix}`,
      template: 'equipment',
    })
    const form = await call(
      `/form-schemas/${app.formDraftId}`,
      undefined,
      'GET'
    )
    const workflow = await call(
      `/workflows/${app.workflowDraftId}`,
      undefined,
      'GET'
    )
    const release = await call(`/applications/${app.id}/releases`, {
      formDraftId: form.id,
      workflowDraftId: workflow.id,
      formRevision: form.revision,
      workflowRevision: workflow.revision,
      expectedRevision: app.revision,
    })
    await login(employee, 'a-employee')
    await login(original, 'a-manager-1')
    await login(newOwner, 'a-manager-2')
    const create = async () => {
      await employee.goto('/business/records')
      await employee
        .getByLabel('业务应用', { exact: true })
        .selectOption({ label: name })
      await employee
        .getByRole('button', { name: '新建业务申请', exact: true })
        .click()
      const root = employee.getByTestId('business-record')
      const field = (label: string) =>
        root
          .locator('.arco-form-item')
          .filter({ hasText: label })
          .locator('input,textarea')
          .first()
      await field('设备名称').fill('交接设备')
      await field('领用数量').fill('1')
      await field('领用用途').fill('真实转交与恢复')
      await employee.getByTestId('business-save').click()
      await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
      const url = employee.url()
      await employee.getByTestId('business-submit').click()
      await confirm(employee)
      await expect(
        employee.getByRole('heading', { name: '审批中', exact: true })
      ).toBeVisible()
      return url
    }
    const firstUrl = await create()
    await original.goto(firstUrl)
    const editor = original.getByTestId('workflow-assignment-editor')
    await expect(editor).toBeVisible()
    await editor
      .getByLabel('目标处理人', { exact: true })
      .selectOption('a-admin')
    await editor.getByLabel('转交或恢复原因', { exact: true }).fill('a')
    await editor.getByRole('button', { name: '转交待办', exact: true }).click()
    await expect(editor.getByRole('alert')).toContainText('两个字符')
    await expect(
      editor.getByLabel('转交或恢复原因', { exact: true })
    ).toHaveValue('a')
    await editor
      .getByLabel('转交或恢复原因', { exact: true })
      .fill('真实任务交接')
    await editor.getByRole('button', { name: '转交待办', exact: true }).click()
    await confirm(original)
    await expect(original.getByTestId('business-approve')).toHaveCount(0)
    await expect(
      original.getByText('真实任务交接', { exact: false })
    ).toBeVisible()
    await admin.goto(firstUrl)
    await expect(admin.getByTestId('business-approve')).toBeVisible()
    await admin.getByTestId('business-approve').click()
    await confirm(admin)
    await newOwner.goto(firstUrl)
    await newOwner.getByTestId('business-approve').click()
    await confirm(newOwner)
    await expect(
      newOwner.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    const secondUrl = await create()
    await original.goto(secondUrl)
    const existing = await call(
      '/system/users/a-manager-2/authorization',
      undefined,
      'GET'
    )
    authorization = {
      roleIds:
        existing.roleIds ||
        existing.roles.map((role: { id: string }) => role.id),
      directPermissions: existing.directPermissions,
    }
    await call('/system/users/a-manager-2/authorization', {
      roleIds: authorization.roleIds,
      directPermissions: authorization.directPermissions.filter(
        (code) => code !== 'workflow:approve'
      ),
      expectedRevision: existing.revision,
    })
    await original.getByTestId('business-approve').click()
    await confirm(original)
    await expect(original.getByTestId('business-error')).toContainText(
      '下一节点处理人不可用'
    )
    await admin.goto('/Scalability/workflowCenter')
    const consoleRoot = admin.getByTestId('workflow-recovery-console')
    await expect(consoleRoot).toBeVisible()
    const requestId = new URL(secondUrl).pathname.split('/').at(-1)
    const row = consoleRoot.locator('article').filter({ hasText: requestId })
    await expect(row).toContainText('下一阻塞票位 1')
    const recovery = row.getByTestId('workflow-assignment-editor')
    await recovery
      .getByLabel('目标处理人', { exact: true })
      .selectOption('a-admin')
    await recovery
      .getByLabel('转交或恢复原因', { exact: true })
      .fill('恢复失权的下一处理人')
    await recovery
      .getByRole('button', { name: '恢复下一票位', exact: true })
      .click()
    await confirm(admin)
    await expect(row).toContainText('下一阻塞票位 0')
    await original.getByTestId('business-approve').click()
    await confirm(original)
    await expect(original.getByTestId('business-approve')).toHaveCount(0)
    await admin.goto(secondUrl)
    await admin.getByTestId('business-approve').click()
    await confirm(admin)
    await expect(
      admin.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await expect(
      admin.getByText('恢复失权的下一处理人', { exact: false })
    ).toBeVisible()
    const current = await call(`/applications/${app.id}`, undefined, 'GET')
    expect(
      current.releases.find((item: { id: string }) => item.id === release.id)
        .workflowSnapshot
    ).toEqual(release.workflowSnapshot)
    await admin.screenshot({
      path: 'test-results/full-product/recovery-completed-runtime.png',
    })
    const latest = await call(
      '/system/users/a-manager-2/authorization',
      undefined,
      'GET'
    )
    await call('/system/users/a-manager-2/authorization', {
      ...authorization,
      expectedRevision: latest.revision,
    })
    restored = true
    await login(foreign, 'b-admin')
    await foreign.goto(secondUrl)
    await expect(foreign.getByTestId('business-error')).toBeVisible()
    await expect(foreign.getByTestId('business-record')).not.toContainText(
      '交接设备'
    )
  } finally {
    if (authorization && !restored) {
      const token = await admin.evaluate(() => localStorage.getItem('token'))
      const headers = {
        'x-access-token': token || '',
        'x-tenant-id': 'tenant-a',
        'idempotency-key': randomUUID(),
      }
      const read = await request.get(
        `${api}/api/system/users/a-manager-2/authorization`,
        { headers }
      )
      if (read.ok()) {
        const latest = (await read.json()).data
        await request.post(
          `${api}/api/system/users/a-manager-2/authorization`,
          {
            headers,
            data: { ...authorization, expectedRevision: latest.revision },
          }
        )
      }
    }
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('a recovery-only member opens the real recovery console without personal task or configuration requests', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const member = await memberContext.newPage()
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  const username = `recover-only-${randomUUID().slice(0, 8)}`
  const password = 'Recovery-only-browser-password-2026'
  try {
    await login(admin, 'a-admin')
    const token = await admin.evaluate(() => localStorage.getItem('token'))
    const write = async (path: string, data: unknown) => {
      const response = await request.post(`${api}/api${path}`, {
        headers: {
          'x-access-token': token || '',
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
        data,
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const user = await write('/system/users', {
      username,
      name: '仅恢复权限验收成员',
      phone: '',
      email: '',
      initialPassword: password,
      status: 'enabled',
    })
    await write(`/system/users/${user.id}/authorization`, {
      roleIds: [],
      directPermissions: ['workflow:recover'],
      expectedRevision: user.revision,
    })
    await login(member, username, password)
    await member.setViewportSize({ width: 1280, height: 720 })
    const calls: string[] = []
    member.on('request', (value) => calls.push(new URL(value.url()).pathname))
    const inspected = member.waitForResponse((value) =>
      value.url().includes('/api/workflow-exceptions')
    )
    await member.goto('/Scalability/workflowCenter')
    expect((await inspected).status()).toBe(200)
    await expect(member).toHaveURL(/\/Scalability\/workflowCenter$/)
    await expect(member.getByTestId('workflow-recovery-console')).toBeVisible()
    await expect(member.getByTestId('leave-runtime')).toHaveCount(0)
    await expect(member.getByTestId('workflow-runtime-start')).toHaveCount(0)
    expect(calls).not.toContain('/api/workflow-todos')
    expect(calls).not.toContain('/api/workflows')
    await member.keyboard.press('Tab')
    const focus = await member.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (!element || element === document.body) return false
      const rect = element.getBoundingClientRect()
      return (
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth
      )
    })
    expect(focus).toBe(true)
    await member.screenshot({
      path: 'test-results/full-product/takeover-20261003/recovery-only-runtime.png',
    })
  } finally {
    await adminContext.close()
    await memberContext.close()
  }
})
