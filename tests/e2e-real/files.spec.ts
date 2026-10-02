import { readFile } from 'node:fs/promises'
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
test('real file selection uploads bytes, waits for the real scanner and downloads the same file; infected content stays isolated', async ({
  page,
}) => {
  await login(page, 'a-admin')
  await page.goto('/resource/files')
  await expect(page.getByTestId('real-file-resource-center')).toBeVisible()
  const suffix = randomUUID().slice(0, 8)
  const name = `real-${suffix}.txt`
  const bytes = Buffer.from(`真实字节-${suffix}\n`)
  await page
    .getByLabel('选择真实文件')
    .setInputFiles({ name, mimeType: 'text/plain', buffer: bytes })
  const row = page
    .getByTestId('stored-files')
    .locator('li')
    .filter({ hasText: name })
  await expect(row).toBeVisible()
  await expect
    .poll(
      async () => {
        await page
          .getByRole('button', { name: '刷新文件状态', exact: true })
          .click()
        return row.innerText()
      },
      { timeout: 60000, intervals: [1000] }
    )
    .toContain('扫描通过')
  const downloaded = page.waitForEvent('download')
  await row.getByRole('button', { name: '下载', exact: true }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toBe(name)
  expect(await readFile((await file.path()) || '')).toEqual(bytes)
  await row.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '文件预览' })).toBeVisible()
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  const infectedName = `eicar-${suffix}.txt`
  const vector = Buffer.from(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
  )
  await page.getByLabel('选择真实文件').setInputFiles({
    name: infectedName,
    mimeType: 'text/plain',
    buffer: vector,
  })
  const isolated = page
    .getByTestId('stored-files')
    .locator('li')
    .filter({ hasText: infectedName })
  await expect(isolated).toBeVisible()
  await expect
    .poll(
      async () => {
        await page
          .getByRole('button', { name: '刷新文件状态', exact: true })
          .click()
        return isolated.innerText()
      },
      { timeout: 60000, intervals: [1000] }
    )
    .toContain('检测到威胁')
  await expect(
    isolated.getByRole('button', { name: '下载', exact: true })
  ).toHaveCount(0)
  await expect(
    isolated.getByRole('button', { name: '预览', exact: true })
  ).toHaveCount(0)
  await page.screenshot({
    path: 'test-results/full-product/files-real-scanner-browser.png',
  })
})
