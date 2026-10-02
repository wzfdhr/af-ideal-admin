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
test('real dictionary metadata and typed options survive reopening, reject stale revisions and isolate another tenant', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const suffix = randomUUID().slice(0, 8)
  const name = `设备类别-${suffix}`
  const type = `device-${suffix}`
  try {
    await login(page, 'a-admin')
    await page.goto('/system/dictSystem')
    await page.getByRole('button', { name: '新增字典', exact: true }).click()
    const editor = page.getByTestId('dict-editor-modal')
    await editor.getByPlaceholder('请输入字典名称').fill(name)
    await editor.getByPlaceholder('请输入字典类型').fill(type)
    await editor.getByPlaceholder('请输入描述').fill('真实选项持久化')
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    const row = page.locator('tbody tr').filter({ hasText: name })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '选项', exact: true }).click()
    const options = page.getByTestId('dictionary-options-modal')
    await expect(options.getByText(/版本 1/)).toBeVisible()
    await options.getByRole('button', { name: '添加选项', exact: true }).click()
    await options.getByLabel('选项1标签', { exact: true }).fill('笔记本')
    await options.getByLabel('选项1值', { exact: true }).fill('laptop')
    await options.getByRole('button', { name: '添加选项', exact: true }).click()
    await options.getByLabel('选项2标签', { exact: true }).fill('旧型号')
    await options.getByLabel('选项2值', { exact: true }).fill('old')
    await options
      .getByTestId('dictionary-option-1')
      .getByRole('checkbox')
      .check()
    await options.getByRole('button', { name: '保存选项', exact: true }).click()
    await expect(options.getByText(/版本 2/)).toBeVisible()
    await options
      .getByRole('button', { name: '刷新运行选项', exact: true })
      .click()
    await expect(options.getByTestId('dictionary-runtime-options')).toHaveText(
      '笔记本 (laptop)'
    )
    await page.screenshot({
      path: 'test-results/full-product/dictionaries-options-runtime.png',
    })
    await page.keyboard.press('Escape')
    await expect(options).not.toBeVisible()
    await page.reload()
    await row.getByRole('button', { name: '选项', exact: true }).click()
    await expect(options.getByLabel('选项1标签', { exact: true })).toHaveValue(
      '笔记本'
    )
    await expect(
      options.getByTestId('dictionary-option-1').getByRole('checkbox')
    ).toBeChecked()
    await options.getByLabel('选项1标签', { exact: true }).fill('本地尚未保存')
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const headers = {
      'x-access-token': token || '',
      'x-tenant-id': 'tenant-a',
      'idempotency-key': randomUUID(),
    }
    const api = process.env.R1_API_URL || 'http://127.0.0.1:10888'
    const listed = await request.get(`${api}/api/system/dictionaries`, {
      headers,
      params: { dictType: type },
    })
    expect(listed.status()).toBe(200)
    const saved = (await listed.json()).data.list[0]
    const concurrent = await request.put(
      `${api}/api/system/dictionaries/${saved.id}/items`,
      {
        headers,
        data: {
          expectedRevision: 2,
          items: [{ label: '远端已保存', value: 'laptop', disabled: false }],
        },
      }
    )
    expect(concurrent.status()).toBe(200)
    const rejected = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/system/dictionaries/${saved.id}/items`) &&
        response.request().method() === 'PUT'
    )
    await options.getByRole('button', { name: '保存选项', exact: true }).click()
    const conflict = await rejected
    expect(conflict.status()).toBe(409)
    expect((await conflict.json()).businessCode).toBe('REVISION_CONFLICT')
    await expect(options.getByRole('alert')).toHaveText(
      '记录已被修改，请刷新后确认'
    )
    await expect(options.getByLabel('选项1标签', { exact: true })).toHaveValue(
      '本地尚未保存'
    )
    page.once('dialog', (dialog) => dialog.accept())
    await options
      .getByRole('button', { name: '重新读取选项', exact: true })
      .click()
    await expect(options.getByLabel('选项1标签', { exact: true })).toHaveValue(
      '远端已保存'
    )
    await options
      .getByRole('button', { name: '刷新运行选项', exact: true })
      .click()
    await expect(options.getByTestId('dictionary-runtime-options')).toHaveText(
      '远端已保存 (laptop)'
    )
    await page.keyboard.press('Escape')
    await expect(options).not.toBeVisible()
    await context.close()
    const other = await browser.newContext()
    const b = await other.newPage()
    try {
      await login(b, 'b-admin')
      await b.goto('/system/dictSystem')
      await b
        .locator('.dict-system-page__query')
        .getByPlaceholder('请输入字典类型')
        .fill(type)
      const queried = b.waitForResponse(
        (response) =>
          response.url().includes('/api/system/dictionaries?') &&
          response.request().method() === 'GET'
      )
      await b.getByRole('button', { name: '搜索', exact: true }).click()
      expect((await queried).status()).toBe(200)
      await expect(b.locator('tbody tr').filter({ hasText: name })).toHaveCount(
        0
      )
      const bToken = await b.evaluate(() => localStorage.getItem('token'))
      const absent = await request.get(
        `${api}/api/system/dictionaries/${saved.id}`,
        {
          headers: {
            'x-access-token': bToken || '',
            'x-tenant-id': 'tenant-b',
          },
        }
      )
      expect(absent.status()).toBe(404)
    } finally {
      await other.close()
    }
  } finally {
    await context.close()
  }
})
