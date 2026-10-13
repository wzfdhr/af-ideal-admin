import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { APIRequestContext, Page, Response } from '@playwright/test'
import type {
  MessageAnnouncementRecord,
  MessagePublishedAnnouncement,
  MessageSendJobRecord,
  MessageSubscriptionRecord,
  MessageTemplateRecord,
  MessageTemplateReview,
} from '@af-admin/contracts'

const apiUrl = process.env.R1_API_URL || 'http://127.0.0.1:10888'
const login = async (page: Page, username: string) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(username)
  await submitLogin(page)
}
const confirm = async (page: Page, keyboard = false) => {
  const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
  await expect(dialog).toBeVisible()
  if (keyboard) {
    await dialog.getByRole('button', { name: '确认', exact: true }).focus()
    await page.keyboard.press('Enter')
  } else await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
const uiResponse = (page: Page, endpoint: string, method: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${endpoint}` &&
      response.request().method() === method
  )
const dataOf = async <T>(response: Response): Promise<T> => {
  expect(response.status(), `real command ${response.url()} must succeed`).toBe(
    200
  )
  return (await response.json()).data as T
}
const caller = (
  request: APIRequestContext,
  token: string,
  tenantId = 'tenant-a'
) => {
  const raw = (endpoint: string, method?: string, data?: unknown) =>
    request.fetch(`${apiUrl}/api${endpoint}`, {
      method,
      headers: {
        'x-access-token': token,
        'x-tenant-id': tenantId,
        'idempotency-key': randomUUID(),
      },
      ...(data === undefined ? {} : { data }),
    })
  return {
    raw,
    get: async <T>(endpoint: string): Promise<T> => {
      const response = await raw(endpoint)
      expect(response.status(), `real read ${endpoint} must succeed`).toBe(200)
      return (await response.json()).data as T
    },
    command: async <T>(
      endpoint: string,
      method: string,
      data: unknown
    ): Promise<T> => {
      const response = await raw(endpoint, method, data)
      expect(
        response.status(),
        `fixture cleanup ${endpoint} must succeed`
      ).toBe(200)
      return (await response.json()).data as T
    },
  }
}
const uiCommand = async <T>(
  page: Page,
  testId: string,
  endpoint: string,
  method = 'POST',
  confirmation = true
) => {
  const response = uiResponse(page, endpoint, method)
  await page.getByTestId(testId).click()
  if (confirmation) await confirm(page)
  return dataOf<T>(await response)
}
const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem('token') || '')
const setNoticePreference = async (page: Page, subscribed: boolean) => {
  await page.goto('/message/subscriptions')
  await expect(page.getByTestId('real-message-subscriptions')).toBeVisible()
  const row = page.getByTestId('real-subscription-notice')
  await expect(row).toBeVisible()
  await page
    .getByTestId('real-subscription-toggle-notice')
    .setChecked(subscribed)
  await row.getByRole('checkbox', { name: '站内信', exact: true }).check()
  await row.getByRole('checkbox', { name: 'WebSocket', exact: true }).check()
  const save = page.getByTestId('real-subscription-save-notice')
  if (await save.isEnabled()) {
    const response = uiResponse(page, '/messaging/subscriptions/notice', 'PUT')
    await save.click()
    const stored = await dataOf<MessageSubscriptionRecord>(await response)
    expect(stored.subscribed).toBe(subscribed)
    expect(stored.deliveryModes).toEqual(['in-app', 'websocket'])
  }
  await page.reload()
  await expect(page.getByTestId('real-subscription-toggle-notice')).toBeChecked(
    { checked: subscribed }
  )
  await expect(
    row.getByRole('checkbox', { name: 'WebSocket', exact: true })
  ).toBeChecked()
  await expect(row).toContainText('服务器已保存')
  await expect(
    row.getByRole('checkbox', { name: '邮件', exact: true })
  ).toBeDisabled()
}

test('real templates require another reviewer, immutable sends persist inbox plus authenticated ACK, announcements publish and revoke, and own preferences survive reload', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000)
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ viewport: { width: 1280, height: 800 } })
    )
  )
  const [admin, reviewer, employee, foreign] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  ;[admin, reviewer, employee, foreign].forEach((page) =>
    page.on('dialog', (dialog) => dialog.accept())
  )
  const suffix = randomUUID().slice(0, 8)
  const name = `消息闭环-${suffix}`
  const title = `真实收件-${suffix}`
  const noticeTitle = `实际公告-${suffix}`
  let adminApi: ReturnType<typeof caller> | undefined
  let employeeApi: ReturnType<typeof caller> | undefined
  let originalSubscription: MessageSubscriptionRecord | undefined
  let templateId: string | undefined
  let announcementId: string | undefined
  const jobIds: string[] = []
  const serverFacts: Record<string, unknown> = {}
  const receiverFrames: {
    type: string
    receiptId?: string
    notificationId?: string
  }[] = []
  employee.on('websocket', (socket) => {
    if (!socket.url().endsWith('/api/messaging/realtime')) return
    expect(socket.url()).not.toMatch(/[?&](?:token|access_token)=/)
    socket.on('framereceived', (event) => {
      const frame = JSON.parse(String(event.payload))
      if (['ready', 'message.receipt', 'acknowledged'].includes(frame.type))
        receiverFrames.push({
          type: frame.type,
          receiptId: frame.receiptId,
          notificationId: frame.notificationId,
        })
    })
    socket.on('framesent', (event) => {
      const frame = JSON.parse(String(event.payload))
      if (frame.type === 'ack')
        receiverFrames.push({ type: 'client.ack', receiptId: frame.receiptId })
    })
  })
  try {
    await login(admin, 'a-admin')
    await login(reviewer, 'a-manager-1')
    await login(employee, 'a-employee')
    await login(foreign, 'b-admin')
    adminApi = caller(request, await tokenOf(admin))
    employeeApi = caller(request, await tokenOf(employee))
    const foreignApi = caller(request, await tokenOf(foreign), 'tenant-b')
    const subscriptions = await employeeApi.get<MessageSubscriptionRecord[]>(
      '/messaging/subscriptions'
    )
    originalSubscription = subscriptions.find(
      (item) => item.channel === 'notice'
    )
    expect(originalSubscription).toBeDefined()
    const leaveBaseline = await adminApi.get<{
      activeReleaseId: string | null
      revision: number
    }>('/applications/leave')
    serverFacts.originalLeave = {
      activeReleaseId: leaveBaseline.activeReleaseId,
      revision: leaveBaseline.revision,
    }

    await setNoticePreference(employee, false)
    await setNoticePreference(employee, true)
    await employee.goto('/message/center')
    await expect(
      employee.getByTestId('messaging-realtime-state')
    ).toContainText('已认证')
    expect(receiverFrames.some((frame) => frame.type === 'ready')).toBe(true)

    await admin.goto('/message/templates')
    await expect(admin.getByTestId('real-message-templates')).toBeVisible()
    await admin.getByTestId('messaging-template-new').click()
    await admin.getByTestId('messaging-template-name').fill(name)
    await admin
      .getByTestId('messaging-template-title')
      .fill(`${title} {{recipientName}}`)
    await admin.getByTestId('messaging-template-title').focus()
    await admin.keyboard.press('Tab')
    await expect(admin.getByTestId('messaging-template-content')).toBeFocused()
    await admin
      .getByTestId('messaging-template-content')
      .fill(`批准的真实正文 ${suffix}，收件成员 {{recipientName}}。`)
    await admin.getByTestId('messaging-variable-add').click()
    await admin.getByLabel('变量标识', { exact: true }).fill('recipientName')
    await admin.getByLabel('显示名称', { exact: true }).fill('收件成员姓名')
    await admin
      .getByTestId('messaging-template-reviewer')
      .selectOption('a-manager-1')
    await admin
      .getByRole('checkbox', { name: 'WebSocket', exact: true })
      .check()
    const draft = await uiCommand<MessageTemplateRecord>(
      admin,
      'messaging-template-save',
      '/messaging/templates',
      'POST',
      false
    )
    templateId = draft.id
    expect(draft.draftState).toBe('draft')
    expect(draft.schema.deliveryModes).toEqual(['in-app', 'websocket'])
    await expect(
      admin.getByText('模板草稿已由服务器保存；重新打开可核对持久内容', {
        exact: true,
      })
    ).toBeVisible()
    await admin.reload()
    await admin.getByTestId('messaging-template-keyword').fill(name)
    await admin.getByRole('button', { name: '查询', exact: true }).click()
    await admin.getByTestId(`messaging-template-${draft.id}`).click()
    await expect(admin.getByTestId('messaging-template-title')).toHaveValue(
      `${title} {{recipientName}}`
    )
    await expect(admin.getByTestId('messaging-template-content')).toHaveValue(
      draft.schema.content
    )
    const pending = await uiCommand<MessageTemplateRecord>(
      admin,
      'messaging-template-submit',
      `/messaging/templates/${draft.id}/submit`
    )
    expect(pending.draftState).toBe('pending')
    const review = pending.reviews?.find((item) => item.status === 'pending')
    expect(review).toBeDefined()
    const selfReview = await adminApi.raw('/messaging/templates', 'POST', {
      schema: {
        ...draft.schema,
        name: `${name}-禁止自审`,
        reviewerId: 'a-admin',
      },
    })
    expect(selfReview.status()).toBe(422)
    expect((await selfReview.json()).businessCode).toBe('MESSAGING_SELF_REVIEW')
    const forbidden = await employeeApi.raw('/messaging/templates', 'POST', {
      schema: draft.schema,
    })
    expect(forbidden.status()).toBe(403)
    expect(
      (await foreignApi.raw(`/messaging/templates/${draft.id}`)).status()
    ).toBe(404)

    const reviewerConfigReads: string[] = []
    reviewer.on('request', (value) => {
      const path = new URL(value.url()).pathname
      if (
        value.method() === 'GET' &&
        (path === '/api/messaging/templates' ||
          path === '/api/messaging/recipients')
      )
        reviewerConfigReads.push(path)
    })
    await reviewer.goto('/message/templates')
    await expect(
      reviewer.getByTestId(`messaging-review-${review?.id}`)
    ).toBeVisible()
    await expect(reviewer.getByTestId('messaging-template-new')).toHaveCount(0)
    const reviewed = await uiCommand<MessageTemplateReview>(
      reviewer,
      `messaging-review-approve-${review?.id}`,
      `/messaging/reviews/${review?.id}/decision`
    )
    expect(reviewed.status).toBe('approved')
    expect(reviewed.requestedBy).not.toBe(reviewed.reviewerId)
    expect(reviewerConfigReads).toEqual([])
    await admin.reload()
    await admin.getByTestId('messaging-template-keyword').fill(name)
    await admin.getByRole('button', { name: '查询', exact: true }).click()
    await admin.getByTestId(`messaging-template-${draft.id}`).click()
    let approved = await adminApi.get<MessageTemplateRecord>(
      `/messaging/templates/${draft.id}`
    )
    expect(approved.activeVersionId).toBeTruthy()
    expect(approved.versions?.[0].schema).toEqual(draft.schema)
    if (!approved.enabled)
      approved = await uiCommand<MessageTemplateRecord>(
        admin,
        'messaging-template-enabled',
        `/messaging/templates/${draft.id}/enabled`
      )
    serverFacts.approvedTemplate = approved
    await admin
      .getByTestId('messaging-template-title')
      .fill(`尚未审批的新标题-${suffix} {{recipientName}}`)
    const newerDraft = await uiCommand<MessageTemplateRecord>(
      admin,
      'messaging-template-save',
      `/messaging/templates/${draft.id}`,
      'PUT',
      false
    )
    expect(newerDraft).toMatchObject({
      draftState: 'draft',
      activeVersionId: approved.activeVersionId,
      enabled: true,
    })
    expect(newerDraft.schema.title).not.toBe(
      approved.versions?.[0].schema.title
    )
    serverFacts.unapprovedNewerDraft = newerDraft
    await admin
      .getByTestId('messaging-send-variable-recipientName')
      .fill('真实员工')
    await admin.getByTestId('messaging-audience-scope').selectOption('users')
    const audience = admin
      .locator('fieldset')
      .filter({ hasText: '当前租户接收范围' })
    const sendCatalogue = await adminApi.get<{
      people: { id: string; name: string }[]
    }>('/messaging/recipients?purpose=send')
    const sendEmployeeName = sendCatalogue.people.find(
      (item) => item.id === 'a-employee'
    )?.name
    expect(sendEmployeeName).toBeTruthy()
    await audience
      .getByRole('checkbox', { name: sendEmployeeName, exact: true })
      .check()
    await audience
      .getByLabel('查找指定成员', { exact: true })
      .fill(`无匹配成员-${suffix}`)
    await expect(
      audience.getByTestId('messaging-audience-selection')
    ).toContainText('当前已选择 1 人')
    await expect(audience.getByRole('checkbox')).toHaveCount(0)
    await audience
      .getByRole('button', { name: '清除成员搜索', exact: true })
      .click()
    await expect(
      audience.getByRole('checkbox', { name: sendEmployeeName, exact: true })
    ).toBeChecked()
    await admin.route(
      '**/api/messaging/templates/*/preview',
      (route) => route.abort('failed'),
      { times: 1 }
    )
    await admin.getByTestId('messaging-send-preview').click()
    await expect(
      admin.getByTestId('real-message-templates').getByRole('alert').first()
    ).toBeVisible()
    await expect(
      admin.getByTestId('messaging-send-variable-recipientName')
    ).toHaveValue('真实员工')
    await admin.getByTestId('messaging-send-preview').click()
    await expect(
      admin.getByTestId('messaging-send-preview-result')
    ).toContainText('实际接收成员：1 人')
    await expect(
      admin.getByTestId('messaging-send-preview-result')
    ).toContainText(`${title} 真实员工`)
    const beforeSearchEnter = await adminApi.get<{
      list: MessageSendJobRecord[]
      total: number
    }>(
      `/messaging/send-jobs?current=1&pageSize=20&keyword=${encodeURIComponent(
        title
      )}`
    )
    await audience
      .getByLabel('查找指定成员', { exact: true })
      .fill(sendEmployeeName || '')
    await audience.getByLabel('查找指定成员', { exact: true }).press('Enter')
    await admin.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
    )
    await expect(
      admin.getByRole('dialog', { name: '确认操作', exact: true })
    ).toHaveCount(0)
    await expect(
      admin.getByTestId('messaging-send-preview-result')
    ).toContainText(`${title} 真实员工`)
    const afterSearchEnter = await adminApi.get<{
      list: MessageSendJobRecord[]
      total: number
    }>(
      `/messaging/send-jobs?current=1&pageSize=20&keyword=${encodeURIComponent(
        title
      )}`
    )
    expect(afterSearchEnter.total).toBe(beforeSearchEnter.total)
    expect(afterSearchEnter.list.map((job) => job.id)).toEqual(
      beforeSearchEnter.list.map((job) => job.id)
    )
    await audience
      .getByRole('button', { name: '清除成员搜索', exact: true })
      .click()
    await expect(
      audience.getByRole('checkbox', { name: sendEmployeeName, exact: true })
    ).toBeChecked()
    await admin.getByTestId('messaging-send-create').click()
    const sendDialog = admin.getByRole('dialog', {
      name: '确认操作',
      exact: true,
    })
    await expect(sendDialog).toBeVisible()
    await admin.keyboard.press('Tab')
    expect(
      await sendDialog.evaluate((dialog) =>
        dialog.contains(document.activeElement)
      )
    ).toBe(true)
    await admin.keyboard.press('Escape')
    await expect(sendDialog).not.toBeVisible()
    await expect(
      admin.getByTestId('messaging-send-variable-recipientName')
    ).toHaveValue('真实员工')
    const queuedResponse = uiResponse(admin, '/messaging/send-jobs', 'POST')
    await admin.getByTestId('messaging-send-create').click()
    await confirm(admin, true)
    const queued = await dataOf<MessageSendJobRecord>(await queuedResponse)
    jobIds.push(queued.id)
    expect(queued.sourceVersionId).toBe(approved.activeVersionId)
    expect(queued.status).toBe('queued')
    expect(queued.counts.sent).toBe(0)
    await expect(admin.getByTestId('messaging-queued-receipt')).toContainText(
      '当前站内写入 0'
    )
    const inboxRow = employee
      .locator('tbody tr')
      .filter({ hasText: `${title} 真实员工` })
    await expect(inboxRow).toBeVisible({ timeout: 30000 })
    await expect
      .poll(
        async () =>
          (
            await adminApi?.get<MessageSendJobRecord>(
              `/messaging/send-jobs/${queued.id}`
            )
          )?.counts,
        { timeout: 30000 }
      )
      .toMatchObject({ sent: 1, realtimeAcknowledged: 1 })
    const delivered = await adminApi.get<MessageSendJobRecord>(
      `/messaging/send-jobs/${queued.id}`
    )
    expect(delivered.recipients).toHaveLength(1)
    const recipient = delivered.recipients?.[0]
    expect(recipient).toMatchObject({
      userId: 'a-employee',
      status: 'sent',
      realtimeStatus: 'acknowledged',
    })
    expect(recipient?.notificationId).toBeTruthy()
    expect(receiverFrames).toContainEqual({
      type: 'message.receipt',
      receiptId: recipient?.id,
      notificationId: recipient?.notificationId,
    })
    expect(receiverFrames).toContainEqual({
      type: 'client.ack',
      receiptId: recipient?.id,
    })
    const ownRead = uiResponse(
      employee,
      `/messages/notifications/${recipient?.notificationId}/read`,
      'POST'
    )
    await employee
      .getByTestId(`message-read-${recipient?.notificationId}`)
      .click()
    expect((await ownRead).status()).toBe(200)
    await expect(
      inboxRow.getByRole('button', { name: '标为已读', exact: true })
    ).toHaveCount(0)
    await admin.getByTestId('messaging-jobs-refresh').click()
    await admin.getByTestId(`messaging-job-${queued.id}`).click()
    await expect(admin.getByTestId('messaging-job-detail')).toContainText(
      '站内已写入'
    )
    await expect(admin.getByTestId('messaging-job-detail')).toContainText(
      '已收到客户端 ACK'
    )
    serverFacts.deliveredJob = delivered
    await employee.screenshot({
      path: testInfo.outputPath('receiver-center-1280.png'),
      fullPage: true,
    })
    await expect(
      admin.getByText('网络异常，请稍后重试', { exact: true })
    ).toHaveCount(0, { timeout: 10000 })
    await admin.screenshot({
      path: testInfo.outputPath('sender-composer-1280.png'),
      fullPage: true,
    })
    await admin.getByTestId('messaging-job-detail').scrollIntoViewIfNeeded()
    await admin.screenshot({
      path: testInfo.outputPath('sender-delivery-1280.png'),
      fullPage: false,
    })
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)

    await admin
      .getByTestId('messaging-send-variable-recipientName')
      .fill('计划取消')
    const future = await admin.evaluate(() => {
      const date = new Date(Date.now() + 3600000)
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    })
    await admin.getByTestId('messaging-send-scheduled-at').fill(future)
    await admin.getByTestId('messaging-send-preview').click()
    await expect(
      admin.getByTestId('messaging-send-preview-result')
    ).toBeVisible()
    const scheduled = await uiCommand<MessageSendJobRecord>(
      admin,
      'messaging-send-create',
      '/messaging/send-jobs'
    )
    jobIds.push(scheduled.id)
    expect(Date.parse(scheduled.scheduledAt)).toBeGreaterThan(
      Date.now() + 3000000
    )
    await expect(admin.getByTestId('messaging-job-detail')).toContainText(
      scheduled.id
    )
    const cancelled = await uiCommand<MessageSendJobRecord>(
      admin,
      'messaging-job-cancel',
      `/messaging/send-jobs/${scheduled.id}/cancel`
    )
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.counts).toMatchObject({ cancelled: 1, sent: 0 })
    const invalidRetry = await adminApi.raw(
      `/messaging/send-jobs/${scheduled.id}/retry`,
      'POST',
      { expectedRevision: cancelled.revision }
    )
    expect(invalidRetry.status()).toBe(409)
    serverFacts.cancelledScheduledJob = cancelled

    await admin.goto('/message/announcements')
    await admin.getByTestId('messaging-announcement-new').click()
    await admin.getByTestId('messaging-announcement-title').fill(noticeTitle)
    await admin
      .getByTestId('messaging-announcement-content')
      .fill(`原始已发布公告正文-${suffix}`)
    await admin.getByTestId('messaging-audience-scope').selectOption('users')
    const announcementPeople = await adminApi.get<{
      people: { id: string; name: string }[]
    }>('/messaging/recipients?purpose=announcement')
    const employeeName = announcementPeople.people.find(
      (person) => person.id === 'a-employee'
    )?.name
    expect(employeeName).toBeTruthy()
    await admin
      .locator('fieldset')
      .filter({ hasText: '当前租户接收范围' })
      .getByRole('checkbox', { name: employeeName, exact: true })
      .check()
    const announcement = await uiCommand<MessageAnnouncementRecord>(
      admin,
      'messaging-announcement-save',
      '/messaging/announcements',
      'POST',
      false
    )
    announcementId = announcement.id
    const publication = await uiCommand<MessageAnnouncementRecord>(
      admin,
      'messaging-announcement-publish',
      `/messaging/announcements/${announcement.id}/publish`
    )
    expect(publication.status).toBe('published')
    expect(publication.activeVersionId).toBeTruthy()
    await employee.goto('/message/announcements')
    await employee
      .getByTestId(`messaging-published-${publication.activeVersionId}`)
      .click()
    await expect(
      employee.getByTestId('messaging-announcement-read')
    ).toContainText(`原始已发布公告正文-${suffix}`)
    await expect(
      employee.getByTestId('messaging-announcement-new')
    ).toHaveCount(0)
    await admin
      .getByTestId('messaging-announcement-content')
      .fill(`尚未另行发布的新正文-${suffix}`)
    const newDraft = await uiCommand<MessageAnnouncementRecord>(
      admin,
      'messaging-announcement-save',
      `/messaging/announcements/${announcement.id}`,
      'PUT',
      false
    )
    expect(newDraft).toMatchObject({
      status: 'published',
      activeVersionId: publication.activeVersionId,
      draftChanged: true,
    })
    await employee.getByTestId('messaging-published-refresh').click()
    await employee
      .getByTestId(`messaging-published-${publication.activeVersionId}`)
      .click()
    await expect(
      employee.getByTestId('messaging-announcement-read')
    ).toContainText(`原始已发布公告正文-${suffix}`)
    await expect(
      employee.getByTestId('messaging-announcement-read')
    ).not.toContainText('尚未另行发布')
    const replacement = await uiCommand<MessageAnnouncementRecord>(
      admin,
      'messaging-announcement-publish',
      `/messaging/announcements/${announcement.id}/publish`
    )
    expect(replacement.activeVersionId).not.toBe(publication.activeVersionId)
    await employee.getByTestId('messaging-published-refresh').click()
    await employee
      .getByTestId(`messaging-published-${replacement.activeVersionId}`)
      .click()
    await expect(
      employee.getByTestId('messaging-announcement-read')
    ).toContainText(`尚未另行发布的新正文-${suffix}`)
    const readVersion = await employeeApi.get<MessagePublishedAnnouncement>(
      `/messaging/announcements/published/${replacement.activeVersionId}/read`
    )
    expect(readVersion.version).toBe(2)
    expect(
      (
        await employeeApi.raw(
          `/messaging/announcements/published/${publication.activeVersionId}/read`
        )
      ).status()
    ).toBe(404)
    await uiCommand<MessageAnnouncementRecord>(
      admin,
      'messaging-announcement-revoke',
      `/messaging/announcements/${announcement.id}/revoke`
    )
    await employee.getByTestId('messaging-published-refresh').click()
    await expect(
      employee.getByTestId(`messaging-published-${replacement.activeVersionId}`)
    ).toHaveCount(0)
    await expect(
      employee.getByTestId('messaging-announcement-read')
    ).toHaveCount(0)
    expect(
      (
        await employeeApi.raw(
          `/messaging/announcements/published/${replacement.activeVersionId}/read`
        )
      ).status()
    ).toBe(404)
    serverFacts.announcement = {
      original: publication,
      replacement,
      readVersion,
      revokedVersionId: replacement.activeVersionId,
    }
    await employee.screenshot({
      path: testInfo.outputPath('reader-revoked-1280.png'),
      fullPage: true,
    })

    await admin.goto('/message/templates')
    await admin.getByTestId('messaging-template-keyword').fill(name)
    await admin.getByRole('button', { name: '查询', exact: true }).click()
    await admin.getByTestId(`messaging-template-${draft.id}`).click()
    const archived = await uiCommand<MessageTemplateRecord>(
      admin,
      'messaging-template-archive',
      `/messaging/templates/${draft.id}`,
      'DELETE'
    )
    expect(archived.archivedAt).toBeTruthy()
    expect(archived.enabled).toBe(false)
    const restored = await uiCommand<MessageTemplateRecord>(
      admin,
      'messaging-template-archive',
      `/messaging/templates/${draft.id}/restore`
    )
    expect(restored).toMatchObject({
      archivedAt: null,
      enabled: false,
      draftState: 'draft',
    })
    expect(restored.versions?.[0].contentHash).toBe(
      approved.versions?.[0].contentHash
    )
    expect(
      (
        await adminApi.get<MessageSendJobRecord>(
          `/messaging/send-jobs/${queued.id}`
        )
      ).recipients?.[0].notificationId
    ).toBe(recipient?.notificationId)
    const leaveAfter = await adminApi.get<{
      activeReleaseId: string | null
      revision: number
    }>('/applications/leave')
    expect({
      activeReleaseId: leaveAfter.activeReleaseId,
      revision: leaveAfter.revision,
    }).toEqual(serverFacts.originalLeave)
    await testInfo.attach('messaging-server-facts', {
      body: Buffer.from(JSON.stringify(serverFacts, null, 2)),
      contentType: 'application/json',
    })
  } finally {
    if (adminApi) {
      await Promise.all(
        jobIds.map(async (id) => {
          const job = await adminApi?.get<MessageSendJobRecord>(
            `/messaging/send-jobs/${id}`
          )
          if (job && !['sent', 'cancelled'].includes(job.status))
            await adminApi?.command(
              `/messaging/send-jobs/${id}/cancel`,
              'POST',
              { expectedRevision: job.revision }
            )
        })
      )
      if (announcementId) {
        const current = await adminApi.get<MessageAnnouncementRecord>(
          `/messaging/announcements/${announcementId}`
        )
        if (current.status === 'published')
          await adminApi.command(
            `/messaging/announcements/${announcementId}/revoke`,
            'POST',
            { expectedRevision: current.revision }
          )
      }
      if (templateId) {
        const current = await adminApi.get<MessageTemplateRecord>(
          `/messaging/templates/${templateId}`
        )
        if (!current.archivedAt)
          await adminApi.command(
            `/messaging/templates/${templateId}`,
            'DELETE',
            { expectedRevision: current.revision }
          )
      }
    }
    if (employeeApi && originalSubscription) {
      const current = (
        await employeeApi.get<MessageSubscriptionRecord[]>(
          '/messaging/subscriptions'
        )
      ).find((item) => item.channel === originalSubscription?.channel)
      expect(current).toBeDefined()
      if (
        current &&
        (current.subscribed !== originalSubscription.subscribed ||
          JSON.stringify(current.deliveryModes) !==
            JSON.stringify(originalSubscription.deliveryModes))
      )
        await employeeApi.command(
          `/messaging/subscriptions/${current.channel}`,
          'PUT',
          {
            expectedRevision: current.revision,
            subscribed: originalSubscription.subscribed,
            deliveryModes: originalSubscription.deliveryModes,
          }
        )
    }
    await Promise.all(contexts.map((context) => context.close()))
  }
})
