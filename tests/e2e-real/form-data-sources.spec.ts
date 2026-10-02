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
test('form designer registers, reopens and queries a real authorized source with version conflicts and tenant isolation', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const suffix = randomUUID().slice(0, 8)
  const code = `source-${suffix}`
  const name = `真实来源-${suffix}`
  const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
  try {
    await login(page, 'a-admin')
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const headers = {
      'x-access-token': token || '',
      'x-tenant-id': 'tenant-a',
      'idempotency-key': randomUUID(),
    }
    const dictionary = await request.post(`${api}/api/system/dictionaries`, {
      headers,
      data: {
        dictName: `源字典-${suffix}`,
        dictType: `src-${suffix}`,
        dictStatus: 'enabled',
        description: '',
      },
    })
    expect(dictionary.status()).toBe(200)
    const dict = (await dictionary.json()).data
    const items = await request.put(
      `${api}/api/system/dictionaries/${dict.id}/items`,
      {
        headers: { ...headers, 'idempotency-key': randomUUID() },
        data: {
          expectedRevision: 1,
          items: [
            { label: '真实设备', value: 'real-device', disabled: false },
            { label: '禁用项', value: 'inactive', disabled: true },
          ],
        },
      }
    )
    expect(items.status()).toBe(200)
    await page.goto('/leave/application')
    await page.getByRole('button', { name: '编辑数据源', exact: true }).click()
    const manager = page.getByTestId('form-data-source-manager')
    await manager
      .getByRole('button', { name: '登记字典数据源', exact: true })
      .click()
    const editor = page.getByTestId('form-source-editor')
    await editor.getByLabel('数据源名称', { exact: true }).fill(name)
    await editor.getByLabel('数据源编码', { exact: true }).fill(code)
    await editor
      .getByLabel('搜索关联字典', { exact: true })
      .fill(`源字典-${suffix}`)
    await editor
      .getByRole('button', { name: '搜索关联字典', exact: true })
      .click()
    await editor
      .getByLabel('关联字典', { exact: true })
      .selectOption({ label: `源字典-${suffix}` })
    await editor
      .getByRole('button', { name: '保存数据源', exact: true })
      .click()
    await expect(editor).not.toBeVisible()
    const row = manager.locator('tbody tr').filter({ hasText: code })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '查询预览', exact: true }).click()
    await expect(manager.getByTestId('form-source-preview')).toContainText(
      '真实设备 (real-device)'
    )
    await expect(manager.getByTestId('form-source-preview')).not.toContainText(
      '禁用项'
    )
    await page.reload()
    await page.getByRole('button', { name: '编辑数据源', exact: true }).click()
    await row.getByRole('button', { name: '维护数据源', exact: true }).click()
    await expect(editor.getByLabel('数据源名称', { exact: true })).toHaveValue(
      name
    )
    await editor
      .getByLabel('数据源名称', { exact: true })
      .fill('本地尚未保存的来源')
    const list = await request.get(`${api}/api/form-data-sources`, {
      headers,
      params: { keyword: code },
    })
    expect(list.status()).toBe(200)
    const source = (await list.json()).data.list[0]
    const input = {
      code: source.code,
      name: '另一端已保存',
      kind: 'dictionary',
      dictionaryId: source.dictionaryId,
      status: 'enabled',
      description: '',
      expectedRevision: source.revision,
    }
    const updated = await request.put(
      `${api}/api/form-data-sources/${source.id}`,
      { headers: { ...headers, 'idempotency-key': randomUUID() }, data: input }
    )
    expect(updated.status()).toBe(200)
    const rejected = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/form-data-sources/${source.id}`) &&
        r.request().method() === 'PUT'
    )
    await editor
      .getByRole('button', { name: '保存数据源', exact: true })
      .click()
    const conflict = await rejected
    expect(conflict.status()).toBe(409)
    expect((await conflict.json()).businessCode).toBe('REVISION_CONFLICT')
    await expect(editor.getByLabel('数据源名称', { exact: true })).toHaveValue(
      '本地尚未保存的来源'
    )
    await expect(editor.getByRole('alert')).toContainText('记录已被修改')
    await editor
      .getByRole('button', { name: '重新读取数据源', exact: true })
      .click()
    await expect(editor.getByLabel('数据源名称', { exact: true })).toHaveValue(
      '另一端已保存'
    )
    await editor
      .getByLabel('数据源状态', { exact: true })
      .selectOption('disabled')
    await editor
      .getByRole('button', { name: '保存数据源', exact: true })
      .click()
    await expect(editor).not.toBeVisible()
    await manager
      .locator('tbody tr')
      .filter({ hasText: code })
      .getByRole('button', { name: '查询预览', exact: true })
      .click()
    await expect(manager.getByRole('alert')).toContainText('数据源已停用')
    await page.screenshot({
      path: 'test-results/full-product/form-source-manager-runtime.png',
    })
    const other = await browser.newContext()
    const b = await other.newPage()
    try {
      await login(b, 'b-admin')
      await b.goto('/leave/application')
      await b.getByRole('button', { name: '编辑数据源', exact: true }).click()
      await expect(
        b
          .getByTestId('form-data-source-manager')
          .locator('tbody tr')
          .filter({ hasText: code })
      ).toHaveCount(0)
      const bToken = await b.evaluate(() => localStorage.getItem('token'))
      const denied = await request.get(
        `${api}/api/form-data-sources/${source.id}/options`,
        {
          headers: {
            'x-access-token': bToken || '',
            'x-tenant-id': 'tenant-b',
          },
        }
      )
      expect(denied.status()).toBe(404)
    } finally {
      await other.close()
    }
  } finally {
    await context.close()
  }
})
