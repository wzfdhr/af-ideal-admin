import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({
  data,
  success: true,
  code: 20000,
})

const mockAuthApi = async (page: Page, role: 'admin' | 'user') => {
  await page.route('**/api/user/login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ok({ token: `${role}12345` })),
    })
  })

  await page.route('**/api/user/info', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        ok({
          name: role,
          avatar: '',
          email: `${role}@example.com`,
          job: 'Engineer',
          dept: 'Product',
          role,
        })
      ),
    })
  })
}

const loginAs = async (page: Page, username: 'admin' | 'user') => {
  await mockAuthApi(page, username)
  await page.goto('/login')

  const loginForm = page.locator('form').first()
  await loginForm.locator('input').nth(0).fill(username)
  await loginForm.locator('input[type="password"]').fill(username)
  await loginForm.locator('button[type="submit"]').click()

  await expect(page).toHaveURL(/\/dashboard\/workplace/)
}

test('admin can log in and open workplace', async ({ page }) => {
  await loginAs(page, 'admin')
})

test('user can access user-only permission page', async ({ page }) => {
  await loginAs(page, 'user')

  await page.goto('/permissions/front/page')

  await expect(page).toHaveURL(/\/permissions\/front\/page/)
})

test('admin is blocked from user-only permission page', async ({ page }) => {
  await loginAs(page, 'admin')

  await page.goto('/permissions/front/page')

  await expect(page).toHaveURL(/\/not-allowed/)
})
