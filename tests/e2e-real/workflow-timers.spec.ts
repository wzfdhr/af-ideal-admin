import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page, APIRequestContext } from '@playwright/test'

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
const caller =
  (request: APIRequestContext, token: string, tenant = 'tenant-a') =>
  async (path: string, data?: unknown, method = 'GET') => {
    const result = await request.fetch(
      `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${path}`,
      {
        method,
        data,
        headers: {
          'x-access-token': token,
          'x-tenant-id': tenant,
          'idempotency-key': randomUUID(),
        },
      }
    )
    expect(result.status()).toBe(200)
    return (await result.json()).data
  }
const submitEquipment = async (employee: Page, name: string) => {
  await employee.goto('/business/records')
  await employee
    .getByLabel('业务应用', { exact: true })
    .selectOption({ label: name })
  await employee
    .getByRole('button', { name: '新建业务申请', exact: true })
    .click()
  const field = (label: string) =>
    employee
      .getByTestId('business-record')
      .locator('.arco-form-item')
      .filter({ hasText: label })
      .locator('input,textarea')
      .first()
  await field('设备名称').fill('真实定时设备')
  await field('领用数量').fill('1')
  await field('领用用途').fill('真实定时执行验收')
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

test('timed designer keeps invalid input, saves and reopens v4, then the real worker wakes approval and delivers a deadline reminder before two actual votes', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext())
  )
  const [admin, employee, first, second] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const name = `定时设计验收-${randomUUID().slice(0, 8)}`
  try {
    await login(admin, 'a-admin')
    const call = caller(
      request,
      (await admin.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const app = await call(
      '/application-center',
      {
        name,
        code: `timed-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
      'POST'
    )
    const original = (await call(`/workflows/${app.workflowDraftId}`)).schema
    const approvals = original.nodes.filter(
      (node: { type: string }) => node.type === 'approval'
    )
    const start = original.nodes.find(
      (node: { type: string }) => node.type === 'start'
    ).id
    const end = original.nodes.find(
      (node: { type: string }) => node.type === 'end'
    ).id
    const copy = original.nodes.find(
      (node: { type: string }) => node.type === 'copy'
    ).id
    await admin.goto(`/applications/${app.id}/configuration`)
    await admin.getByText('配置流程', { exact: true }).click()
    await admin.getByTestId('workflow-palette-wait').click()
    const picker = admin.getByLabel('选择流程节点', { exact: true })
    const wait = await picker.inputValue()
    const connect = async (source: string, target: string) => {
      await picker.selectOption(source)
      await admin.getByLabel('下一节点', { exact: true }).selectOption(target)
    }
    await connect(start, wait)
    await connect(wait, approvals[0].id)
    await connect(copy, end)
    await picker.selectOption(approvals[0].id)
    await admin.getByLabel('启用审批期限提醒', { exact: true }).check()
    await admin.getByLabel('期限秒数', { exact: true }).fill('2')
    await picker.selectOption(wait)
    await admin.getByLabel('等待秒数', { exact: true }).fill('0')
    await admin.getByTestId('application-save-workflow').click()
    await expect(admin.getByTestId('application-error')).toBeVisible()
    await expect(admin.getByLabel('等待秒数', { exact: true })).toHaveValue('0')
    await expect(admin.getByTestId('application-publish')).toBeDisabled()
    await admin.getByLabel('等待秒数', { exact: true }).fill('2')
    await admin.getByTestId('application-save-workflow').click()
    await expect(admin.getByText('流程已保存', { exact: true })).toBeVisible()
    await admin.reload()
    await admin.getByText('配置流程', { exact: true }).click()
    await admin.getByLabel('选择流程节点', { exact: true }).selectOption(wait)
    await expect(admin.getByLabel('等待秒数', { exact: true })).toHaveValue('2')
    await admin.getByTestId('application-publish').click()
    await confirm(admin)
    await expect(
      admin.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    const published = await call(`/applications/${app.id}`)
    expect(published.releases[0].workflowSnapshot.version).toBe(4)
    await login(employee, 'a-employee')
    const url = await submitEquipment(employee, name)
    const recordId = new URL(url).pathname.split('/').at(-1)
    await expect(employee.getByTestId('workflow-timer-progress')).toContainText(
      '等待唤起'
    )
    const employeeCall = caller(
      request,
      (await employee.evaluate(() => localStorage.getItem('token'))) || ''
    )
    await expect
      .poll(
        async () =>
          (
            await employeeCall(`/business/records/${recordId}`)
          ).timers.find((timer: { kind: string }) => timer.kind === 'resume')
            .status
      )
      .toBe('completed')
    await employee
      .getByRole('button', { name: '刷新定时状态', exact: true })
      .click()
    await expect(employee.getByTestId('workflow-timer-progress')).toContainText(
      '已执行'
    )
    await login(first, 'a-manager-1')
    await first.goto(url)
    await expect(first.getByTestId('business-approve')).toBeVisible()
    const firstCall = caller(
      request,
      (await first.evaluate(() => localStorage.getItem('token'))) || ''
    )
    await expect
      .poll(async () =>
        (
          await firstCall('/messages/notifications?pageSize=100')
        ).list.some(
          (item: { link: string; title: string }) =>
            item.link === `/business/records/${recordId}` &&
            item.title === '审批已超过处理期限'
        )
      )
      .toBe(true)
    await first.getByTestId('business-approve').click()
    await confirm(first)
    await login(second, 'a-manager-2')
    await second.goto(url)
    await second.getByTestId('business-approve').click()
    await confirm(second)
    await expect(
      second.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await expect(
      second.getByText('流程调度服务', { exact: false }).first()
    ).toBeVisible()
    await second.getByTestId('workflow-timer-progress').scrollIntoViewIfNeeded()
    await second.screenshot({
      path: 'test-results/full-product/scheduling-20261003/timed-approved-runtime.png',
    })
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('the actual blocked wait is restored by an authorized administrator and cross-tenant timer recovery is refused', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 2 }, () => browser.newContext())
  )
  const [admin, employee] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  const name = `定时恢复验收-${randomUUID().slice(0, 8)}`
  let authorization:
    | { roleIds: string[]; directPermissions: string[] }
    | undefined
  let call: ReturnType<typeof caller> | undefined
  try {
    await login(admin, 'a-admin')
    call = caller(
      request,
      (await admin.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const app = await call(
      '/application-center',
      {
        name,
        code: `timed-recover-${randomUUID().slice(0, 8)}`,
        template: 'equipment',
      },
      'POST'
    )
    const form = await call(`/form-schemas/${app.formDraftId}`)
    const workflow = await call(`/workflows/${app.workflowDraftId}`)
    const node = (id: string, type: string, config: object = {}) => ({
      id,
      type,
      name: id === 'approve' ? '到期后审批' : '定时等待',
      config,
    })
    const edge = (source: string, target: string) => ({
      id: `${source}-${target}`,
      source,
      target,
      label: '',
    })
    const schema = {
      version: 4,
      nodes: [
        node('start', 'start'),
        node('wait', 'wait', { delaySeconds: 3 }),
        node('approve', 'approval', { approvers: ['a-manager-1'] }),
        node('end', 'end'),
      ],
      edges: [
        edge('start', 'wait'),
        edge('wait', 'approve'),
        edge('approve', 'end'),
      ],
    }
    const saved = await call(
      `/workflows/${workflow.id}`,
      { schema, expectedRevision: workflow.revision },
      'PUT'
    )
    const release = await call(
      `/applications/${app.id}/releases`,
      {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: saved.revision,
        expectedRevision: app.revision,
      },
      'POST'
    )
    await login(employee, 'a-employee')
    const url = await submitEquipment(employee, name)
    const recordId = new URL(url).pathname.split('/').at(-1)
    const employeeCall = caller(
      request,
      (await employee.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const timer = (await employeeCall(`/business/records/${recordId}`))
      .timers[0]
    const existing = await call('/system/users/a-manager-1/authorization')
    authorization = {
      roleIds:
        existing.roleIds ||
        existing.roles.map((role: { id: string }) => role.id),
      directPermissions: existing.directPermissions,
    }
    await call(
      '/system/users/a-manager-1/authorization',
      {
        roleIds: [],
        directPermissions: authorization.directPermissions.filter(
          (permission) => permission !== 'workflow:approve'
        ),
        expectedRevision: existing.revision,
      },
      'POST'
    )
    await expect
      .poll(
        async () =>
          (
            await employeeCall(`/business/records/${recordId}`)
          ).timers[0].status,
        { timeout: 15000 }
      )
      .toBe('blocked')
    await admin.setViewportSize({ width: 1280, height: 720 })
    await admin.goto('/Scalability/workflowCenter')
    const consoleRoot = admin.getByTestId('workflow-timer-console')
    await consoleRoot
      .getByLabel('定时状态筛选', { exact: true })
      .selectOption('blocked')
    const row = consoleRoot.locator(`[data-console-timer="${timer.id}"]`)
    await expect(row).toBeVisible()
    const recovery = row.getByTestId('workflow-timer-recovery')
    await recovery.getByLabel('替换失效的下一处理人', { exact: true }).check()
    await recovery
      .getByLabel('定时目标处理人', { exact: true })
      .selectOption('a-admin')
    await recovery.getByLabel('定时恢复原因', { exact: true }).fill('a')
    await recovery
      .getByRole('button', { name: '恢复定时执行', exact: true })
      .click()
    await expect(recovery.getByRole('alert')).toContainText('两个字符')
    await expect(
      recovery.getByLabel('定时恢复原因', { exact: true })
    ).toHaveValue('a')
    await recovery
      .getByLabel('定时恢复原因', { exact: true })
      .fill('恢复已失权的到期处理人')
    const recoverButton = recovery.getByRole('button', {
      name: '恢复定时执行',
      exact: true,
    })
    await recoverButton.scrollIntoViewIfNeeded()
    await recoverButton.focus()
    await expect(recoverButton).toBeFocused()
    await recovery.screenshot({
      path: 'test-results/full-product/scheduling-20261003/timed-recovery-controls.png',
    })
    await recovery
      .getByRole('button', { name: '恢复定时执行', exact: true })
      .click()
    await confirm(admin)
    await expect
      .poll(
        async () =>
          (
            await employeeCall(`/business/records/${recordId}`)
          ).timers[0].status
      )
      .toBe('completed')
    await admin.goto(url)
    await admin.getByTestId('business-approve').click()
    await confirm(admin)
    await expect(
      admin.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    const current = await call(`/applications/${app.id}`)
    expect(
      current.releases.find((item: { id: string }) => item.id === release.id)
        .workflowSnapshot
    ).toEqual(release.workflowSnapshot)
    await admin.screenshot({
      path: 'test-results/full-product/scheduling-20261003/timed-recovery-runtime.png',
    })
    const foreignLogin = await request.post(`${api}/api/user/login`, {
      data: { username: 'b-admin', password: 'b-admin' },
    })
    expect(foreignLogin.status()).toBe(200)
    const foreignToken = (await foreignLogin.json()).data.token
    const foreign = await request.post(
      `${api}/api/workflow-timers/${timer.id}/retry`,
      {
        headers: {
          'x-access-token': foreignToken,
          'x-tenant-id': 'tenant-b',
          'idempotency-key': randomUUID(),
        },
        data: { expectedRevision: timer.revision, reason: '跨租户恢复' },
      }
    )
    expect(foreign.status()).toBe(404)
  } finally {
    if (authorization && call) {
      const current = await call('/system/users/a-manager-1/authorization')
      await call(
        '/system/users/a-manager-1/authorization',
        { ...authorization, expectedRevision: current.revision },
        'POST'
      )
    }
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('a timer read-only account sees authorized plans and cannot mount or invoke recovery, personal tasks or configuration', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const member = await memberContext.newPage()
  const username = `timer-read-${randomUUID().slice(0, 8)}`
  try {
    await login(admin, 'a-admin')
    const call = caller(
      request,
      (await admin.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const user = await call(
      '/system/users',
      {
        username,
        name: '定时只读验收成员',
        phone: '',
        email: '',
        initialPassword: username,
        status: 'enabled',
      },
      'POST'
    )
    await call(
      `/system/users/${user.id}/authorization`,
      {
        roleIds: [],
        directPermissions: ['workflow:timer:read'],
        expectedRevision: user.revision,
      },
      'POST'
    )
    await login(member, username)
    const calls: string[] = []
    member.on('request', (value) => calls.push(new URL(value.url()).pathname))
    const listed = member.waitForResponse((value) =>
      value.url().includes('/api/workflow-timers')
    )
    await member.goto('/Scalability/workflowCenter')
    expect((await listed).status()).toBe(200)
    await expect(member.getByTestId('workflow-timer-console')).toBeVisible()
    await expect(member.getByTestId('workflow-timer-recovery')).toHaveCount(0)
    await expect(member.getByTestId('workflow-recovery-console')).toHaveCount(0)
    await expect(member.getByTestId('leave-runtime')).toHaveCount(0)
    expect(calls).not.toContain('/api/workflow-todos')
    expect(calls).not.toContain('/api/workflows')
    const token =
      (await member.evaluate(() => localStorage.getItem('token'))) || ''
    const list = await caller(request, token)('/workflow-timers')
    expect(list.list.length).toBeGreaterThan(0)
    const denied = await request.post(
      `${
        process.env.R1_API_URL || 'http://127.0.0.1:10888'
      }/api/workflow-timers/${list.list[0].id}/retry`,
      {
        headers: {
          'x-access-token': token,
          'x-tenant-id': 'tenant-a',
          'idempotency-key': randomUUID(),
        },
        data: {
          expectedRevision: list.list[0].revision,
          reason: '只有读取权限',
        },
      }
    )
    expect(denied.status()).toBe(403)
  } finally {
    await adminContext.close()
    await memberContext.close()
  }
})
