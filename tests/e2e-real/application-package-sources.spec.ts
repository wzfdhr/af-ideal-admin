import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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
test('a source-aware package downloads without origin data, rebinds target source and runs target tenant choices', async ({
  browser,
  request,
}) => {
  const a = await browser.newContext()
  const b = await browser.newContext()
  const staff = await browser.newContext()
  const source = await a.newPage()
  const target = await b.newPage()
  const employee = await staff.newPage()
  const suffix = randomUUID().slice(0, 8)
  const code = `export-${suffix}`
  const targetCode = `import-${suffix}`
  const targetName = `重绑设备-${suffix}`
  try {
    await login(source, 'a-admin')
    const token = await source.evaluate(() => localStorage.getItem('token'))
    const headers = {
      'x-access-token': token || '',
      'x-tenant-id': 'tenant-a',
      'idempotency-key': randomUUID(),
    }
    const post = async (path: string, data: unknown) => {
      const response = await request.post(
        `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${path}`,
        { headers: { ...headers, 'idempotency-key': randomUUID() }, data }
      )
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const sourceDictionary = await post('/system/dictionaries', {
      dictName: '源内部数据',
      dictType: `src-${suffix}`,
      dictStatus: 'enabled',
      description: '',
    })
    const originItems = await request.put(
      `${
        process.env.R1_API_URL || 'http://127.0.0.1:10888'
      }/api/system/dictionaries/${sourceDictionary.id}/items`,
      {
        headers: { ...headers, 'idempotency-key': randomUUID() },
        data: {
          expectedRevision: 1,
          items: [
            { label: '源内部选项', value: 'source-private', disabled: false },
          ],
        },
      }
    )
    expect(originItems.status()).toBe(200)
    const originSource = await post('/form-data-sources', {
      code: `src-${suffix}`,
      name: '源内部数据',
      kind: 'dictionary',
      dictionaryId: sourceDictionary.id,
      status: 'enabled',
      description: '',
    })
    const app = await post('/application-center', {
      name: `导出设备-${suffix}`,
      code,
      template: 'equipment',
    })
    const definition = await request.get(
      `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api/form-schemas/${
        app.formDraftId
      }`,
      { headers }
    )
    expect(definition.status()).toBe(200)
    const { schema } = (await definition.json()).data
    schema.version = 2
    schema.dataSources = [
      {
        key: originSource.id,
        name: '设备类别',
        kind: 'registered',
        registryId: originSource.id,
      },
    ]
    schema.widgetsConfig.push({
      uid: 'category',
      name: '设备类别',
      type: 'select',
      config: {
        id: 'category',
        label: '设备类别',
        required: true,
        optionsType: 'registered',
        optionsSourceKey: originSource.id,
        options: [],
      },
    })
    const saved = await request.put(
      `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api/form-schemas/${
        app.formDraftId
      }`,
      {
        headers: { ...headers, 'idempotency-key': randomUUID() },
        data: { schema, expectedRevision: 1 },
      }
    )
    expect(saved.status()).toBe(200)
    await post(`/applications/${app.id}/releases`, {
      formDraftId: app.formDraftId,
      workflowDraftId: app.workflowDraftId,
      formRevision: 2,
      workflowRevision: 1,
      expectedRevision: 1,
    })
    await source.goto('/applications/center')
    await source.getByLabel('查询应用').fill(code)
    await source.getByRole('button', { name: '查询', exact: true }).click()
    const downloaded = source.waitForEvent('download')
    await source
      .locator('tbody tr')
      .filter({ hasText: code })
      .getByRole('button', { name: '导出定义包', exact: true })
      .click()
    const file = await downloaded
    const bytes = await readFile((await file.path()) || '')
    const pkg = JSON.parse(bytes.toString('utf8'))
    expect(pkg.version).toBe(2)
    ;[
      originSource.id,
      sourceDictionary.id,
      'source-private',
      '源内部选项',
      'optionsSnapshot',
    ].forEach((forbidden) => expect(bytes.toString()).not.toContain(forbidden))
    expect(bytes.toString()).not.toContain('a-manager-1')
    expect(bytes.toString()).not.toContain('tenant-a')
    await login(target, 'b-admin')
    const bToken = await target.evaluate(() => localStorage.getItem('token'))
    const bPost = async (path: string, data: unknown, method = 'POST') => {
      const response = await request.fetch(
        `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api${path}`,
        {
          method,
          data,
          headers: {
            'x-access-token': bToken || '',
            'x-tenant-id': 'tenant-b',
            'idempotency-key': randomUUID(),
          },
        }
      )
      expect(response.status()).toBe(200)
      return (await response.json()).data
    }
    const dictionary = await bPost('/system/dictionaries', {
      dictName: `目标源-${suffix}`,
      dictType: `target-${suffix}`,
      dictStatus: 'enabled',
      description: '',
    })
    await bPost(
      `/system/dictionaries/${dictionary.id}/items`,
      {
        expectedRevision: 1,
        items: [
          { label: '目标实际选项', value: 'target-device', disabled: false },
        ],
      },
      'PUT'
    )
    const ownSource = await bPost('/form-data-sources', {
      code: `target-${suffix}`,
      name: `目标源-${suffix}`,
      kind: 'dictionary',
      dictionaryId: dictionary.id,
      status: 'enabled',
      description: '',
    })
    await target.goto('/applications/center')
    await target
      .getByRole('button', { name: '导入应用包', exact: true })
      .click()
    const editor = target.getByTestId('package-import-editor')
    await editor.getByLabel('选择应用定义包').setInputFiles({
      name: 'device.af-application.json',
      mimeType: 'application/json',
      buffer: bytes,
    })
    await expect(editor).toContainText('待绑定槽位')
    await editor.getByLabel('目标应用名称').fill(targetName)
    await editor.getByLabel('目标应用标识').fill(targetCode)
    await editor.getByLabel('绑定 person-1').selectOption({ label: 'B 主管 1' })
    await editor.getByLabel('绑定 person-2').selectOption({ label: 'B 主管 2' })
    await editor.getByLabel('绑定 person-3').selectOption({ label: 'B 审计员' })
    await editor.getByLabel('绑定数据源 source-1').selectOption(ownSource.id)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await target.getByLabel('查询应用').fill(targetCode)
    await target.getByRole('button', { name: '查询', exact: true }).click()
    const row = target.locator('tbody tr').filter({ hasText: targetCode })
    await expect(row).toContainText('未发布')
    await target.reload()
    await target.getByLabel('查询应用').fill(targetCode)
    await target.getByRole('button', { name: '查询', exact: true }).click()
    await row.getByRole('button', { name: '配置', exact: true }).click()
    await expect(
      target.getByRole('heading', { name: targetName, exact: true })
    ).toBeVisible()
    await target.getByTestId('application-save-form').click()
    await target.getByText('配置流程', { exact: true }).click()
    await target.getByTestId('application-save-workflow').click()
    await target.getByTestId('application-publish').click()
    await confirm(target)
    await expect(
      target.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    await login(employee, 'b-employee')
    await employee.goto('/business/records')
    await employee
      .getByLabel('业务应用', { exact: true })
      .selectOption({ label: targetName })
    await employee
      .getByRole('button', { name: '新建业务申请', exact: true })
      .click()
    const field = (label: string) =>
      employee
        .getByTestId('business-record')
        .locator('.arco-form-item')
        .filter({ hasText: label })
        .locator('input,textarea')
    await field('设备名称').fill('独立租户键盘')
    await field('领用数量').fill('2')
    await field('领用用途').fill('跨租户应用定义包真实运行')
    await employee
      .getByTestId('business-record')
      .locator('.arco-form-item')
      .filter({ hasText: '设备类别' })
      .locator('.arco-select-view')
      .click()
    await employee
      .locator('.arco-select-option')
      .filter({ hasText: '目标实际选项' })
      .click()
    await employee.getByTestId('business-save').click()
    await expect(employee).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
    await employee.getByTestId('business-submit').click()
    await confirm(employee)
    await expect(
      employee.getByRole('heading', { name: '审批中', exact: true })
    ).toBeVisible()
    await employee.screenshot({
      path: 'test-results/full-product/application-package-sources-runtime.png',
    })
  } finally {
    await a.close()
    await b.close()
    await staff.close()
  }
})
