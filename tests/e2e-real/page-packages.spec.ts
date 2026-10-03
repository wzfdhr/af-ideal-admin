import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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
    const response = await request.fetch(
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
    expect(response.status()).toBe(200)
    return (await response.json()).data
  }

test('downloaded v3 pages become independent target drafts only after real business publication and run the full employee approval path', async ({
  browser,
  request,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext())
  )
  const [source, target, employee, first, second] = await Promise.all(
    contexts.map((context) => context.newPage())
  )
  const suffix = randomUUID().slice(0, 8)
  const sourceCode = `pp-ui-source-${suffix}`
  const targetCode = `pp-ui-target-${suffix}`
  const sourceName = `页面模板-${suffix}`
  const targetName = `页面重绑应用-${suffix}`
  const pageName = `页面包管理-${suffix}`
  try {
    await login(source, 'a-admin')
    const sourceCall = caller(
      request,
      (await source.evaluate(() => localStorage.getItem('token'))) || ''
    )
    const app = await sourceCall(
      '/application-center',
      { name: sourceName, code: sourceCode, template: 'equipment' },
      'POST'
    )
    const form = await sourceCall(`/form-schemas/${app.formDraftId}`)
    const workflow = await sourceCall(`/workflows/${app.workflowDraftId}`)
    const release = await sourceCall(
      `/applications/${app.id}/releases`,
      {
        formDraftId: form.id,
        workflowDraftId: workflow.id,
        formRevision: form.revision,
        workflowRevision: workflow.revision,
        expectedRevision: app.revision,
      },
      'POST'
    )
    const page = await sourceCall(
      '/low-code/pages/from-application',
      { name: pageName, applicationReleaseId: release.id },
      'POST'
    )
    await sourceCall(
      `/low-code/pages/${page.id}/publish`,
      { expectedRevision: page.revision },
      'POST'
    )
    await source.goto('/applications/center')
    await source.getByLabel('查询应用').fill(sourceCode)
    await source.getByRole('button', { name: '查询', exact: true }).click()
    await source
      .locator('tbody tr')
      .filter({ hasText: sourceCode })
      .getByRole('button', { name: '导出定义包', exact: true })
      .click()
    const exportDialog = source.getByTestId('page-package-export')
    await expect(exportDialog).toBeVisible()
    await expect(
      exportDialog.getByLabel(`导出页面 ${pageName}`, { exact: true })
    ).toBeChecked()
    const downloading = source.waitForEvent('download')
    await exportDialog.getByTestId('page-package-download').click()
    const file = await downloading
    const bytes = await readFile((await file.path()) || '')
    const pkg = JSON.parse(bytes.toString())
    expect(pkg.version).toBe(3)
    expect(pkg.pages.length).toBe(1)
    ;[app.id, release.id, page.id, ...page.schema.sources].forEach((id) =>
      expect(bytes.toString()).not.toContain(id)
    )
    await login(target, 'b-admin')
    const targetCall = caller(
      request,
      (await target.evaluate(() => localStorage.getItem('token'))) || '',
      'tenant-b'
    )
    await target.goto('/applications/center')
    await target
      .getByRole('button', { name: '导入应用包', exact: true })
      .click()
    const editor = target.getByTestId('package-import-editor')
    await editor.getByLabel('选择应用定义包').setInputFiles({
      name: 'pages.af-application.json',
      mimeType: 'application/json',
      buffer: bytes,
    })
    await expect(editor).toContainText('等待目标业务发布')
    await editor.getByLabel('目标应用名称').fill(targetName)
    await editor.getByLabel('目标应用标识').fill(targetCode)
    await editor.getByLabel('绑定 person-1').selectOption({ label: 'B 主管 1' })
    await editor.getByLabel('绑定 person-2').selectOption({ label: 'B 主管 2' })
    await editor.getByLabel('绑定 person-3').selectOption({ label: 'B 审计员' })
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await target.getByLabel('查询应用').fill(targetCode)
    await target.getByRole('button', { name: '查询', exact: true }).click()
    await target
      .locator('tbody tr')
      .filter({ hasText: targetCode })
      .getByRole('button', { name: '配置', exact: true })
      .click()
    const binding = target.getByTestId('package-pages-binding')
    await expect(binding).toContainText('等待目标业务发布和来源重绑')
    await expect(binding.getByTestId('package-pages-bind')).toBeDisabled()
    await target.reload()
    await expect(binding).toContainText(pageName)
    await target.getByTestId('application-save-form').click()
    await target.getByText('配置流程', { exact: true }).click()
    await target.getByTestId('application-save-workflow').click()
    await target.getByTestId('application-publish').click()
    await confirm(target)
    await expect(
      target.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    await binding.getByTestId('package-pages-bind').click()
    await confirm(target)
    await expect(binding).toContainText('目标页面草稿已生成')
    const applicationId = new URL(target.url()).pathname.split('/')[2]
    const sets = await targetCall(
      `/application-center/${applicationId}/package-pages`
    )
    const targetPageId = sets[0].referenceMap['page-1']
    expect(targetPageId).not.toBe(page.id)
    await target.getByRole('link', { name: '打开目标页面配置并发布' }).click()
    await expect(target).toHaveURL(new RegExp(`pageId=${targetPageId}`))
    await target.reload()
    await expect(target.getByTestId('persistent-page-editor')).toBeVisible()
    await target.getByTestId('persistent-page-publish').click()
    await confirm(target)
    await expect(
      target.getByText('页面发布成功，v1', { exact: true })
    ).toBeVisible()
    await login(employee, 'b-employee')
    await employee.goto(`/low-code/pages/${targetPageId}/run`)
    await employee.getByTestId('persistent-action-new').click()
    const modal = employee.getByTestId('persistent-business-modal')
    const field = (label: string) =>
      modal
        .locator('.arco-form-item')
        .filter({ hasText: label })
        .locator('input,textarea')
        .first()
    await field('设备名称').fill('页面包目标键盘')
    await field('领用数量').fill('2')
    await field('领用用途').fill('真实页面包跨租户闭环')
    await modal.getByTestId('persistent-action-create').click()
    await confirm(employee)
    await modal.getByTestId('persistent-action-start').click()
    await confirm(employee)
    await expect(modal).not.toBeVisible()
    await employee.getByTestId('persistent-action-refresh').click()
    const recordRow = employee
      .locator('tbody tr')
      .filter({ hasText: '页面包目标键盘' })
    await expect(recordRow).toContainText('审批中')
    await recordRow
      .getByRole('button', { name: '查看详情', exact: true })
      .click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    const recordUrl = employee.url()
    await login(first, 'b-manager-1')
    await first.goto(recordUrl)
    await first.getByTestId('business-approve').click()
    await confirm(first)
    await login(second, 'b-manager-2')
    await second.goto(recordUrl)
    await second.getByTestId('business-approve').click()
    await confirm(second)
    await expect(
      second.getByRole('heading', { name: '已通过', exact: true })
    ).toBeVisible()
    await employee.goto(`/low-code/pages/${targetPageId}/run`)
    await employee.getByTestId('persistent-action-query').click()
    await expect(
      employee.locator('tbody tr').filter({ hasText: '页面包目标键盘' })
    ).toContainText('已通过')
    await employee.screenshot({
      path: 'test-results/full-product/page-package-20261003/imported-page-approved.png',
    })
    await source.goto(`/low-code/pages/${targetPageId}/run`)
    await expect(source.getByTestId('low-code-runtime-error')).toBeVisible()
    await expect(
      source.getByTestId('persistent-low-code-runtime')
    ).not.toContainText('页面包目标键盘')
    const original = await sourceCall(`/applications/${app.id}`)
    expect(original.activeReleaseId).toBe(release.id)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
