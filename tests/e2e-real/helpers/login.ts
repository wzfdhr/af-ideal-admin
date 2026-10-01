import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const submitLogin = async (page: Page, remaining = 1): Promise<void> => {
  const response = page.waitForResponse(
    (value) =>
      value.url().includes('/api/user/login') &&
      value.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  const result = await response
  if (result.status() === 429) {
    expect(
      remaining,
      'one real throttle window should permit the retry'
    ).toBeGreaterThan(0)
    const seconds = Number(result.headers()['retry-after'])
    expect(
      seconds,
      'limited login must expose its real retry window'
    ).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(60)
    await page.waitForTimeout(seconds * 1000 + 100)
    await submitLogin(page, remaining - 1)
    return
  }
  expect(result.status(), 'real login must succeed').toBe(200)
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
}
export default submitLogin
