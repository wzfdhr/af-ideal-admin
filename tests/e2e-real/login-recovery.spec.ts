import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page } from '@playwright/test'

const submitRejectedLogin = async (
  page: Page,
  remaining = 1
): Promise<void> => {
  const pending = page.waitForResponse(
    (response) =>
      response.url().includes('/api/user/login') &&
      response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  const response = await pending
  if (response.status() === 429) {
    expect(
      remaining,
      'the actual throttle window must allow one retry'
    ).toBeGreaterThan(0)
    const seconds = Number(response.headers()['retry-after'])
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(60)
    await expect(
      page.getByRole('textbox', { name: '密码', exact: true })
    ).toHaveValue('invalid-demo-password')
    await page.waitForTimeout(seconds * 1000 + 100)
    await submitRejectedLogin(page, remaining - 1)
    return
  }
  expect(response.status(), 'wrong credentials must receive a real 401').toBe(
    401
  )
}
test('real login rejection and unauthenticated telemetry retain credentials for a corrected retry', async ({
  page,
}) => {
  await page.goto('/login')
  const username = page.getByRole('textbox', { name: '用户名', exact: true })
  const password = page.getByRole('textbox', { name: '密码', exact: true })
  await username.fill('a-employee')
  await password.fill('invalid-demo-password')
  const telemetry = page.waitForResponse(
    (response) =>
      response.url().includes('/api/audit/events') && response.status() === 401
  )
  await submitRejectedLogin(page)
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
