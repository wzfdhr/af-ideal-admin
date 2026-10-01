import { test, expect } from '@playwright/test'

test('explicit Mock password page keeps its development credential change through SPA reauthentication', async ({
  page,
}) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill('a-employee')
  await page
    .getByRole('textbox', { name: '密码', exact: true })
    .fill('a-employee')
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
  await page.goto('/user/password')
  await expect(page.getByTestId('own-password-page')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  await page.getByLabel('当前密码', { exact: true }).fill('a-employee')
  await page
    .getByLabel('新密码', { exact: true })
    .fill('New-development-fixture-2026')
  await page
    .getByLabel('确认新密码', { exact: true })
    .fill('New-development-fixture-2026')
  await page
    .getByRole('button', { name: '修改密码并重新登录', exact: true })
    .click()
  await expect(page).toHaveURL(/\/login\?passwordChanged=1/)
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill('a-employee')
  await page
    .getByRole('textbox', { name: '密码', exact: true })
    .fill('New-development-fixture-2026')
  await page.getByRole('button', { name: '登录', exact: true }).first().click()
  await expect(page.getByTestId('leave-workplace')).toBeVisible()
})
