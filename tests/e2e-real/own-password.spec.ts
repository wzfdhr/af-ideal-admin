import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type { Page } from '@playwright/test'

const login = async (page: Page, username: string, password: string) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}
test('own password page corrects errors, supports keyboard flow and revokes every old browser session', async ({
  browser,
  request,
}) => {
  const adminContext = await browser.newContext()
  const memberContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  })
  const otherContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const member = await memberContext.newPage()
  const other = await otherContext.newPage()
  const username = `own-password-${randomUUID().slice(0, 8)}`
  const initialPassword = 'Initial-private-page-password-2026'
  const newPassword = 'Changed-private-page-password-2026'
  try {
    await login(admin, 'a-admin', 'a-admin')
    await admin.goto('/system/userSystem')
    await admin.getByRole('button', { name: '新增用户', exact: true }).click()
    const editor = admin.getByTestId('member-editor-modal')
    await editor.getByPlaceholder('请输入账号名称').fill(username)
    await editor.getByPlaceholder('请输入成员姓名').fill('本人密码验收成员')
    await editor.getByLabel('初始密码').fill(initialPassword)
    await editor.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await login(member, username, initialPassword)
    await login(other, username, initialPassword)
    const tokens = await Promise.all(
      [member, other].map((page) =>
        page.evaluate(() => localStorage.getItem('token'))
      )
    )
    await member.goto('/user/password')
    await expect(member.getByTestId('own-password-page')).toHaveAttribute(
      'aria-busy',
      'false'
    )
    await member
      .getByLabel('当前密码', { exact: true })
      .fill('Wrong-private-page-password-2026')
    await member.getByLabel('新密码', { exact: true }).fill(newPassword)
    await member
      .getByLabel('确认新密码', { exact: true })
      .fill('Other-private-page-password-2026')
    await member
      .getByRole('button', { name: '修改密码并重新登录', exact: true })
      .click()
    await expect(member.getByRole('alert')).toHaveText('两次新密码不一致')
    await member.getByLabel('确认新密码', { exact: true }).fill(newPassword)
    await member
      .getByRole('button', { name: '修改密码并重新登录', exact: true })
      .click()
    await expect(
      member.getByTestId('own-password-page').getByRole('alert')
    ).toHaveText('当前密码不正确')
    await expect(member.getByLabel('新密码', { exact: true })).toHaveValue(
      newPassword
    )
    await member.getByLabel('当前密码', { exact: true }).fill(initialPassword)
    await member.getByLabel('当前密码', { exact: true }).focus()
    await member.keyboard.press('Tab')
    await expect(member.getByLabel('新密码', { exact: true })).toBeFocused()
    await member.keyboard.press('Tab')
    await expect(member.getByLabel('确认新密码', { exact: true })).toBeFocused()
    await member.screenshot({
      path: 'test-results/full-product/own-password-1280.png',
      fullPage: true,
    })
    await member.keyboard.press('Tab')
    await expect(
      member.getByRole('button', { name: '修改密码并重新登录', exact: true })
    ).toBeFocused()
    await member.keyboard.press('Enter')
    await expect(member).toHaveURL(/\/login\?passwordChanged=1/)
    await expect(
      member.getByText('密码已修改，请使用新密码重新登录', { exact: true })
    ).toBeVisible()
    const rejected = await Promise.all(
      tokens.map((token) =>
        request.get(
          `${process.env.R1_API_URL || 'http://127.0.0.1:10888'}/api/user/info`,
          {
            headers: {
              'x-access-token': token || '',
              'x-tenant-id': 'tenant-a',
            },
          }
        )
      )
    )
    rejected.forEach((response) => expect(response.status()).toBe(401))
    await other.reload()
    await expect(other).toHaveURL(/\/login/)
    await login(member, username, newPassword)
    await expect(
      member.getByRole('heading', { name: '本人密码验收成员，欢迎回来' })
    ).toBeVisible()
    await admin.getByLabel('查询账号名称').fill(username)
    await admin.getByRole('button', { name: '搜索', exact: true }).click()
    const row = admin.locator('tbody tr').filter({ hasText: username })
    await row.getByRole('button', { name: '撤销成员', exact: true }).click()
    await admin
      .getByRole('dialog', { name: '确认操作', exact: true })
      .getByRole('button', { name: '确认', exact: true })
      .click()
    await expect(row).toHaveCount(0)
  } finally {
    await adminContext.close()
    await memberContext.close()
    await otherContext.close()
  }
})
