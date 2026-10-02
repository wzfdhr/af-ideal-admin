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
test('controlled form sources save, reopen and publish immutable choices, then a real employee submits the chosen value', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const suffix = randomUUID().slice(0, 8)
  const name = `绑定领用-${suffix}`
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
    const dictionary = await call('/system/dictionaries', {
      dictName: name,
      dictType: `bind-${suffix}`,
      dictStatus: 'enabled',
      description: '',
    })
    await call(
      `/system/dictionaries/${dictionary.id}/items`,
      {
        expectedRevision: 1,
        items: [
          { label: '真实笔记本', value: 'laptop', disabled: false },
          { label: '已停用', value: 'inactive', disabled: true },
        ],
      },
      'PUT'
    )
    const source = await call('/form-data-sources', {
      code: `bind-${suffix}`,
      name,
      kind: 'dictionary',
      dictionaryId: dictionary.id,
      status: 'enabled',
      description: '',
    })
    const app = await call('/application-center', {
      code: `app-${suffix}`,
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
    schema.dataSources = [
      { key: source.code, name, kind: 'registered', registryId: source.id },
    ]
    schema.widgetsConfig.push({
      uid: 'deviceType',
      type: 'select',
      name: '设备类别',
      config: {
        id: 'deviceType',
        label: '设备类别',
        required: true,
        optionsType: 'registered',
        optionsSourceKey: source.code,
        options: [],
      },
    })
    await page.goto(`/applications/${app.id}/configuration`)
    await page
      .getByRole('button', { name: '导入 schema JSON', exact: true })
      .first()
      .click()
    const importer = page.getByTestId('form-schema-import')
    await importer
      .getByPlaceholder('粘贴导出的 schema JSON')
      .fill(JSON.stringify(schema))
    await importer.getByRole('button', { name: '确定', exact: true }).click()
    await expect(importer).not.toBeVisible()
    await page.getByTestId('application-save-form').click()
    await expect(page.getByText('表单已保存', { exact: true })).toBeVisible()
    await page.reload()
    await expect(
      page.getByText('设备类别', { exact: true }).first()
    ).toBeVisible()
    const saved = await call(
      `/form-schemas/${app.formDraftId}`,
      undefined,
      'GET'
    )
    expect(saved.schema.dataSources[0].registryId).toBe(source.id)
    await page.getByTestId('application-publish').click()
    await confirm(page)
    await expect(
      page.getByText('发布成功，当前为 v1', { exact: true })
    ).toBeVisible()
    const employee = await browser.newContext()
    const e = await employee.newPage()
    try {
      await login(e, 'a-employee')
      await e.goto('/business/records')
      await e
        .getByLabel('业务应用', { exact: true })
        .selectOption({ label: name })
      await e.getByRole('button', { name: '新建业务申请', exact: true }).click()
      const record = e.getByTestId('business-record')
      const input = (label: string) =>
        record
          .locator('.arco-form-item')
          .filter({ hasText: label })
          .locator('input')
          .first()
      await input('设备名称').fill('真实设备')
      await input('领用数量').fill('1')
      await record
        .locator('.arco-form-item')
        .filter({ hasText: '领用用途' })
        .locator('textarea')
        .fill('验证登记引用')
      await record
        .locator('.arco-form-item')
        .filter({ hasText: '设备类别' })
        .locator('.arco-select-view')
        .click()
      await e
        .locator('.arco-select-option')
        .filter({ hasText: '真实笔记本' })
        .click()
      await e.getByTestId('business-save').click()
      await expect(e).toHaveURL(/\/business\/records\/[a-f0-9-]+$/)
      const url = e.url()
      await e.reload()
      await expect(e.getByTestId('business-record')).toBeVisible()
      await e.getByTestId('business-submit').click()
      await confirm(e)
      await expect(
        e.getByRole('heading', { name: '审批中', exact: true })
      ).toBeVisible()
      await e.screenshot({
        path: 'test-results/full-product/form-binding-submitted-runtime.png',
      })
      await e.goto(url)
      await expect(e.getByTestId('business-record')).toBeVisible()
    } finally {
      await employee.close()
    }
    await page.goto('/Scalability/formDesign')
    await page
      .getByLabel('真实表单草稿', { exact: true })
      .selectOption(app.formDraftId)
    await expect(page.getByText('加载成功', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByText('保存成功', { exact: true })).toBeVisible()
    await page
      .getByRole('button', { name: '进入应用发布', exact: true })
      .click()
    await expect(page).toHaveURL(`/applications/${app.id}/configuration`)
  } finally {
    await context.close()
  }
})
