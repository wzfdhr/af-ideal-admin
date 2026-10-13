import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { APIRequestContext, Page } from '@playwright/test'
import type {
  BusinessRecord,
  ManagedRole,
  ReportSchedule,
  ReportScheduleRun,
  ReportingDefinitionRecord,
  ReportingExportJob,
  ReportingSourceCataloguePage,
  ReportingQueryResultV1,
  ReportingQueryV1,
  WorkflowSchema,
} from '@af-admin/contracts'
import type { ReportSchedulePreview } from '../../src/api/reporting-schedules'
import type { MessageNotificationPageResult } from '../../src/api/message'

const apiUrl = process.env.R1_API_URL || 'http://127.0.0.1:10888'
const login = async (page: Page, username: string, password = username) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}
const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem('token') || '')
const caller = (
  request: APIRequestContext,
  token: string,
  tenant = 'tenant-a'
) => {
  const raw = (path: string, method?: string, data?: unknown) =>
    request.fetch(`${apiUrl}/api${path}`, {
      method: method || 'GET',
      headers: {
        'x-access-token': token,
        'x-tenant-id': tenant,
        'idempotency-key': randomUUID(),
      },
      ...(data === undefined ? {} : { data }),
    })
  const call = async <T>(
    path: string,
    method?: string,
    data?: unknown
  ): Promise<T> => {
    const response = await raw(path, method, data)
    expect(response.status(), `${method || 'GET'} ${path}`).toBe(200)
    return (await response.json()).data as T
  }
  return { raw, call }
}
const responseAt = (page: Page, path: string, method = 'POST') =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${path}` &&
      response.request().method() === method
  )
interface ApplicationFixture {
  id: string
  revision: number
  formDraftId: string
  workflowDraftId: string
  status: string
}
const timeInZone = (instant: Date, zone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
const dateInZone = (instant: Date, zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)

test('real scheduled daily report reopens a fixed rule, executes the next server minute, delivers a scanned authorized file and denies revoked fields and foreign tenants', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(300000)
  const contexts = await Promise.all(
    Array.from({ length: 3 }, () =>
      browser.newContext({
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true,
      })
    )
  )
  const [admin, recipientPage, foreign] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const suffix = randomUUID().slice(0, 8)
  const reportName = `计划授权日报-${suffix}`
  const ruleName = `下一分钟日报-${suffix}`
  const username = `schedule-recipient-${suffix}`
  const password = 'Schedule-recipient-browser-2026'
  let adminApi: ReturnType<typeof caller> | undefined
  let recipientApi: ReturnType<typeof caller> | undefined
  let scheduleId = ''
  let reportId = ''
  let appId = ''
  let memberId = ''
  let roleId = ''
  let recordId = ''
  try {
    await login(admin, 'a-admin')
    await login(foreign, 'b-admin')
    adminApi = caller(request, await tokenOf(admin))
    const foreignApi = caller(request, await tokenOf(foreign), 'tenant-b')
    const app = await adminApi.call<ApplicationFixture>(
      '/application-center',
      'POST',
      {
        name: `FP027日报来源-${suffix}`,
        code: `schedule-${suffix}`,
        template: 'equipment',
      }
    )
    appId = app.id
    const form = await adminApi.call<{ id: string; revision: number }>(
      `/form-schemas/${app.formDraftId}`
    )
    const workflow = await adminApi.call<{
      id: string
      revision: number
      schema: WorkflowSchema
    }>(`/workflows/${app.workflowDraftId}`)
    const workflowSchema = structuredClone(workflow.schema)
    const approval = workflowSchema.nodes.find(
      (node) => node.type === 'approval'
    )
    if (!approval) throw new Error('实际设备应用流程缺少审批节点')
    approval.config.approvers = ['a-admin']
    const assignedWorkflow = await adminApi.call<{
      id: string
      revision: number
    }>(`/workflows/${workflow.id}`, 'PUT', {
      schema: workflowSchema,
      expectedRevision: workflow.revision,
    })
    const release = await adminApi.call<{ id: string; releaseVersion: number }>(
      `/applications/${app.id}/releases`,
      'POST',
      {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: assignedWorkflow.revision,
        expectedRevision: app.revision,
      }
    )
    const source = (
      await adminApi.call<ReportingSourceCataloguePage>(
        `/reporting/sources?current=1&pageSize=1&applicationId=${encodeURIComponent(
          app.id
        )}`
      )
    ).list[0]
    const itemField = source.visibleFields.find(
      (field) => field.label === '设备名称'
    )
    expect(itemField).toBeDefined()
    if (!itemField) throw new Error('实际来源缺少设备名称字段')
    const report = await adminApi.call<ReportingDefinitionRecord>(
      '/reporting/definitions',
      'POST',
      {
        schema: {
          version: 1,
          name: reportName,
          source: { kind: 'application-records', applicationId: app.id },
          kind: 'detail',
          metric: 'count',
          factTime: 'createdAt',
          timeZone: 'Asia/Shanghai',
          fields: [
            { kind: 'metadata', id: 'id' },
            { kind: 'metadata', id: 'createdAt' },
            itemField.reference,
          ],
        },
      }
    )
    reportId = report.id
    const published = await adminApi.call<ReportingDefinitionRecord>(
      `/reporting/definitions/${reportId}/publish`,
      'POST',
      { expectedRevision: report.revision }
    )
    const reportVersionId = published.activeVersionId
    if (!reportVersionId) throw new Error('真实报表未返回固定发布版本')
    const permissions = [
      'report:query',
      'report:field:business',
      'report:export:list',
      'report:export:download',
      'message:list',
      'business:create',
      'business:read:self',
      'business:submit',
      'business:withdraw:self',
    ]
    const role = await adminApi.call<ManagedRole>('/system/roles', 'POST', {
      roleName: `日报收件角色-${suffix}`,
      roleKey: `schedule-recipient-${suffix}`,
      roleSort: 0,
      remark: '',
      status: 'enabled',
      permissions,
    })
    roleId = role.id
    const member = await adminApi.call<{ id: string; revision: number }>(
      '/system/users',
      'POST',
      {
        username,
        name: `日报收件人-${suffix}`,
        initialPassword: password,
        phone: '',
        email: '',
        status: 'enabled',
      }
    )
    memberId = member.id
    await adminApi.call(`/system/users/${memberId}/authorization`, 'POST', {
      roleIds: [role.id],
      directPermissions: [],
      expectedRevision: member.revision,
    })
    await login(recipientPage, username, password)
    recipientApi = caller(request, await tokenOf(recipientPage))
    const visibleName = `收件人本人设备-${suffix}`
    const createdRecord = await recipientApi.call<{
      id: string
      revision: number
    }>('/business/records', 'POST', {
      applicationReleaseId: release.id,
      fields: {
        itemName: visibleName,
        quantity: 1,
        unitPrice: '12.34',
        reason: '真实当前周期日报交集',
      },
    })
    // The create command returns identity/revision only. Read the saved record
    // through this recipient's actual authorization for its creation timestamp.
    recordId = createdRecord.id
    const savedRecord = await recipientApi.call<BusinessRecord>(
      `/business/records/${encodeURIComponent(createdRecord.id)}`
    )
    await recipientApi.call(
      `/business/records/${encodeURIComponent(createdRecord.id)}/submit`,
      'POST',
      { expectedRevision: savedRecord.revision }
    )
    const record = await recipientApi.call<BusinessRecord>(
      `/business/records/${encodeURIComponent(createdRecord.id)}`
    )
    expect(record.id).toBe(createdRecord.id)
    expect(record.applicationReleaseId).toBe(release.id)
    expect(record.applicantId).toBe(memberId)
    expect(record.status).toBe('running')
    expect(record.createdAt).toBe(savedRecord.createdAt)
    expect(Number.isNaN(new Date(record.createdAt).getTime())).toBe(false)
    await adminApi.call('/business/records', 'POST', {
      applicationReleaseId: release.id,
      fields: {
        itemName: `发起者独有设备-${suffix}`,
        quantity: 1,
        unitPrice: '12.34',
        reason: '不能借管理员权将此记录发送给收件人',
      },
    })
    const reviewerRecord = await adminApi.call<
      BusinessRecord & { tasks: { id: string; status: string }[] }
    >(`/business/records/${encodeURIComponent(record.id)}`)
    expect(reviewerRecord.tasks).toHaveLength(1)
    expect(reviewerRecord.tasks[0].status).toBe('pending')
    const recordDay = dateInZone(new Date(record.createdAt), 'Asia/Shanghai')
    const intersectionQuery: ReportingQueryV1 = {
      version: 1,
      timeZone: 'Asia/Shanghai',
      dateRange: { from: recordDay, to: recordDay },
      statuses: [],
      keyword: '',
      searchFields: [],
      sort: { field: { kind: 'metadata', id: 'createdAt' }, direction: 'desc' },
      current: 1,
      pageSize: 100,
    }
    const [creatorProjection, recipientProjection] = await Promise.all([
      adminApi.call<ReportingQueryResultV1>(
        `/reporting/versions/${reportVersionId}/query`,
        'POST',
        { query: intersectionQuery }
      ),
      recipientApi.call<ReportingQueryResultV1>(
        `/reporting/versions/${reportVersionId}/query`,
        'POST',
        { query: intersectionQuery }
      ),
    ])
    expect(creatorProjection.rows.some((row) => row.id === record.id)).toBe(
      true
    )
    expect(recipientProjection.rows.some((row) => row.id === record.id)).toBe(
      true
    )
    expect(recipientProjection.rows).toHaveLength(1)
    expect(creatorProjection.sourceReleaseId).toBe(release.id)
    expect(recipientProjection.sourceReleaseId).toBe(release.id)

    await admin.goto('/visualization/reportSchedules')
    await expect(admin.getByTestId('real-report-schedules')).toBeVisible()
    await admin.getByTestId('report-schedule-new').click()
    await admin.getByTestId('report-schedule-name').fill(ruleName)
    await admin.getByTestId('report-schedule-name').focus()
    await admin.keyboard.press('Tab')
    await expect(
      admin.getByTestId('report-schedule-report-keyword')
    ).toBeFocused()
    await admin.getByTestId('report-schedule-report-keyword').fill(reportName)
    await admin.getByTestId('report-schedule-report-keyword').press('Enter')
    await expect(admin.getByTestId('report-schedule-report')).toBeEnabled()
    await admin
      .getByTestId('report-schedule-report')
      .selectOption(reportVersionId)
    await expect(admin.getByTestId('report-schedule-time-zone')).toHaveValue(
      'Asia/Shanghai'
    )
    await admin.getByTestId('report-schedule-frequency').selectOption('daily')
    await admin
      .getByTestId('report-schedule-window')
      .selectOption('current-period')
    await admin
      .getByTestId('report-schedule-recipient-kind')
      .selectOption('role')
    await admin.getByTestId('report-schedule-role').selectOption(roleId)
    await admin.getByTestId('report-schedule-format').selectOption('csv')
    // Schedule against the real server's HTTP Date, leaving time to save the
    // next natural minute. Nothing submits now/nextRunAt or forces a worker tick.
    let clockResponse = await adminApi.raw('/user/info')
    let serverNow = new Date(clockResponse.headers().date)
    expect(Number.isNaN(serverNow.getTime())).toBe(false)
    if (serverNow.getUTCSeconds() > 30) {
      await admin.waitForTimeout((60 - serverNow.getUTCSeconds()) * 1000 + 100)
      clockResponse = await adminApi.raw('/user/info')
      serverNow = new Date(clockResponse.headers().date)
    }
    const nextMinute = new Date(
      Math.floor(serverNow.getTime() / 60000) * 60000 + 60000
    )
    const time = timeInZone(nextMinute, 'Asia/Shanghai')
    await admin.getByTestId('report-schedule-time').fill(time)
    const previewResponse = responseAt(admin, '/reporting/schedules/preview')
    await admin.getByTestId('report-schedule-preview').click()
    const preview = (await (await previewResponse).json())
      .data as ReportSchedulePreview
    expect(preview.nextRunAt).toBe(nextMinute.toISOString())
    expect(preview.recipientTotal).toBe(1)
    expect(preview.recipients.map((recipient) => recipient.userId)).toContain(
      memberId
    )
    expect(preview.dateRange.to).toBe(dateInZone(nextMinute, 'Asia/Shanghai'))
    await expect(
      admin.getByTestId('report-schedule-preview-result')
    ).toContainText('符合资格 1 人')
    await admin.getByTestId('report-schedule-enable-create').check()
    const createResponse = responseAt(admin, '/reporting/schedules')
    await admin.getByTestId('report-schedule-save').focus()
    await admin.keyboard.press('Enter')
    const created = await createResponse
    expect(created.status()).toBe(200)
    let schedule = (await created.json()).data as ReportSchedule
    scheduleId = schedule.id
    expect(schedule.enabled).toBe(true)
    expect(schedule.nextRunAt).toBe(preview.nextRunAt)
    await admin.reload()
    await admin.getByTestId('report-schedule-keyword').fill(ruleName)
    await admin.getByTestId('report-schedule-search').click()
    await admin.getByTestId(`report-schedule-edit-${scheduleId}`).click()
    await expect(admin.getByTestId('report-schedule-name')).toHaveValue(
      ruleName
    )
    await expect(admin.getByTestId('report-schedule-time')).toHaveValue(time)
    await expect(admin.getByTestId('report-schedule-role')).toHaveValue(roleId)
    await expect(admin.getByTestId('report-schedule-versions')).toContainText(
      schedule.activeVersionId
    )
    const saveBeforeVersion = schedule.version
    // Editing persists a real new immutable rule. It is not a manual run command.
    await admin.getByTestId('report-schedule-name').fill(`${ruleName}-重开`)
    const updateResponse = responseAt(
      admin,
      `/reporting/schedules/${scheduleId}`,
      'PUT'
    )
    await admin.getByTestId('report-schedule-save').click()
    schedule = (await (await updateResponse).json()).data as ReportSchedule
    expect(schedule.version).toBe(saveBeforeVersion + 1)
    await admin.getByTestId('report-schedule-run-filter').fill(scheduleId)
    await admin.getByTestId('report-schedule-run-search').click()
    let run: ReportScheduleRun | undefined
    const scheduleApi = adminApi
    await expect
      .poll(
        async () => {
          const page = await scheduleApi.call<{ list: ReportScheduleRun[] }>(
            `/reporting/schedules/runs?current=1&pageSize=20&scheduleId=${encodeURIComponent(
              scheduleId
            )}`
          )
          run = page.list.find((entry) => entry.slotAt === preview.nextRunAt)
          return run?.status
        },
        { timeout: 120000, intervals: [500, 1000, 2000] }
      )
      .toBe('completed')
    if (!run) throw new Error('实际下一分钟未返回持久运行')
    expect(run.periodId).toBeTruthy()
    expect(run.ruleVersionId).toBeTruthy()
    expect(run.recipientTotal).toBe(1)
    expect(run.completedRecipients).toBe(1)
    const detail = await adminApi.call<ReportScheduleRun>(
      `/reporting/schedules/runs/${run.id}`
    )
    const recipient = detail.recipients?.find(
      (entry) => entry.userId === memberId
    )
    expect(recipient?.status).toBe('completed')
    expect(recipient?.notifiedAt).toBeTruthy()
    if (!recipient?.exportJobId) throw new Error('完成运行未绑定真实收件导出')
    const exportJob = await recipientApi.call<ReportingExportJob>(
      `/reporting/exports/${recipient.exportJobId}`
    )
    expect(exportJob.status).toBe('completed')
    expect(exportJob.artifact?.status).toBe('ready')
    expect(exportJob.artifact?.scanEngine).toMatch(/ClamAV/i)
    // Actual intersection depends on the planned local date. A midnight slot
    // must not invent a record from the previous day.
    const expectedRows =
      dateInZone(new Date(record.createdAt), 'Asia/Shanghai') ===
      preview.dateRange.to
        ? 1
        : 0
    expect(exportJob.totalRows).toBe(expectedRows)
    const expectedFileLink = `/visualization/reportCenter?exportJobId=${encodeURIComponent(
      exportJob.id
    )}`
    const inbox = await recipientApi.call<MessageNotificationPageResult>(
      '/messages/notifications?current=1&pageSize=100&category=notice'
    )
    const notices = inbox.list.filter(
      (notification) => notification.link === expectedFileLink
    )
    expect(notices).toHaveLength(1)
    const fileNotice = notices[0]
    expect(fileNotice.category).toBe('notice')
    expect(fileNotice.status).toBe('unread')
    await recipientPage.goto('/message/center')
    await expect(recipientPage.getByTestId('message-center')).toBeVisible()
    await recipientPage.getByTestId('message-keyword').fill(fileNotice.title)
    const notificationResponse = responseAt(
      recipientPage,
      '/messages/notifications',
      'GET'
    )
    await recipientPage.getByTestId('message-query').click()
    const notificationResult = await notificationResponse
    expect(notificationResult.status()).toBe(200)
    const renderedInbox = (await notificationResult.json())
      .data as MessageNotificationPageResult
    expect(
      renderedInbox.list.some(
        (notification) =>
          notification.id === fileNotice.id &&
          notification.link === expectedFileLink
      )
    ).toBe(true)
    const notificationReadControl = recipientPage.getByTestId(
      `message-read-${fileNotice.id}`
    )
    const notificationRow = recipientPage
      .getByRole('row')
      .filter({ has: notificationReadControl })
    await expect(notificationRow).toContainText(fileNotice.title)
    await expect(notificationRow).toContainText(fileNotice.content)
    await recipientPage.screenshot({
      path: testInfo.outputPath('scheduled-file-notification-1280.png'),
      fullPage: true,
    })
    const notificationLink = notificationRow.getByRole('link', {
      name: '查看',
      exact: true,
    })
    await expect(notificationLink).toHaveAttribute(
      'href',
      fileNotice.link || ''
    )
    await notificationLink.focus()
    await recipientPage.keyboard.press('Enter')
    await expect(recipientPage).toHaveURL(
      (url) =>
        url.pathname === '/visualization/reportCenter' &&
        url.searchParams.get('exportJobId') === exportJob.id
    )
    await expect(
      recipientPage.getByTestId('reporting-panel-exports')
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      recipientPage.getByTestId('reporting-export-detail')
    ).toContainText(exportJob.id)
    const downloadPromise = recipientPage.waitForEvent('download')
    await recipientPage
      .getByTestId(`reporting-export-download-${exportJob.id}`)
      .focus()
    await recipientPage.keyboard.press('Enter')
    const download = await downloadPromise
    const downloadPath = testInfo.outputPath('actual-scheduled-report.csv')
    await download.saveAs(downloadPath)
    const bytes = await readFile(downloadPath)
    expect(bytes.length).toBe(exportJob.artifact?.size)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      exportJob.artifact?.sha256
    )
    if (expectedRows) expect(bytes.toString('utf8')).toContain(visibleName)
    expect(bytes.toString('utf8')).not.toContain(`发起者独有设备-${suffix}`)
    await testInfo.attach('actual-scheduled-csv', {
      path: downloadPath,
      contentType: 'text/csv',
    })
    await admin.getByTestId('report-schedule-run-refresh').click()
    await admin.getByTestId(`report-schedule-run-inspect-${run.id}`).click()
    await expect(admin.getByTestId('report-schedule-run-detail')).toContainText(
      '文件与通知完成'
    )
    // This verifies the protected alert destination using a real saved run;
    // backend durability tests separately prove failure notification delivery.
    await admin.goto(
      `/visualization/reportSchedules?runId=${encodeURIComponent(run.id)}`
    )
    await expect(admin.getByTestId('report-schedule-run-detail')).toContainText(
      run.id
    )
    await admin.screenshot({
      path: testInfo.outputPath('report-schedule-runs-1280.png'),
      fullPage: true,
    })
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    expect(
      (await foreignApi.raw(`/reporting/schedules/${scheduleId}`)).status()
    ).toBe(404)
    expect(
      (await foreignApi.raw(`/reporting/schedules/runs/${run.id}`)).status()
    ).toBe(404)
    expect(
      (
        await foreignApi.raw(`/reporting/exports/${exportJob.id}/content`)
      ).status()
    ).toBe(404)
    await admin.getByTestId(`report-schedule-edit-${scheduleId}`).click()
    await expect(admin.getByTestId('report-schedule-toggle')).toBeEnabled()
    const disableResponse = responseAt(
      admin,
      `/reporting/schedules/${scheduleId}/enabled`
    )
    await admin.getByTestId('report-schedule-toggle').click()
    schedule = (await (await disableResponse).json()).data as ReportSchedule
    expect(schedule.enabled).toBe(false)
    expect(
      (
        await adminApi.call<ReportScheduleRun>(
          `/reporting/schedules/runs/${run.id}`
        )
      ).status
    ).toBe('completed')
    await adminApi.call(`/system/roles/${roleId}`, 'PUT', {
      roleName: role.roleName,
      roleKey: role.roleKey,
      roleSort: role.roleSort,
      remark: role.remark || '',
      status: role.status,
      permissions: permissions.filter(
        (permission) => permission !== 'report:field:business'
      ),
      expectedRevision: role.revision,
    })
    expect(
      (
        await recipientApi.raw(`/reporting/exports/${exportJob.id}/content`)
      ).status()
    ).toBe(404)
    await recipientPage.reload()
    await expect(
      recipientPage.getByTestId(`reporting-export-download-${exportJob.id}`)
    ).toHaveCount(0)
    await expect(
      recipientPage.getByTestId('real-report-center')
    ).not.toContainText(exportJob.artifact?.sha256 || 'no-sha')
    await expect(
      recipientPage.getByTestId('reporting-export-detail')
    ).toHaveCount(0)
    const serverFactsPath = testInfo.outputPath('scheduled-server-facts.json')
    await writeFile(
      serverFactsPath,
      JSON.stringify(
        {
          preview,
          schedule,
          run: detail,
          exportJob,
          expectedRows,
          fileNotice,
          record: { id: record.id, createdAt: record.createdAt },
          actualReviewerSourceIntersection: {
            reviewerTaskId: reviewerRecord.tasks[0].id,
            creatorProjection,
            recipientProjection,
          },
        },
        null,
        2
      )
    )
    await testInfo.attach('scheduled-server-facts', {
      path: serverFactsPath,
      contentType: 'application/json',
    })
  } finally {
    try {
      if (recipientApi && recordId) {
        const currentRecord = await recipientApi.call<BusinessRecord>(
          `/business/records/${encodeURIComponent(recordId)}`
        )
        if (currentRecord.status === 'running')
          await recipientApi.call(
            `/business/records/${encodeURIComponent(recordId)}/withdraw`,
            'POST',
            {
              expectedRevision: currentRecord.revision,
              comment: 'FP027真实浏览器验收结束，撤回合成业务流程',
            }
          )
      }
      if (adminApi && scheduleId) {
        const schedule = await adminApi.call<ReportSchedule>(
          `/reporting/schedules/${scheduleId}`
        )
        if (schedule.enabled)
          await adminApi.call(
            `/reporting/schedules/${scheduleId}/enabled`,
            'POST',
            { enabled: false, expectedRevision: schedule.revision }
          )
      }
      if (adminApi && reportId) {
        const report = await adminApi.call<ReportingDefinitionRecord>(
          `/reporting/definitions/${reportId}`
        )
        if (report.enabled)
          await adminApi.call(
            `/reporting/definitions/${reportId}/enabled`,
            'POST',
            { enabled: false, expectedRevision: report.revision }
          )
      }
      if (adminApi && memberId) {
        const authorization = await adminApi.call<{ revision: number }>(
          `/system/users/${memberId}/authorization`
        )
        await adminApi.call(`/system/users/${memberId}/authorization`, 'POST', {
          roleIds: [],
          directPermissions: [],
          expectedRevision: authorization.revision,
        })
        const member = await adminApi.call<{ revision: number }>(
          `/system/users/${memberId}`
        )
        await adminApi.call(`/system/users/${memberId}`, 'DELETE', {
          expectedRevision: member.revision,
        })
      }
      if (adminApi && roleId) {
        const role = await adminApi.call<{ revision: number }>(
          `/system/roles/${roleId}`
        )
        await adminApi.call(`/system/roles/${roleId}`, 'DELETE', {
          expectedRevision: role.revision,
        })
      }
      if (adminApi && appId) {
        const app = await adminApi.call<ApplicationFixture>(
          `/application-center/${appId}`
        )
        if (app.status === 'enabled')
          await adminApi.call(`/application-center/${appId}/state`, 'PUT', {
            status: 'archived',
            expectedRevision: app.revision,
          })
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
    }
  }
})
