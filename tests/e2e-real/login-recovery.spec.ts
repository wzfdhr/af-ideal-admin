import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'

test('real login rejection and unauthenticated telemetry retain credentials for a corrected retry', async ({
  page,
}) => {
  await page.goto('/login')
  const username = page.getByRole('textbox', { name: '用户名', exact: true })
  const password = page.getByRole('textbox', { name: '密码', exact: true })
  await username.fill('a-employee')
  await password.fill('invalid-demo-password')
  const rejected = page.waitForResponse(
    (response) =>
      response.url().includes('/api/user/login') && response.status() === 401
  )
  const telemetry = page.waitForResponse(
    (response) =>
      response.url().includes('/api/audit/events') && response.status() === 401
  )
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await rejected
  await telemetry
  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByText('用户名或密码错误', { exact: true }).first()
  ).toBeVisible()
  await expect(username).toHaveValue('a-employee')
  await expect(password).toHaveValue('invalid-demo-password')
  await password.fill('a-employee')
  await submitLogin(page)
})
