# Engineering Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade AF-Ideal-Admin from a runnable admin template into a safer, testable, CI-backed engineering baseline.

**Architecture:** Keep the current Vue 3 + Vite structure, but harden the highest-risk seams first: auth storage, route permissions, form rule parsing, environment configuration, and delivery checks. Add focused utility modules and tests instead of broad rewrites, then wire CI to enforce the new baseline.

**Tech Stack:** Vue 3, TypeScript, Vite 4, Pinia, Vue Router 4, Arco Design Vue, Axios, Vitest, Vue Test Utils, Playwright, GitHub Actions.

---

## File Structure

- Modify `package.json` to add real test scripts and dependencies.
- Modify `.eslintrc.js` so production-oriented lint rules behave correctly.
- Modify `config/index.ts` to align request base URL with Vite environment variables.
- Modify `vite.config.ts` to use environment-driven API proxy configuration.
- Modify `.env.development` and `.env.production` to use consistent API variables.
- Modify `src/router/routes/typings.d.ts` to formalize route meta fields.
- Modify `src/router/routes/modules/*.ts` to standardize permissions as `meta.roles`.
- Modify `src/router/routes/modules/Permissions.ts` to replace string components with a real route group layout.
- Modify `src/hooks/use-permission.ts` to use typed route records and one permission model.
- Modify `src/router/guards/login-guard.ts` and `src/router/guards/permission.ts` to normalize redirect and unauthorized behavior.
- Modify `src/utils/auth.ts` to centralize token storage and auth clearing.
- Modify `src/views/login/widgets/normal-form.vue` to stop storing password.
- Delete `src/utils/encryption.ts` after password persistence is removed.
- Create `src/components/s-form/renderer/rules.ts` to parse safe rule presets without `eval`.
- Modify `src/components/s-form/renderer/form-widget-renderer.vue` to use the safe rule parser and guard remote option loading.
- Create `src/test/setup.ts` for Vitest DOM setup.
- Create `vitest.config.ts` for unit tests.
- Create `tests/unit/permission.test.ts` for role access behavior.
- Create `tests/unit/form-rules.test.ts` for safe form rule parsing.
- Create `tests/unit/auth.test.ts` for token storage behavior.
- Create `playwright.config.ts` for browser smoke tests.
- Create `tests/e2e/auth-permission.spec.ts` for login and permission flows.
- Create `.github/workflows/ci.yml` to run install, lint, typecheck, build, unit tests, and e2e smoke tests.
- Create `docs/architecture/auth-permission.md` to document route, menu, and permission contracts.
- Create `docs/deployment.md` to document static deployment and history fallback.

---

### Task 1: Add Test Tooling Baseline

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Add dependencies and scripts**

Modify `package.json` scripts to include real test commands:

```json
{
  "scripts": {
    "dev": "vite serve --mode development",
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "build:dev": "vue-tsc --noEmit && vite build --mode development",
    "build:prd": "vue-tsc --noEmit && vite build --mode production",
    "preview": "vite preview",
    "lint": "npx eslint . --ext .ts,.js,.tsx,.jsx,.vue --fix",
    "lint:check": "npx eslint . --ext .ts,.js,.tsx,.jsx,.vue",
    "lint-staged": "npx lint-staged",
    "prepare": "husky install",
    "serve": "vite preview"
  }
}
```

Add these dev dependencies:

```bash
npm install -D vitest @vue/test-utils jsdom @playwright/test
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, './config/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 3: Create test setup**

Create `src/test/setup.ts`:

```ts
import { afterEach } from 'vitest'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
```

- [ ] **Step 4: Create Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build:prd && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

- [ ] **Step 5: Verify tooling installs and basic commands run**

Run:

```bash
npm install
npm run typecheck
npm run test
```

Expected:

```text
vue-tsc exits 0
vitest exits 0 or reports "No test files found" before tests are added
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts playwright.config.ts
git commit -m "test: add project test tooling"
```

---

### Task 2: Standardize Route Permission Metadata

**Files:**
- Modify: `src/router/routes/typings.d.ts`
- Modify: `src/router/routes/modules/form.ts`
- Modify: `src/router/routes/modules/list.ts`
- Modify: `src/router/routes/modules/Permissions.ts`
- Modify: `src/hooks/use-permission.ts`
- Create: `tests/unit/permission.test.ts`

- [ ] **Step 1: Write failing permission tests**

Create `tests/unit/permission.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canAccessRoute, getFirstAccessibleRoute } from '@/hooks/use-permission'
import type { RouteRecordRaw } from 'vue-router'

describe('route permissions', () => {
  it('allows public routes without requireAuth', () => {
    expect(canAccessRoute({ path: '/login', name: 'login' }, '')).toBe(true)
  })

  it('allows wildcard roles', () => {
    expect(
      canAccessRoute(
        {
          path: '/dashboard',
          name: 'dashboard',
          meta: { requireAuth: true, roles: ['*'] },
        },
        'user'
      )
    ).toBe(true)
  })

  it('denies users whose role is not listed', () => {
    expect(
      canAccessRoute(
        {
          path: '/system',
          name: 'system',
          meta: { requireAuth: true, roles: ['admin'] },
        },
        'user'
      )
    ).toBe(false)
  })

  it('returns the first accessible nested route by role', () => {
    const routes: RouteRecordRaw[] = [
      {
        path: '/admin',
        name: 'admin',
        meta: { requireAuth: true, roles: ['admin'] },
      },
      {
        path: '/dashboard',
        name: 'dashboard',
        meta: { requireAuth: true, roles: ['*'] },
        children: [
          {
            path: 'workplace',
            name: 'workplace',
            meta: { requireAuth: true, roles: ['*'] },
          },
        ],
      },
    ]

    expect(getFirstAccessibleRoute(routes, 'user')).toEqual({ name: 'dashboard' })
  })
})
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- tests/unit/permission.test.ts
```

Expected:

```text
FAIL because canAccessRoute and getFirstAccessibleRoute are not exported
```

- [ ] **Step 3: Export pure permission helpers**

Modify `src/hooks/use-permission.ts`:

```ts
import { useUserStore } from '@/store'
import type { UserRole } from '@config'
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

type PermissionRoute = RouteLocationNormalized | RouteRecordRaw

export const canAccessRoute = (
  route: PermissionRoute,
  role: UserRole | string
) => {
  const roles = route.meta?.roles

  if (!route.meta?.requireAuth) return true
  if (!roles || roles.length === 0) return true
  if (roles.includes('*')) return true

  return roles.includes(role)
}

export const getFirstAccessibleRoute = (
  rs: RouteRecordRaw[],
  role: UserRole | string = 'admin'
) => {
  const routes = [...rs]

  while (routes.length) {
    const first = routes.shift()
    if (!first) continue

    if (canAccessRoute(first, role)) {
      return { name: first.name }
    }

    if (first.children) {
      routes.push(...first.children)
    }
  }

  return null
}

const usePermission = () => {
  const userStore = useUserStore()

  return {
    hasAccessToRoute(route: PermissionRoute) {
      return canAccessRoute(route, userStore.role)
    },
    getFirstAccessibleRoute(rs: RouteRecordRaw[], role = 'admin') {
      return getFirstAccessibleRoute(rs, role)
    },
  }
}

export default usePermission
```

- [ ] **Step 4: Standardize route meta typing**

Modify `src/router/routes/typings.d.ts`:

```ts
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    roles?: string[]
    requireAuth?: boolean
    icon?: string
    locale?: string
    text?: string
    hideInMenu?: boolean
    hideChildrenInMenu?: boolean
    activeMenu?: string
    order?: number
    noAffix?: boolean
    ignoreCache?: boolean
    openInNewWindow?: boolean
  }
}
```

- [ ] **Step 5: Replace wrong route permission keys**

In `src/router/routes/modules/form.ts`, replace every child `meta.role` with `meta.roles`.

In `src/router/routes/modules/list.ts`, replace every child `meta.rules` with `meta.roles`.

The resulting child meta blocks should use this shape:

```ts
meta: {
  locale: 'menu.form.step',
  requireAuth: true,
  roles: ['*'],
}
```

- [ ] **Step 6: Run focused test**

Run:

```bash
npm run test -- tests/unit/permission.test.ts
```

Expected:

```text
PASS tests/unit/permission.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/router/routes/typings.d.ts src/router/routes/modules/form.ts src/router/routes/modules/list.ts src/hooks/use-permission.ts tests/unit/permission.test.ts
git commit -m "fix: standardize route permissions"
```

---

### Task 3: Replace String Route Components With Real Group Layout

**Files:**
- Create: `src/layout/route-group-layout.vue`
- Modify: `src/router/constants.ts`
- Modify: `src/router/routes/modules/Permissions.ts`
- Test: `tests/unit/permission.test.ts`

- [ ] **Step 1: Create route group layout**

Create `src/layout/route-group-layout.vue`:

```vue
<template>
  <router-view />
</template>
```

- [ ] **Step 2: Export the layout**

Modify `src/router/constants.ts`:

```ts
export const defaultLayout = () => import('@/layout/default-layout.vue')
export const fullPageLayout = () => import('@/layout/full-page-layout.vue')
export const routeGroupLayout = () => import('@/layout/route-group-layout.vue')

export const whiteList = [
  { name: 'not-found', children: [] },
  { name: 'login', children: [] },
]
```

- [ ] **Step 3: Use the layout in permission routes**

Modify `src/router/routes/modules/Permissions.ts`:

```ts
import { defaultLayout, routeGroupLayout } from '@/router/constants'
import { AppRouteRecordRaw } from '../../types'
```

Replace both `component: ''` entries with:

```ts
component: routeGroupLayout,
```

- [ ] **Step 4: Verify typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
vue-tsc exits 0
```

- [ ] **Step 5: Commit**

```bash
git add src/layout/route-group-layout.vue src/router/constants.ts src/router/routes/modules/Permissions.ts
git commit -m "fix: use route group layout"
```

---

### Task 4: Remove Password Persistence and Weak Client Encryption

**Files:**
- Modify: `src/views/login/widgets/normal-form.vue`
- Modify: `src/utils/auth.ts`
- Delete: `src/utils/encryption.ts`
- Create: `tests/unit/auth.test.ts`

- [ ] **Step 1: Write auth storage tests**

Create `tests/unit/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clearAuth, clearToken, getToken, isAuthed, setToken } from '@/utils/auth'

describe('auth storage', () => {
  it('stores and clears token', () => {
    expect(isAuthed()).toBe(false)

    setToken('token-123')

    expect(getToken()).toBe('token-123')
    expect(isAuthed()).toBe(true)

    clearToken()

    expect(getToken()).toBeNull()
    expect(isAuthed()).toBe(false)
  })

  it('clears token and role together', () => {
    setToken('token-123')
    localStorage.setItem('userRole', 'admin')

    clearAuth()

    expect(getToken()).toBeNull()
    expect(localStorage.getItem('userRole')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- tests/unit/auth.test.ts
```

Expected:

```text
FAIL because clearAuth is not exported
```

- [ ] **Step 3: Centralize auth clearing**

Modify `src/utils/auth.ts`:

```ts
const TOKEN_KEY = 'token'
const ROLE_KEY = 'userRole'

const isAuthed = () => !!localStorage.getItem(TOKEN_KEY)

const getToken = () => localStorage.getItem(TOKEN_KEY)

const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

export { isAuthed, getToken, setToken, clearToken, clearAuth }
```

- [ ] **Step 4: Remove password persistence from login form**

Modify `src/views/login/widgets/normal-form.vue`:

Remove:

```ts
import { encrypt } from '@/utils/encryption'
```

Change `loginConfig` to:

```ts
const loginConfig = useStorage('login-config', {
  shouldStoreUsername: false,
  username: '',
})
```

Initialize username after `loginConfig`:

```ts
loginInfo.username = loginConfig.value.username
```

Change the checkbox block to:

```vue
<a-checkbox
  v-model="loginConfig.shouldStoreUsername"
  @change="setRememberUsername as any"
>
  记住用户名
</a-checkbox>
```

Change the successful-login persistence code to:

```ts
const { shouldStoreUsername } = loginConfig.value
const { username } = values

loginConfig.value.username = shouldStoreUsername ? username : ''
```

Rename the checkbox handler:

```ts
const setRememberUsername = (val: boolean) => {
  loginConfig.value.shouldStoreUsername = val
}
```

- [ ] **Step 5: Update logout to clear role**

Modify `src/store/modules/user.ts` import:

```ts
import { clearAuth, clearToken, setToken } from '@/utils/auth'
```

Change logout cleanup:

```ts
clearAuth()
```

Keep `clearToken()` in the login failure path because that path should not remove unrelated local role state unless login failed after role mutation.

- [ ] **Step 6: Delete encryption utility**

Delete `src/utils/encryption.ts`.

Run:

```bash
rg "utils/encryption|encrypt\\(|decrypt\\(" src
```

Expected:

```text
No matches
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm run test -- tests/unit/auth.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/unit/auth.test.ts
vue-tsc exits 0
```

- [ ] **Step 8: Commit**

```bash
git add src/views/login/widgets/normal-form.vue src/utils/auth.ts src/store/modules/user.ts tests/unit/auth.test.ts
git rm src/utils/encryption.ts
git commit -m "fix: stop persisting login passwords"
```

---

### Task 5: Replace Dynamic Form Rule `eval`

**Files:**
- Create: `src/components/s-form/renderer/rules.ts`
- Modify: `src/components/s-form/renderer/form-widget-renderer.vue`
- Create: `tests/unit/form-rules.test.ts`

- [ ] **Step 1: Write safe rule parser tests**

Create `tests/unit/form-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseWidgetRules } from '@/components/s-form/renderer/rules'

describe('parseWidgetRules', () => {
  it('returns undefined for empty input', () => {
    expect(parseWidgetRules()).toBeUndefined()
    expect(parseWidgetRules('')).toBeUndefined()
    expect(parseWidgetRules('   ')).toBeUndefined()
  })

  it('parses JSON rule arrays', () => {
    expect(
      parseWidgetRules('[{"required":true,"message":"请填写名称"}]')
    ).toEqual([{ required: true, message: '请填写名称' }])
  })

  it('rejects executable expressions', () => {
    expect(parseWidgetRules('window.alert(1)')).toBeUndefined()
    expect(parseWidgetRules('(() => true)()')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
npm run test -- tests/unit/form-rules.test.ts
```

Expected:

```text
FAIL because rules.ts does not exist
```

- [ ] **Step 3: Implement safe parser**

Create `src/components/s-form/renderer/rules.ts`:

```ts
import type { FieldRule } from '@arco-design/web-vue'

const isPlainRule = (value: unknown): value is FieldRule => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const rule = value as Record<string, unknown>
  const allowedKeys = new Set([
    'required',
    'message',
    'type',
    'length',
    'maxLength',
    'minLength',
    'match',
    'uppercase',
    'lowercase',
    'positive',
    'negative',
    'true',
    'false',
    'number',
    'email',
    'url',
  ])

  return Object.keys(rule).every((key) => allowedKeys.has(key))
}

export const parseWidgetRules = (rules?: string): FieldRule[] | undefined => {
  if (!rules || rules.trim() === '') return undefined

  try {
    const parsed = JSON.parse(rules)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const safeRules = list.filter(isPlainRule)

    return safeRules.length > 0 ? safeRules : undefined
  } catch {
    return undefined
  }
}
```

- [ ] **Step 4: Use parser in renderer**

Modify `src/components/s-form/renderer/form-widget-renderer.vue` imports:

```ts
import { parseWidgetRules } from './rules'
```

Replace `computedRules` with:

```ts
const computedRules = (rules?: string) => parseWidgetRules(rules)
```

Remove the old `eval` block completely.

- [ ] **Step 5: Run search to verify `eval` is removed**

Run:

```bash
rg -n "eval\\(" src
```

Expected:

```text
No matches
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm run test -- tests/unit/form-rules.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/unit/form-rules.test.ts
vue-tsc exits 0
```

- [ ] **Step 7: Commit**

```bash
git add src/components/s-form/renderer/rules.ts src/components/s-form/renderer/form-widget-renderer.vue tests/unit/form-rules.test.ts
git commit -m "fix: parse form rules safely"
```

---

### Task 6: Align Environment Variables and Axios Base URL

**Files:**
- Modify: `.env.development`
- Modify: `.env.production`
- Modify: `config/index.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Normalize env files**

Modify `.env.development`:

```dotenv
# 开发环境配置
VITE_APP_ENV=development

# 应用部署基础路径
VITE_BASE_URL=/

# API 代理前缀
VITE_API_BASE_URL=/api

# 开发代理目标
VITE_API_PROXY_TARGET=http://127.0.0.1:10888

# 网页标题
VITE_APP_TITLE=AF-Ideal-Admin
```

Modify `.env.production`:

```dotenv
# 生产环境配置
VITE_APP_ENV=production

# 应用部署基础路径
VITE_BASE_URL=/

# API 请求前缀
VITE_API_BASE_URL=/api

# 生产构建不使用开发代理，保留该变量便于预览环境覆盖
VITE_API_PROXY_TARGET=http://127.0.0.1:10888

# 网页标题
VITE_APP_TITLE=AF-Ideal-Admin
```

- [ ] **Step 2: Use API base URL in config**

Modify `config/index.ts`:

```ts
export const requestBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
```

- [ ] **Step 3: Use env in Vite proxy**

Modify `vite.config.ts`:

```ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.VITE_API_BASE_URL || '/api'
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:10888'

  return {
    plugins: [
      vue(),
      vueJsx(),
      eslint({
        cache: false,
        include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue'],
        exclude: ['node_modules'],
      }),
    ],
    build: {
      rollupOptions: {
        external: '@antv/x6-plugin-dnd',
      },
    },
    resolve: {
      alias: [
        {
          find: 'vue',
          replacement: 'vue/dist/vue.esm-bundler.js',
        },
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
        },
        {
          find: '@config',
          replacement: path.resolve(__dirname, './config/index.ts'),
        },
      ],
      extensions: ['.ts', '.js'],
    },
    server: {
      proxy: {
        [apiBaseUrl]: {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
      cors: true,
    },
  }
})
```

- [ ] **Step 4: Verify env references**

Run:

```bash
rg -n "VITE_BOOT_URL|import\\.meta\\.env\\.BASE_URL|localhost:8080" . -g "!package-lock.json"
```

Expected:

```text
No matches
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
vue-tsc exits 0
```

- [ ] **Step 6: Commit**

```bash
git add .env.development .env.production config/index.ts vite.config.ts
git commit -m "chore: align api environment config"
```

---

### Task 7: Add CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright install script**

Modify `package.json` scripts:

```json
{
  "scripts": {
    "playwright:install": "playwright install --with-deps chromium"
  }
}
```

Keep all scripts already added in Task 1.

- [ ] **Step 2: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches:
      - framework
      - main
      - master
  pull_request:
    branches:
      - framework
      - main
      - master

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint:check

      - name: Typecheck
        run: npm run typecheck

      - name: Unit tests
        run: npm run test

      - name: Install Playwright browsers
        run: npm run playwright:install

      - name: Build
        run: npm run build:prd

      - name: E2E smoke tests
        run: npm run test:e2e
```

- [ ] **Step 3: Verify CI command sequence locally**

Run:

```bash
npm ci
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

Expected:

```text
All commands exit 0 before pushing workflow
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .github/workflows/ci.yml
git commit -m "ci: add project verification workflow"
```

---

### Task 8: Add E2E Login and Permission Smoke Tests

**Files:**
- Create: `tests/e2e/auth-permission.spec.ts`

- [ ] **Step 1: Create smoke tests**

Create `tests/e2e/auth-permission.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('admin can log in and open workplace', async ({ page }) => {
  await page.goto('/login')

  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/dashboard\/workplace/)
  await expect(page.getByText('工作台')).toBeVisible()
})

test('user can access user-only permission page', async ({ page }) => {
  await page.goto('/login')

  await page.getByPlaceholder('用户名').fill('user')
  await page.getByPlaceholder('密码').fill('user')
  await page.getByRole('button', { name: '登录' }).click()

  await page.goto('/permissions/front/page')

  await expect(page).not.toHaveURL(/not-allowed/)
})

test('user is blocked from admin-only routes when roles require admin', async ({
  page,
}) => {
  await page.goto('/login')

  await page.getByPlaceholder('用户名').fill('user')
  await page.getByPlaceholder('密码').fill('user')
  await page.getByRole('button', { name: '登录' }).click()

  await page.goto('/permissions/front/page')

  await expect(page).not.toHaveURL(/login/)
})
```

- [ ] **Step 2: Run E2E tests**

Run:

```bash
npm run test:e2e
```

Expected:

```text
3 passed
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth-permission.spec.ts
git commit -m "test: add auth permission smoke tests"
```

---

### Task 9: Clean Debug Logs and Lint Rules

**Files:**
- Modify: `.eslintrc.js`
- Modify files reported by `rg -n "console\\.|debugger" src config`

- [ ] **Step 1: Fix lint rule direction**

Modify `.eslintrc.js`:

```js
'no-console': process.env.NODE_ENV === 'production' ? 1 : 0,
'no-debugger': process.env.NODE_ENV === 'production' ? 1 : 0,
```

- [ ] **Step 2: Remove noisy logs**

Run:

```bash
rg -n "console\\.|debugger" src config
```

Remove non-essential `console.log` calls from these high-traffic files first:

```text
src/router/guards/permission.ts
src/store/modules/menu.ts
src/components/s-form/renderer/form-widget-renderer.vue
src/views/login/widgets/mobile-form.vue
src/components/s-chart.vue
```

Keep `console.error` only when the error is not otherwise surfaced to the UI.

- [ ] **Step 3: Verify lint**

Run:

```bash
npm run lint:check
```

Expected:

```text
ESLint exits 0
```

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.js src
git commit -m "chore: clean debug logging"
```

---

### Task 10: Document Architecture and Deployment

**Files:**
- Create: `docs/architecture/auth-permission.md`
- Create: `docs/deployment.md`
- Modify: `README.md`

- [ ] **Step 1: Write auth and permission architecture doc**

Create `docs/architecture/auth-permission.md`:

```md
# Auth And Permission Architecture

AF-Ideal-Admin uses token-based login, route metadata, and Pinia state to control access.

## Login Flow

1. The login page submits credentials through `src/api/user.ts`.
2. `src/store/modules/user.ts` saves the returned token with `setToken`.
3. `src/router/guards/login-guard.ts` calls `userStore.info()` when a token exists but user info is not loaded.
4. `src/api/request.ts` attaches the token to `X-Access-Token`.
5. Logout clears token, role, async menu, and route listeners.

## Route Permission Contract

Every protected route should use:

```ts
meta: {
  requireAuth: true,
  roles: ['admin']
}
```

Rules:

- `requireAuth: false` or missing means the route is public.
- Missing `roles` on an authenticated route means every logged-in role can access it.
- `roles: ['*']` means every logged-in role can access it.
- Specific roles such as `roles: ['admin']` restrict access to those roles.

## Menu Source

`config/index.ts` controls menu source through `menuFromServer`.

- `false`: use local routes and `src/router/menu`.
- `true`: call `/api/user/menu` and render server-provided menu entries.

Server-provided menu entries must use the same route names and `meta.roles` contract as local routes.
```

- [ ] **Step 2: Write deployment doc**

Create `docs/deployment.md`:

```md
# Deployment

AF-Ideal-Admin uses Vite and Vue Router history mode.

## Build

```bash
npm ci
npm run build:prd
```

The output directory is `dist`.

## Environment

Production builds read:

- `VITE_APP_ENV`
- `VITE_BASE_URL`
- `VITE_API_BASE_URL`
- `VITE_APP_TITLE`

Use `VITE_BASE_URL` when the app is deployed under a sub-path.

## History Fallback

The router uses `createWebHistory()`. The web server must return `index.html` for unknown front-end routes.

Nginx example:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## API Proxy

The Vite dev proxy is for local development only. In production, configure the gateway or web server to route `VITE_API_BASE_URL` to the backend service.
```

- [ ] **Step 3: Link docs from README**

Add to `README.md`:

```md
## 更多文档

- [鉴权与权限架构](docs/architecture/auth-permission.md)
- [部署说明](docs/deployment.md)
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture/auth-permission.md docs/deployment.md
git commit -m "docs: add architecture and deployment notes"
```

---

### Task 11: Full Verification And Publish

**Files:**
- No file changes expected after verification fixes are complete.

- [ ] **Step 1: Run full local verification**

Run:

```bash
npm ci
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
npm run test:e2e
```

Expected:

```text
All commands exit 0
```

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git status -sb
git log --oneline --max-count=12
```

Expected:

```text
Working tree is clean
Recent commits show Tasks 1 through 10
```

- [ ] **Step 3: Push branch**

Run:

```bash
git push -u origin framework
```

Expected:

```text
framework pushes successfully to origin
```

---

## Self-Review

- Spec coverage: The plan covers security, permissions, environment config, tests, CI, logging cleanup, and documentation.
- Placeholder scan: The plan contains no incomplete sections requiring invention during execution.
- Type consistency: The permission helper names are `canAccessRoute` and `getFirstAccessibleRoute` throughout; auth cleanup is `clearAuth`; the form rule parser is `parseWidgetRules`.
