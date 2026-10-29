/* eslint-disable no-restricted-syntax, no-await-in-loop */
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import submitLogin from './helpers/login'
import type {
  APIRequestContext,
  BrowserContext,
  Page,
  TestInfo,
} from '@playwright/test'
import type {
  ManagedRole,
  MembershipPreferencesV1,
  TenantBrandConfigurationV1,
  TenantBrandDraftV1,
  TenantBrandRuntimeV1,
} from '@af-admin/contracts'

const apiOrigin = process.env.R1_API_URL || 'http://127.0.0.1:10888'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=',
  'base64'
)

const login = async (page: Page, username: string, password = username) => {
  await page.goto('/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill(username)
  await page.getByRole('textbox', { name: '密码', exact: true }).fill(password)
  await submitLogin(page)
}
const tokenOf = (page: Page) =>
  page.evaluate(() => localStorage.getItem('token') || '')
const caller = (
  request: APIRequestContext,
  token: string,
  tenantId = 'tenant-a'
) => {
  const raw = (path: string, method?: string, body?: unknown) =>
    request.fetch(`${apiOrigin}/api${path}`, {
      method: method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-access-token': token,
        'x-tenant-id': tenantId,
        'idempotency-key': randomUUID(),
      },
      ...(body === undefined ? {} : { data: body }),
    })
  const call = async <T>(path: string, method?: string, body?: unknown) => {
    const response = await raw(path, method, body)
    expect(response.status(), `${method || 'GET'} ${path}`).toBe(200)
    return (await response.json()).data as T
  }
  return { raw, call }
}
const waitResponse = (page: Page, path: string, method: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api${path}` &&
      response.request().method() === method
  )
const attach = async (testInfo: TestInfo, name: string, value: unknown) => {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, JSON.stringify(value, null, 2))
  await testInfo.attach(name, { path, contentType: 'application/json' })
}
const roleInput = (role: ManagedRole, permissions = role.permissions) => ({
  roleName: role.roleName,
  roleKey: role.roleKey,
  roleSort: role.roleSort,
  remark: role.remark || '',
  status: role.status,
  permissions,
  expectedRevision: role.revision,
})
interface OwnedMember {
  id: string
  username: string
  password: string
  roleId: string
}
const createMember = async (
  admin: ReturnType<typeof caller>,
  suffix: string,
  permissions: string[]
): Promise<OwnedMember> => {
  const username = `brand-${suffix}`
  const password = 'Tenant-brand-browser-2026'
  const user = await admin.call<{ id: string; revision: number }>(
    '/system/users',
    'POST',
    {
      username,
      name: `品牌成员-${suffix}`,
      phone: '',
      email: '',
      initialPassword: password,
      status: 'enabled',
    }
  )
  const role = await admin.call<ManagedRole>('/system/roles', 'POST', {
    roleName: `品牌角色-${suffix}`,
    roleKey: `brand-${suffix}`,
    roleSort: 0,
    remark: '',
    status: 'enabled',
    permissions,
  })
  await admin.call(`/system/users/${user.id}/authorization`, 'POST', {
    roleIds: [role.id],
    directPermissions: [],
    expectedRevision: user.revision,
  })
  return { id: user.id, username, password, roleId: role.id }
}
const cleanupMember = async (
  admin: ReturnType<typeof caller>,
  member: OwnedMember | undefined
) => {
  if (!member) return
  const auth = await admin.call<{ revision: number }>(
    `/system/users/${member.id}/authorization`
  )
  await admin.call(`/system/users/${member.id}/authorization`, 'POST', {
    roleIds: [],
    directPermissions: [],
    expectedRevision: auth.revision,
  })
  const user = await admin.call<{ revision: number }>(
    `/system/users/${member.id}`
  )
  await admin.call(`/system/users/${member.id}`, 'DELETE', {
    expectedRevision: user.revision,
  })
  const role = await admin.call<ManagedRole>(`/system/roles/${member.roleId}`)
  await admin.call(`/system/roles/${member.roleId}`, 'DELETE', {
    expectedRevision: role.revision,
  })
}
const saveDraft = async (
  api: ReturnType<typeof caller>,
  draft: TenantBrandDraftV1
) => {
  const current = await api.call<TenantBrandConfigurationV1>(
    '/tenant-branding/configuration'
  )
  return api.call<TenantBrandConfigurationV1>('/tenant-branding/draft', 'PUT', {
    version: 1,
    expectedRevision: current.revision,
    draft,
  })
}
const applySaved = async (api: ReturnType<typeof caller>) => {
  const current = await api.call<TenantBrandConfigurationV1>(
    '/tenant-branding/configuration'
  )
  return api.call<TenantBrandConfigurationV1>(
    '/tenant-branding/apply',
    'POST',
    { version: 1, expectedRevision: current.revision }
  )
}
const restoreBrand = async (
  api: ReturnType<typeof caller>,
  baseline: TenantBrandConfigurationV1
) => {
  if (!baseline.activeVersion) throw new Error('缺少可恢复的既有活动品牌版本')
  await saveDraft(api, baseline.activeVersion.snapshot)
  await applySaved(api)
  if (baseline.pendingApply) await saveDraft(api, baseline.draft)
}
const restorePreferences = async (
  api: ReturnType<typeof caller>,
  baseline: MembershipPreferencesV1
) => {
  const current = await api.call<MembershipPreferencesV1>(
    '/membership-preferences'
  )
  return api.call<MembershipPreferencesV1>('/membership-preferences', 'PATCH', {
    version: 1,
    expectedRevision: current.revision,
    locale: baseline.values.locale,
    appearance: baseline.values.appearance,
    compact: baseline.values.compact,
  })
}
const openBranding = async (page: Page) => {
  await page.goto('/theme/branding')
  await expect(page.getByTestId('tenant-brand-page')).toBeVisible()
  await expect(page.getByText('来源：server', { exact: false })).toBeVisible()
}
const waitForReadyFile = async (page: Page, fileName: string) => {
  const option = page
    .getByTestId('brand-logo-file')
    .locator('option')
    .filter({ hasText: fileName })
  await expect(async () => {
    await page.getByTestId('brand-logo-refresh').click()
    await expect(option).toContainText('ClamAV', { timeout: 1000 })
  }).toPass({ timeout: 60000 })
  return option
}
const setInheritPreferences = async (page: Page) => {
  await page.getByTestId('brand-pref-locale').selectOption('')
  await page.getByTestId('brand-pref-appearance').selectOption('')
  await page.getByTestId('brand-pref-compact').selectOption('')
  const saved = waitResponse(page, '/membership-preferences', 'PATCH')
  await page.getByTestId('brand-pref-save').click()
  expect((await saved).status()).toBe(200)
}

test('real tenant branding uploads scanned PNG and JPEG, persists a draft without applying, then applies immutable runtime bytes and tokens', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(300000)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  let api: ReturnType<typeof caller> | undefined
  let baseline: TenantBrandConfigurationV1 | undefined
  let preferenceBaseline: MembershipPreferencesV1 | undefined
  let mutated = false
  let primaryError: unknown
  try {
    await login(page, 'a-admin')
    api = caller(request, await tokenOf(page))
    baseline = await api.call<TenantBrandConfigurationV1>(
      '/tenant-branding/configuration'
    )
    preferenceBaseline = await api.call<MembershipPreferencesV1>(
      '/membership-preferences'
    )
    if (!baseline.activeVersion) {
      const savedBaseline = await saveDraft(api, baseline.draft)
      baseline = await applySaved(api)
      expect(baseline.activeVersion).not.toBeNull()
      mutated = true
      expect(savedBaseline.pendingApply).toBe(true)
    }
    await openBranding(page)
    await setInheritPreferences(page)

    const suffix = randomUUID().slice(0, 8)
    const pngName = `brand-${suffix}.png`
    const jpegName = `brand-${suffix}.jpg`
    const upload = page.getByTestId('brand-logo-upload')
    await upload.setInputFiles({
      name: pngName,
      mimeType: 'image/png',
      buffer: png,
    })
    const pngOption = await waitForReadyFile(page, pngName)
    await upload.setInputFiles({
      name: jpegName,
      mimeType: 'image/jpeg',
      buffer: jpeg,
    })
    const jpegOption = await waitForReadyFile(page, jpegName)
    await page
      .getByTestId('brand-logo-file')
      .selectOption(
        await jpegOption.getAttribute('value').then((value) => value || '')
      )
    await expect(page.getByTestId('brand-logo-file')).toHaveValue(
      await jpegOption.getAttribute('value').then((value) => value || '')
    )
    const pngId = await pngOption
      .getAttribute('value')
      .then((value) => value || '')
    await page.getByTestId('brand-logo-file').selectOption(pngId)

    const brandName = `真实品牌-${suffix}`
    const title = `真实控制台-${suffix}`
    await page.getByTestId('brand-name').fill(brandName)
    await page.getByTestId('brand-title').fill(title)
    await page.getByTestId('brand-color').fill('#0E9F6E')
    await page.getByTestId('brand-appearance').selectOption('dark')
    await page.getByTestId('brand-locale').selectOption('en-US')
    await page.getByTestId('brand-compact').check()
    const draftSaved = waitResponse(page, '/tenant-branding/draft', 'PUT')
    await page.getByTestId('brand-draft-save').click()
    expect((await draftSaved).status()).toBe(200)
    mutated = true
    const baselineTitle = baseline.activeVersion?.snapshot.title || ''
    expect(await page.title()).toBe(baselineTitle)
    await page.reload()
    await expect(page.getByTestId('brand-title')).toHaveValue(title)
    await expect(page.getByText('与活动版本不同，等待应用')).toBeVisible()
    expect(await page.title()).toBe(baselineTitle)

    await page.getByTestId('brand-draft-save').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('brand-apply')).toBeFocused()
    const appliedResponse = waitResponse(page, '/tenant-branding/apply', 'POST')
    await page.getByTestId('brand-apply').click()
    expect((await appliedResponse).status()).toBe(200)
    await expect(page.locator('.brand-toolbar h1')).toContainText(brandName)
    await expect(page).toHaveTitle(title)
    await expect(page.locator('.brand-toolbar img')).toHaveAttribute(
      'src',
      /^blob:/
    )
    const dom = await page.evaluate(() => ({
      theme: document.body.getAttribute('arco-theme'),
      compact: document.body.classList.contains('tenant-brand-compact'),
      primary: document.body.style.getPropertyValue('--primary-6'),
      language: document.documentElement.lang,
    }))
    expect(dom.theme).toBe('dark')
    expect(dom.compact).toBe(true)
    expect(dom.primary).toBe('14,159,110')
    expect(dom.language).toBe('en-US')

    const runtime = await api.call<TenantBrandRuntimeV1>(
      '/tenant-branding/runtime'
    )
    expect(runtime.branding.brandName).toBe(brandName)
    expect(runtime.preferences.effective.locale).toBe('en-US')
    expect(runtime.logo?.status).toBe('ready')
    const logo = await api.raw('/tenant-branding/logo')
    expect(logo.status()).toBe(200)
    const bytes = await logo.body()
    expect(bytes.length).toBe(runtime.logo?.metadata?.size)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      runtime.logo?.metadata?.sha256
    )
    expect(logo.headers()['content-type']).toBe(
      runtime.logo?.metadata?.mimeType
    )
    const screenshot = testInfo.outputPath('tenant-branding-applied-1440.png')
    await page.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach('tenant-branding-applied-1440', {
      path: screenshot,
      contentType: 'image/png',
    })
    await attach(testInfo, 'tenant-branding-applied', {
      brandName,
      title,
      pngFileId: pngId,
      activeVersionId: runtime.activeVersionId,
      logoSha256: runtime.logo?.metadata?.sha256,
      dark: dom.theme === 'dark',
      compact: dom.compact,
      locale: runtime.preferences.effective.locale,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (api && baseline && mutated) {
      try {
        await restoreBrand(api, baseline)
      } catch (error) {
        errors.push(error)
      }
    }
    if (api && preferenceBaseline) {
      try {
        await restorePreferences(api, preferenceBaseline)
      } catch (error) {
        errors.push(error)
      }
    }
    await context.close()
    if (errors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        '租户品牌正向验收恢复失败'
      )
  }
})

test('membership preferences remain current-user and tenant scoped, reject stale CAS and clear branding on switch, revoke and logout', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000)
  const contexts: BrowserContext[] = []
  let member: OwnedMember | undefined
  let manager: OwnedMember | undefined
  let adminApi: ReturnType<typeof caller> | undefined
  let memberApi: ReturnType<typeof caller> | undefined
  let memberBaseline: MembershipPreferencesV1 | undefined
  let primaryError: unknown
  try {
    const [
      adminContext,
      firstContext,
      staleContext,
      managerContext,
      crossContext,
    ] = await Promise.all(
      Array.from({ length: 5 }, () =>
        browser.newContext({ viewport: { width: 1280, height: 800 } })
      )
    )
    contexts.push(
      adminContext,
      firstContext,
      staleContext,
      managerContext,
      crossContext
    )
    const [adminPage, first, stale, managerPage, cross] = await Promise.all(
      contexts.map((context) => context.newPage())
    )
    await login(adminPage, 'a-admin')
    adminApi = caller(request, await tokenOf(adminPage))
    const suffix = randomUUID().slice(0, 8)
    member = await createMember(adminApi, `${suffix}-member`, [])
    manager = await createMember(adminApi, `${suffix}-manager`, [
      'tenant:brand:manage',
    ])
    await Promise.all([
      login(first, member.username, member.password),
      login(stale, member.username, member.password),
      login(managerPage, manager.username, manager.password),
    ])
    memberApi = caller(request, await tokenOf(stale))
    memberBaseline = await memberApi.call<MembershipPreferencesV1>(
      '/membership-preferences'
    )
    await Promise.all([
      openBranding(first),
      openBranding(stale),
      openBranding(managerPage),
    ])
    expect(await managerPage.getByTestId('brand-draft-save').isVisible()).toBe(
      true
    )
    expect(await first.getByTestId('brand-draft-save').count()).toBe(0)

    await first.getByTestId('brand-pref-locale').selectOption('en-US')
    await first.getByTestId('brand-pref-appearance').selectOption('dark')
    await first.getByTestId('brand-pref-compact').selectOption('true')
    const firstSaved = waitResponse(first, '/membership-preferences', 'PATCH')
    await first.getByTestId('brand-pref-save').click()
    expect((await firstSaved).status()).toBe(200)
    await expect
      .poll(() =>
        first.evaluate(() => document.body.getAttribute('arco-theme'))
      )
      .toBe('dark')
    expect(
      await first.evaluate(() =>
        document.body.classList.contains('tenant-brand-compact')
      )
    ).toBe(true)

    await stale.getByTestId('brand-pref-locale').selectOption('zh-CN')
    await stale.getByTestId('brand-pref-save').click()
    await expect(stale.getByRole('alert')).toContainText('其他会话更新')
    await expect(stale.getByTestId('brand-pref-locale')).toHaveValue('zh-CN')

    await setInheritPreferences(first)
    const inherited = await memberApi.call<MembershipPreferencesV1>(
      '/membership-preferences'
    )
    expect(inherited.values).toEqual({
      locale: null,
      appearance: null,
      compact: null,
    })

    const managerRole = await adminApi.call<ManagedRole>(
      `/system/roles/${manager.roleId}`
    )
    await managerPage.getByTestId('brand-title').fill('撤权后不得保存')
    await adminApi.call(`/system/roles/${manager.roleId}`, 'PUT', {
      ...roleInput(managerRole, []),
    })
    await expect(managerPage).toHaveURL(/not-allowed|login/)
    expect(
      (
        await caller(request, await tokenOf(managerPage)).raw(
          '/tenant-branding/configuration'
        )
      ).status()
    ).toBe(403)

    const tenantARuntime = await adminApi.call<TenantBrandRuntimeV1>(
      '/tenant-branding/runtime'
    )
    await login(cross, 'cross-tenant-employee')
    await cross.getByTestId('tenant-context-select').selectOption('tenant-b')
    await expect(cross.getByTestId('tenant-context-select')).toHaveValue(
      'tenant-b'
    )
    const bApi = caller(request, await tokenOf(cross), 'tenant-b')
    const tenantBRuntime = await bApi.call<TenantBrandRuntimeV1>(
      '/tenant-branding/runtime'
    )
    await expect(cross.locator('.brand-toolbar h1')).toContainText(
      tenantBRuntime.branding.brandName
    )
    expect(tenantBRuntime.tenantId).toBe('tenant-b')
    expect(tenantBRuntime.branding.brandName).not.toBe(
      tenantARuntime.branding.brandName
    )

    await first.locator('.brand-toolbar .arco-avatar').click()
    await first.getByText('注销登录', { exact: true }).click()
    await expect(first).toHaveURL(/login/)
    await expect(first.locator('.brand-toolbar')).toHaveCount(0)
    expect(await first.title()).not.toContain('真实控制台-')
    expect(
      await first.evaluate(() => document.body.hasAttribute('arco-theme'))
    ).toBe(false)
    const screenshot = testInfo.outputPath('tenant-branding-member-1280.png')
    await cross.screenshot({ path: screenshot, fullPage: true })
    await testInfo.attach('tenant-branding-member-1280', {
      path: screenshot,
      contentType: 'image/png',
    })
    await attach(testInfo, 'tenant-branding-scope', {
      memberId: member.id,
      managerId: manager.id,
      tenantA: tenantARuntime.activeVersionId,
      tenantB: tenantBRuntime.activeVersionId,
      staleCasRejected: true,
      permissionRevoked: true,
      logoutDefaults: true,
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    const errors: unknown[] = []
    if (memberApi && memberBaseline) {
      try {
        await restorePreferences(memberApi, memberBaseline)
      } catch (error) {
        errors.push(error)
      }
    }
    if (adminApi) {
      for (const owned of [member, manager]) {
        try {
          await cleanupMember(adminApi, owned)
        } catch (error) {
          errors.push(error)
        }
      }
    }
    await Promise.all(contexts.map((context) => context.close()))
    if (errors.length)
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        primaryError ? [primaryError, ...errors] : errors,
        '租户品牌范围验收清理失败'
      )
  }
})
