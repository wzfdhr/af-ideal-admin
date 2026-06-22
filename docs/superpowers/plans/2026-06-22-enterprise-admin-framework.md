# Enterprise Admin Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade AF-Ideal-Admin from a template into an enterprise-ready Vue middle/back-office framework foundation.

**Architecture:** The upgrade is incremental. First stabilize repository and delivery hygiene, then isolate request/auth/permission contracts, then add a shared business component layer and productize the form designer. Existing Vue, Pinia, Router, Arco, Vite, and test patterns should be preserved while a UI adapter boundary is introduced so future `aheart-ui` adoption does not require rewriting business pages.

**Tech Stack:** Vue 3, TypeScript, Vite, Arco Design Vue, Pinia, Vue Router, Axios, Vitest, Playwright, ESLint, npm.

---

## File Structure

Create and modify these areas during the implementation:

- `docs/architecture/enterprise-admin-framework-roadmap.md`: roadmap and design reference.
- `docs/superpowers/plans/2026-06-22-enterprise-admin-framework.md`: this executable plan.
- `.gitignore`: ignore generated archives and local runtime output.
- `src/api/request-client.ts`: isolated request client factory.
- `src/api/request.ts`: compatibility export using the new client.
- `src/services/auth.ts`: token and current-user lifecycle boundary.
- `src/services/access.ts`: shared route, menu, and button permission engine.
- `src/router/routes/typings.d.ts`: route metadata contract.
- `src/router/guards/permission.ts`: use access service and complete server-menu path.
- `src/directives/permission.ts`: use permission codes.
- `src/components/menu/use-menu.ts`: use typed menu filtering without JSON cloning.
- `tests/unit/request-client.test.ts`: request success and error behavior.
- `tests/unit/access.test.ts`: permission-code, role, and menu filtering behavior.
- `tests/unit/server-menu.test.ts`: server menu mode behavior.
- `src/mock/modules/*`: domain-based Mock API modules.
- `src/mock/scenarios/*`: role, tenant, and error-state Mock scenarios.
- `src/components/pro-ui/*`: UI adapter contracts and bridge components for the current Arco implementation and future `aheart-ui` implementation.
- `src/components/pro-ui/adapters/arco.ts`: initial UI adapter backed by Arco Design Vue.
- `docs/architecture/ui-library-strategy.md`: UI foundation strategy, migration rules, and enterprise readiness checklist for `aheart-ui`.
- `docs/architecture/enterprise-admin-capability-map.md`: enterprise capability
  map for workflow, low-code, data screen, reports, and Mock requirements.

## Phase 0: Repository And Delivery Baseline

### Task 1: Synchronize Branch State

**Files:**
- No file edits.

- [ ] **Step 1: Inspect branch state**

Run:

```bash
git status --short --branch
git log --oneline --decorate --graph --all -n 18
```

Expected: local `framework` may show `ahead 1, behind 1` while the tree has no
content diff from `origin/framework`.

- [ ] **Step 2: Verify tree equality before resetting local history**

Run:

```bash
git diff --stat HEAD..origin/framework
git diff --stat origin/framework..HEAD
```

Expected: both commands print no file changes.

- [ ] **Step 3: Align local branch to remote merge commit**

Run only when Step 2 confirms no content diff:

```bash
git reset --hard origin/framework
```

Expected: local `framework` points to the remote merge commit.

- [ ] **Step 4: Verify clean state**

Run:

```bash
git status --short --branch
```

Expected: `## framework...origin/framework` with no changed files.

### Task 2: Remove Generated Archives From Git

**Files:**
- Modify: `.gitignore`
- Delete: `dist.zip`
- Delete: `node_modules.zip`

- [ ] **Step 1: Update `.gitignore`**

Add these lines:

```gitignore
# Build and dependency archives
dist.zip
node_modules.zip
*.tgz

# Local dependency output
node_modules/
dist/
```

- [ ] **Step 2: Remove tracked archives**

Run:

```bash
git rm dist.zip node_modules.zip
```

Expected: both generated archives are staged for deletion.

- [ ] **Step 3: Verify no accidental deletions**

Run:

```bash
git status --short
```

Expected: only `.gitignore`, `dist.zip`, and `node_modules.zip` are changed for
this task.

- [ ] **Step 4: Commit**

Run:

```bash
git add .gitignore
git commit -m "chore: remove generated archives"
```

Expected: one commit containing only repository hygiene changes.

## Phase 1: Request, Auth, And Permission Core

### Task 3: Add Request Client Contract

**Files:**
- Create: `src/api/request-client.ts`
- Modify: `src/api/request.ts`
- Test: `tests/unit/request-client.test.ts`

- [ ] **Step 1: Write failing request client tests**

Create `tests/unit/request-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { createRequestClient } from '@/api/request-client'

vi.mock('axios', () => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }

  return {
    default: {
      create: vi.fn(() => instance),
    },
  }
})

describe('createRequestClient', () => {
  it('creates an isolated axios instance', () => {
    const client = createRequestClient({
      baseURL: '/api',
      timeout: 15000,
      authHeaderName: 'X-Access-Token',
      getToken: () => 'token-123',
    })

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: '/api',
      timeout: 15000,
    })
    expect(client).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/request-client.test.ts
```

Expected: fail because `src/api/request-client.ts` does not exist.

- [ ] **Step 3: Implement request client**

Create `src/api/request-client.ts`:

```ts
import axios from 'axios'
import { Message } from '@arco-design/web-vue'
import type { AxiosError, AxiosInstance, AxiosResponse } from 'axios'

export interface ApiResponse<T = unknown> {
  code: number
  message?: string
  msg?: string
  data: T
  traceId?: string
  errors?: Record<string, string[]>
}

export interface RequestClientOptions {
  baseURL: string
  timeout: number
  authHeaderName: string
  getToken: () => string | null
}

const getErrorMessage = (error: AxiosError) =>
  error.message || 'Request Error'

export const createRequestClient = (
  options: RequestClientOptions
): AxiosInstance => {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout,
  })

  client.interceptors.request.use((config) => {
    const token = options.getToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers[options.authHeaderName] = token
    }
    return config
  })

  client.interceptors.response.use(
    (response: AxiosResponse<ApiResponse>) => {
      const res = response.data
      if (res.code !== 20000) {
        const message = res.message || res.msg || 'Request Error'
        Message.error({ content: message, duration: 5000 })
        return Promise.reject(new Error(message))
      }
      return res as unknown as AxiosResponse
    },
    (error: AxiosError) => {
      Message.error({ content: getErrorMessage(error), duration: 5000 })
      return Promise.reject(error)
    }
  )

  return client
}
```

- [ ] **Step 4: Keep compatibility import**

Modify `src/api/request.ts`:

```ts
import { getToken } from '@/utils/auth'
import { requestBaseUrl } from '@config'
import { createRequestClient } from './request-client'

export const request = createRequestClient({
  baseURL: requestBaseUrl,
  timeout: 15000,
  authHeaderName: 'X-Access-Token',
  getToken,
})

export default request
```

Then migrate API modules from `import axios from 'axios'` to
`import request from '@/api/request'` in later tasks.

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/unit/request-client.test.ts tests/unit/auth.test.ts
```

Expected: request client tests and auth tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/api/request-client.ts src/api/request.ts tests/unit/request-client.test.ts
git commit -m "feat: add isolated request client"
```

### Task 4: Add Access Service

**Files:**
- Create: `src/services/access.ts`
- Modify: `src/hooks/use-permission.ts`
- Modify: `src/router/routes/typings.d.ts`
- Test: `tests/unit/access.test.ts`

- [ ] **Step 1: Write access tests**

Create `tests/unit/access.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canAccessByRequirement } from '@/services/access'

describe('access service', () => {
  const user = {
    roles: ['operator'],
    permissions: ['user:create', 'user:update'],
  }

  it('allows wildcard access', () => {
    expect(canAccessByRequirement({ roles: ['*'] }, user)).toBe(true)
  })

  it('allows any matching permission by default', () => {
    expect(
      canAccessByRequirement({ permissions: ['user:create'] }, user)
    ).toBe(true)
  })

  it('requires all permissions when mode is all', () => {
    expect(
      canAccessByRequirement(
        { permissions: ['user:create', 'user:delete'], mode: 'all' },
        user
      )
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/access.test.ts
```

Expected: fail because `src/services/access.ts` does not exist.

- [ ] **Step 3: Implement access service**

Create `src/services/access.ts`:

```ts
export interface AccessUser {
  roles: string[]
  permissions: string[]
}

export interface AccessRequirement {
  roles?: string[]
  permissions?: string[]
  mode?: 'all' | 'any'
}

const hasAny = (required: string[], owned: string[]) =>
  required.includes('*') || required.some((item) => owned.includes(item))

const hasAll = (required: string[], owned: string[]) =>
  required.includes('*') || required.every((item) => owned.includes(item))

export const canAccessByRequirement = (
  requirement: AccessRequirement | undefined,
  user: AccessUser
) => {
  if (!requirement) return true

  const mode = requirement.mode || 'any'
  const roleAllowed = requirement.roles?.length
    ? mode === 'all'
      ? hasAll(requirement.roles, user.roles)
      : hasAny(requirement.roles, user.roles)
    : true
  const permissionAllowed = requirement.permissions?.length
    ? mode === 'all'
      ? hasAll(requirement.permissions, user.permissions)
      : hasAny(requirement.permissions, user.permissions)
    : true

  return roleAllowed && permissionAllowed
}
```

- [ ] **Step 4: Extend route metadata**

Modify `src/router/routes/typings.d.ts`:

```ts
import type { AccessRequirement } from '@/services/access'

declare module 'vue-router' {
  interface RouteMeta {
    roles?: string[]
    access?: AccessRequirement
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

- [ ] **Step 5: Bridge existing permission hook**

Modify `src/hooks/use-permission.ts` so existing `meta.roles` still works and
new `meta.access` can be adopted gradually:

```ts
const toAccessUser = (role: string) => ({
  roles: role ? [role] : [],
  permissions: [],
})
```

Use `canAccessByRequirement(route.meta?.access, toAccessUser(role))` before
falling back to the current `roles` behavior.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -- tests/unit/access.test.ts tests/unit/permission.test.ts
```

Expected: all access and existing permission tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/services/access.ts src/hooks/use-permission.ts src/router/routes/typings.d.ts tests/unit/access.test.ts
git commit -m "feat: add access service"
```

### Task 5: Complete Server Menu Filtering

**Files:**
- Modify: `src/router/guards/permission.ts`
- Modify: `src/components/menu/use-menu.ts`
- Test: `tests/unit/server-menu.test.ts`

- [ ] **Step 1: Write server menu tests**

Create `tests/unit/server-menu.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { flattenMenuNames } from '@/services/access'

describe('server menu helpers', () => {
  it('flattens nested menu names', () => {
    expect(
      flattenMenuNames([
        {
          name: 'system',
          children: [{ name: 'userSystem' }, { name: 'roleSystem' }],
        },
      ])
    ).toEqual(new Set(['system', 'userSystem', 'roleSystem']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/server-menu.test.ts
```

Expected: fail because `flattenMenuNames` is not exported.

- [ ] **Step 3: Add helper to access service**

Append to `src/services/access.ts`:

```ts
export interface MenuLikeNode {
  name?: string | symbol | null
  children?: MenuLikeNode[]
}

export const flattenMenuNames = (menus: MenuLikeNode[]) => {
  const names = new Set<string | symbol>()
  const queue = [...menus]

  while (queue.length) {
    const menu = queue.shift()
    if (!menu) continue
    if (menu.name) names.add(menu.name)
    if (menu.children?.length) queue.push(...menu.children)
  }

  return names
}
```

- [ ] **Step 4: Use helper in permission guard**

Modify `src/router/guards/permission.ts` to replace the manual while-loop with
`flattenMenuNames([...menuStore.asyncMenu, ...whiteList])`.

Expected behavior:

```ts
const serverMenuNames = flattenMenuNames([...menuStore.asyncMenu, ...whiteList])
const existsInServerMenu = serverMenuNames.has(to.name || '')
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/unit/server-menu.test.ts tests/unit/permission.test.ts
```

Expected: server menu and permission tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/services/access.ts src/router/guards/permission.ts tests/unit/server-menu.test.ts
git commit -m "fix: complete server menu permission filtering"
```

### Task 5.5: Build Mock Virtual Data Foundation

**Files:**
- Create: `src/mock/response.ts`
- Create: `src/mock/seed.ts`
- Create: `src/mock/modules/auth.ts`
- Create: `src/mock/modules/permission.ts`
- Create: `src/mock/modules/menu.ts`
- Create: `src/mock/modules/dictionary.ts`
- Create: `src/mock/scenarios/admin.ts`
- Create: `src/mock/scenarios/operator.ts`
- Create: `src/mock/scenarios/error-states.ts`
- Modify: `src/mock/index.ts`
- Test: `tests/unit/mock-response.test.ts`

- [ ] **Step 1: Write Mock response tests**

Create `tests/unit/mock-response.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mockOk, mockFail } from '@/mock/response'

describe('mock response helpers', () => {
  it('wraps successful data with the API contract', () => {
    expect(mockOk({ id: 1 })).toEqual({
      code: 20000,
      msg: 'success',
      data: { id: 1 },
    })
  })

  it('wraps business failures with code and message', () => {
    expect(mockFail('Forbidden', 50003)).toEqual({
      code: 50003,
      msg: 'Forbidden',
      data: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/mock-response.test.ts
```

Expected: fail because `src/mock/response.ts` does not exist.

- [ ] **Step 3: Implement response helpers**

Create `src/mock/response.ts`:

```ts
export const mockOk = <T>(data: T, msg = 'success') => ({
  code: 20000,
  msg,
  data,
})

export const mockFail = (msg: string, code = 50000, data = null) => ({
  code,
  msg,
  data,
})
```

- [ ] **Step 4: Define Mock scenario seed data**

Create `src/mock/seed.ts`:

```ts
export const mockUsers = [
  {
    id: '1',
    username: 'admin',
    password: 'admin',
    role: 'admin',
    permissions: ['*'],
    tenantId: 'tenant-a',
  },
  {
    id: '2',
    username: 'operator',
    password: 'operator',
    role: 'operator',
    permissions: ['user:list', 'workflow:todo', 'report:view'],
    tenantId: 'tenant-a',
  },
]
```

- [ ] **Step 5: Split domain Mock modules**

Move existing user/menu/dictionary Mock handlers into `src/mock/modules/*`.
Each module exports a setup function:

```ts
export const setupAuthMock = () => {
  // Mock.mock(...) handlers live here.
}
```

- [ ] **Step 6: Register modules in `src/mock/index.ts`**

`src/mock/index.ts` should import and call each setup function.

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test -- tests/unit/mock-response.test.ts tests/unit/auth.test.ts
```

Expected: Mock helper tests and auth tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/mock tests/unit/mock-response.test.ts
git commit -m "feat: add mock virtual data foundation"
```

## Phase 2: Shared Business Component Layer

### Task 6A: Establish Replaceable UI Foundation Boundary

**Files:**
- Create: `src/components/pro-ui/types.ts`
- Create: `src/components/pro-ui/adapters/arco.ts`
- Create: `src/components/pro-ui/index.ts`
- Create: `docs/architecture/ui-library-strategy.md`
- Test: `tests/unit/pro-ui-adapter.test.ts`

- [ ] **Step 1: Define the UI foundation strategy**

Create `docs/architecture/ui-library-strategy.md` with these decisions:

- AF-Ideal-Admin continues to use Arco Design Vue as the stable delivery UI base.
- New enterprise pages should depend on `ProTable`, `ProForm`, `CrudPage`,
  `PermissionButton`, `DictSelect`, and other internal business components
  instead of directly depending on Arco component APIs.
- `aheart-ui` is developed in parallel as the future design system candidate.
- Business capability development must not wait for `aheart-ui`; new enterprise
  pages must be delivered through Pro components and the UI adapter boundary.
- Replacing Arco with `aheart-ui` is allowed only after the enterprise component
  checklist passes for table, form, select, date/time, upload, tree, cascader,
  modal, drawer, message, notification, theme, accessibility, documentation,
  unit tests, visual regression, and e2e smoke tests.
- Business modules must use Mock-backed examples when validating Pro components,
  so the adapter boundary is tested through real list, form, permission, and
  error-state interactions.
- Each `aheart-ui` component added to the candidate adapter must pass a
  Mock-backed compatibility example before it can replace the matching Arco
  component in core business modules.
- Before switching the active adapter, complete one dual-adapter migration spike
  on a real business page covering list, form, permission button, modal,
  error-state, and empty-state behavior.

- [ ] **Step 2: Add UI adapter contract**

Create `src/components/pro-ui/types.ts`:

```ts
import type { Component } from 'vue'

export interface AdminUiAdapter {
  name: 'arco' | 'aheart'
  Button: Component
  Table: Component
  Form: Component
  FormItem: Component
  Input: Component
  Select: Component
  Modal: Component
  Drawer: Component
  Message: {
    success: (content: string) => void
    error: (content: string) => void
    warning: (content: string) => void
  }
}
```

- [ ] **Step 3: Add Arco adapter**

Create `src/components/pro-ui/adapters/arco.ts`:

```ts
import {
  Button,
  Drawer,
  Form,
  Input,
  Message,
  Modal,
  Select,
  Table,
} from '@arco-design/web-vue'
import type { AdminUiAdapter } from '../types'

export const arcoAdapter: AdminUiAdapter = {
  name: 'arco',
  Button,
  Table,
  Form,
  FormItem: Form.Item,
  Input,
  Select,
  Modal,
  Drawer,
  Message: {
    success: (content) => Message.success(content),
    error: (content) => Message.error(content),
    warning: (content) => Message.warning(content),
  },
}
```

- [ ] **Step 4: Export the active adapter**

Create `src/components/pro-ui/index.ts`:

```ts
import { arcoAdapter } from './adapters/arco'

export const adminUi = arcoAdapter
export type { AdminUiAdapter } from './types'
```

- [ ] **Step 5: Add adapter tests**

Create `tests/unit/pro-ui-adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adminUi } from '@/components/pro-ui'

describe('adminUi adapter', () => {
  it('exposes the current Arco implementation through a stable boundary', () => {
    expect(adminUi.name).toBe('arco')
    expect(adminUi.Button).toBeTruthy()
    expect(adminUi.Table).toBeTruthy()
    expect(adminUi.Form).toBeTruthy()
    expect(adminUi.Message.success).toEqual(expect.any(Function))
  })
})
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test -- tests/unit/pro-ui-adapter.test.ts
npm run typecheck
```

Expected: the adapter contract is typed and testable without importing Arco
directly from business modules.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/pro-ui tests/unit/pro-ui-adapter.test.ts docs/architecture/ui-library-strategy.md
git commit -m "feat: add replaceable ui foundation boundary"
```

### Task 6B: Add aheart-ui Parallel Incubation And Switch Governance

**Files:**
- Modify: `docs/quality/enterprise-admin-task-checklist.md`
- Modify: `docs/architecture/ui-library-strategy.md`
- Future create: `src/components/pro-ui/adapters/aheart.ts`
- Future create: `tests/unit/pro-ui-adapter-parity.test.ts`
- Future create: `src/views/examples/ui-adapter-lab/index.vue`

- [ ] **Step 1: Add the task to the enterprise checklist**

Add `T-200A 建立 aheart-ui 同步孵化与切换治理计划` after `T-200` in
`docs/quality/enterprise-admin-task-checklist.md` with these decisions:

- The admin framework and `aheart-ui` move in parallel.
- The admin framework keeps Arco as the stable active adapter.
- Business pages continue to ship through Pro components and Mock-backed APIs.
- `aheart-ui` becomes a candidate adapter only component by component.
- Switching is allowed only after maturity matrix and adapter parity checks pass.

- [ ] **Step 2: Extend the UI library strategy**

Add `Parallel Development Cadence` and `Candidate Adapter Gates` sections to
`docs/architecture/ui-library-strategy.md`:

```md
## Parallel Development Cadence

The admin framework and `aheart-ui` should move in parallel. The admin product
continues shipping enterprise features through Arco, Pro components, and Mock
contracts. `aheart-ui` matures beside it as a candidate adapter, not as a blocker
for workflow, low-code, dashboard, report, audit, tenant, or system modules.

The synchronization rule is:

1. Build business capabilities in AF-Ideal-Admin through Pro components.
2. Extract repeated UI needs into adapter contracts and Pro component APIs.
3. Implement matching `aheart-ui` components against those contracts.
4. Validate each candidate component through Mock-backed business examples.
5. Replace by component or by page only after parity checks pass.
```

- [ ] **Step 3: Add candidate adapter parity test when aheart-ui is installable**

Create `tests/unit/pro-ui-adapter-parity.test.ts` after `aheart-ui` can be
installed by workspace alias or package dependency:

```ts
import { describe, expect, it } from 'vitest'
import type { AdminUiAdapter } from '@/components/pro-ui'
import { arcoAdapter } from '@/components/pro-ui/adapters/arco'
import { aheartAdapter } from '@/components/pro-ui/adapters/aheart'

const requiredKeys: Array<keyof AdminUiAdapter> = [
  'Button',
  'Table',
  'Form',
  'FormItem',
  'Input',
  'Select',
  'Modal',
  'Drawer',
  'Message',
]

describe('admin ui adapter parity', () => {
  it('keeps aheart adapter compatible with the active Arco adapter contract', () => {
    requiredKeys.forEach((key) => {
      expect(aheartAdapter[key]).toBeTruthy()
      expect(arcoAdapter[key]).toBeTruthy()
    })

    expect(aheartAdapter.Message.success).toEqual(expect.any(Function))
    expect(aheartAdapter.Message.error).toEqual(expect.any(Function))
    expect(aheartAdapter.Message.warning).toEqual(expect.any(Function))
  })
})
```

- [ ] **Step 4: Add a Mock-backed UI adapter lab**

Create `src/views/examples/ui-adapter-lab/index.vue` after the first candidate
adapter exists. The page must use existing Mock APIs and Pro components to cover
list query, pagination, create/edit form submit, permission button, modal,
drawer, empty state, and request error state. The page must not be a static
component gallery.

- [ ] **Step 5: Run one real page migration rehearsal**

Pick one of these pages for the first rehearsal:

- `src/views/system/dictSystem/index.vue`
- `src/views/system/userSystem/index.vue`
- `src/views/system/roleSystem/index.vue`

Run the page through Arco adapter and `aheart-ui` candidate adapter, then record
in `docs/architecture/ui-library-strategy.md`:

- component parity gaps
- visual or interaction differences
- Mock API scenarios used
- rollback steps
- decision on whether the component can graduate from candidate to active use

- [ ] **Step 6: Run verification**

Run:

```bash
npm run test -- tests/unit/pro-ui-adapter.test.ts
npm run typecheck
```

Expected: the current Arco adapter remains stable while the `aheart-ui`
incubation task is tracked as a future gated migration path.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/quality/enterprise-admin-task-checklist.md docs/architecture/ui-library-strategy.md docs/superpowers/plans/2026-06-22-enterprise-admin-framework.md
git commit -m "docs: add aheart ui incubation plan"
```

### Task 6: Design ProTable Contract

**Files:**
- Create: `src/components/pro-table/types.ts`
- Create: `src/components/pro-table/index.vue`
- Test: `tests/unit/pro-table.test.ts`

- [ ] **Step 1: Write component contract**

Create `src/components/pro-table/types.ts`:

```ts
import type { TableColumnData } from '@arco-design/web-vue'

export interface ProTableFetchParams {
  current: number
  pageSize: number
  filters: Record<string, unknown>
}

export interface ProTableFetchResult<T> {
  list: T[]
  total: number
}

export interface ProTableProps<T = unknown> {
  columns: TableColumnData[]
  fetchData: (params: ProTableFetchParams) => Promise<ProTableFetchResult<T>>
  rowKey: string
}
```

- [ ] **Step 2: Add first render test**

Create `tests/unit/pro-table.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ProTable from '@/components/pro-table/index.vue'

describe('ProTable', () => {
  it('calls fetchData on mount', async () => {
    const fetchData = vi.fn().mockResolvedValue({ list: [], total: 0 })

    mount(ProTable, {
      props: {
        rowKey: 'id',
        columns: [],
        fetchData,
      },
    })

    await Promise.resolve()
    expect(fetchData).toHaveBeenCalledWith({
      current: 1,
      pageSize: 10,
      filters: {},
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/pro-table.test.ts
```

Expected: fail because `ProTable` does not exist.

- [ ] **Step 4: Implement minimal ProTable**

Create `src/components/pro-table/index.vue`:

```vue
<template>
  <a-table
    :columns="columns"
    :data="data"
    :loading="loading"
    :pagination="pagination"
    :row-key="rowKey"
  />
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { TableColumnData } from '@arco-design/web-vue'
import type { ProTableFetchParams, ProTableFetchResult } from './types'

const props = defineProps<{
  columns: TableColumnData[]
  rowKey: string
  fetchData: (
    params: ProTableFetchParams
  ) => Promise<ProTableFetchResult<Record<string, unknown>>>
}>()

const loading = ref(false)
const data = ref<Record<string, unknown>[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const load = async () => {
  loading.value = true
  try {
    const result = await props.fetchData({
      current: pagination.current,
      pageSize: pagination.pageSize,
      filters: {},
    })
    data.value = result.list
    pagination.total = result.total
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
```

- [ ] **Step 5: Run test**

Run:

```bash
npm run test -- tests/unit/pro-table.test.ts
```

Expected: ProTable test passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/pro-table tests/unit/pro-table.test.ts
git commit -m "feat: add pro table foundation"
```

## Phase 3: Form Designer Productization

### Task 7: Add Versioned Form Schema

**Files:**
- Create: `src/components/form-designer/schema/types.ts`
- Create: `src/components/form-designer/schema/migrate.ts`
- Test: `tests/unit/form-schema.test.ts`

- [ ] **Step 1: Write schema migration test**

Create `tests/unit/form-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { migrateFormSchema } from '@/components/form-designer/schema/migrate'

describe('form schema migration', () => {
  it('adds the current schema version to legacy schemas', () => {
    expect(
      migrateFormSchema({
        widgetsConfig: [],
        config: { layout: 'horizontal' },
      }).version
    ).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- tests/unit/form-schema.test.ts
```

Expected: fail because schema migration module does not exist.

- [ ] **Step 3: Add schema types**

Create `src/components/form-designer/schema/types.ts`:

```ts
import type { AST } from '../types'

export const CURRENT_FORM_SCHEMA_VERSION = 1

export interface VersionedFormSchema extends AST {
  version: number
}
```

- [ ] **Step 4: Add migration function**

Create `src/components/form-designer/schema/migrate.ts`:

```ts
import {
  CURRENT_FORM_SCHEMA_VERSION,
  type VersionedFormSchema,
} from './types'

export const migrateFormSchema = (
  schema: Partial<VersionedFormSchema>
): VersionedFormSchema =>
  ({
    ...schema,
    version: schema.version || CURRENT_FORM_SCHEMA_VERSION,
    widgetsConfig: schema.widgetsConfig || [],
    config: schema.config || {
      size: 'medium',
      layout: 'horizontal',
      labelAlign: 'right',
    },
  } as VersionedFormSchema)
```

- [ ] **Step 5: Run test**

Run:

```bash
npm run test -- tests/unit/form-schema.test.ts tests/unit/form-rules.test.ts
```

Expected: schema and form rule tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/form-designer/schema tests/unit/form-schema.test.ts
git commit -m "feat: add versioned form schema"
```

### Task 7.5: Add Form Designer Mock Interactions

**Files:**
- Create: `src/mock/modules/form-designer.ts`
- Modify: `src/mock/index.ts`
- Test: `tests/unit/form-schema.test.ts`

- [ ] **Step 1: Add Mock endpoints**

Create `src/mock/modules/form-designer.ts` with handlers for:

```text
GET /api/form-schemas
GET /api/form-schemas/:id
POST /api/form-schemas
PUT /api/form-schemas/:id
POST /api/form-schemas/:id/publish
POST /api/form-schemas/:id/rollback
POST /api/form-runtime/:id/submit
GET /api/form-options/:sourceKey
```

- [ ] **Step 2: Add success and error scenarios**

Handlers must simulate:

```text
success
empty schema list
schema not found
unauthorized
forbidden publish
remote option timeout
invalid option response
```

- [ ] **Step 3: Register module**

Import and call `setupFormDesignerMock()` from `src/mock/index.ts`.

- [ ] **Step 4: Verify local interaction**

Run:

```bash
npm run dev
```

Expected: form designer can load, save, preview, publish, and submit through
Mock endpoints without backend services.

## Phase 3.5: Workflow, Low-Code, Data Screen, And Reports

### Task 7.6: Add Workflow Designer MVP Plan

**Files:**
- Create: `docs/superpowers/plans/2026-06-22-workflow-designer-mvp.md`
- Create: `src/mock/modules/workflow.ts`
- Modify: `src/mock/index.ts`

- [ ] **Step 1: Define workflow scope**

The MVP must include start, approval, copy, condition, parallel, and end nodes,
using AntV X6 as the canvas engine.

- [ ] **Step 2: Define Mock endpoints**

Workflow Mock must include:

```text
GET /api/workflows
GET /api/workflows/:id
POST /api/workflows
PUT /api/workflows/:id
POST /api/workflows/:id/publish
POST /api/workflow-instances
GET /api/workflow-todos
GET /api/workflow-done
POST /api/workflow-tasks/:id/approve
POST /api/workflow-tasks/:id/reject
POST /api/workflow-tasks/:id/transfer
POST /api/workflow-instances/:id/withdraw
```

- [ ] **Step 3: Add acceptance criteria to the workflow plan**

The workflow plan must require Mock-driven process definition, publish, start,
approve, reject, transfer, withdraw, and approval history demos.

### Task 7.7: Add Low-Code Page Builder MVP Plan

**Files:**
- Create: `docs/superpowers/plans/2026-06-22-low-code-page-builder-mvp.md`
- Create: `src/mock/modules/low-code.ts`
- Modify: `src/mock/index.ts`

- [ ] **Step 1: Define low-code scope**

The MVP must include page schema, material registry, data-source binding,
preview, save, publish, rollback, and permission control.

- [ ] **Step 2: Define Mock endpoints**

Low-code Mock must include:

```text
GET /api/low-code/pages
GET /api/low-code/pages/:id
POST /api/low-code/pages
PUT /api/low-code/pages/:id
POST /api/low-code/pages/:id/publish
POST /api/low-code/pages/:id/rollback
POST /api/low-code/data-source/preview
```

- [ ] **Step 3: Add acceptance criteria to the low-code plan**

The low-code plan must require at least one Mock-backed query table page, one
Mock-backed form page, and permission-controlled page actions.

### Task 7.8: Add Data Screen And Report MVP Plan

**Files:**
- Create: `docs/superpowers/plans/2026-06-22-data-screen-report-mvp.md`
- Create: `src/mock/modules/dashboard.ts`
- Create: `src/mock/modules/report.ts`
- Modify: `src/mock/index.ts`

- [ ] **Step 1: Define data screen scope**

The MVP must include a 1920x1080 large-screen canvas, chart materials, Mock
realtime data, full-screen preview, and theme switching.

- [ ] **Step 2: Define report center scope**

The MVP must include report list, report detail, query filters, chart/detail
rendering, and export task simulation.

- [ ] **Step 3: Define Mock endpoints**

Data screen and report Mock must include:

```text
GET /api/data-screens
GET /api/data-screens/:id
GET /api/data-screens/:id/realtime
GET /api/reports
GET /api/reports/:id
GET /api/reports/:id/data
POST /api/reports/:id/export
GET /api/report-export-tasks/:id
```

- [ ] **Step 4: Add acceptance criteria**

The plan must require line, bar, pie, ranking, KPI card, scrolling table,
empty-data, alarm, and export-failure Mock scenarios.

## Phase 4: Documentation And Adoption

### Task 8: Add Developer Guides

**Files:**
- Create: `docs/development/create-crud-page.md`
- Create: `docs/development/backend-integration.md`
- Create: `docs/development/permission-integration.md`

- [ ] **Step 1: Create CRUD page guide**

Create `docs/development/create-crud-page.md` with:

```md
# Create A CRUD Page

1. Add typed API functions under `src/api`.
2. Add route metadata under `src/router/routes/modules`.
3. Add permission codes to the backend permission resource list.
4. Build the page with `ProTable` and `ProForm`.
5. Add unit tests for query parameter mapping and permission behavior.
```

- [ ] **Step 2: Create backend integration guide**

Create `docs/development/backend-integration.md` with:

```md
# Backend Integration

The backend must provide login, current user, logout, menu, dictionary, and
business APIs using the response contract documented in
`docs/architecture/enterprise-admin-framework-roadmap.md`.
```

- [ ] **Step 3: Create permission integration guide**

Create `docs/development/permission-integration.md` with:

```md
# Permission Integration

Use permission codes such as `user:create`, `user:update`, and `role:assign`.
Routes, menus, and buttons must use the same access engine so the UI does not
show actions the user cannot perform.
```

- [ ] **Step 4: Verify docs are discoverable**

Run:

```bash
find docs -maxdepth 3 -type f | sort
```

Expected: the three new development guides are listed.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/development
git commit -m "docs: add framework development guides"
```

### Task 9: Add Enterprise Capability Map

**Files:**
- Create: `docs/architecture/enterprise-admin-capability-map.md`
- Modify: `docs/architecture/enterprise-admin-framework-roadmap.md`
- Modify: `docs/quality/enterprise-admin-task-checklist.md`

- [ ] **Step 1: Document current and missing capabilities**

The capability map must cover permissions, form designer, Mock virtual data,
workflow designer, low-code page builder, data screen, report center, messages,
audit logs, multi-tenant organization, file resources, theme/i18n, and plugin
extension.

- [ ] **Step 2: Add Mock requirement to every capability**

Every capability section must describe the Mock endpoints or Mock scenarios
needed for backend-independent demos.

- [ ] **Step 3: Update quality checklist**

The checklist must include Mock gates and acceptance standards for workflow,
low-code, data screen, and report center MVPs.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/architecture docs/quality docs/superpowers/plans
git commit -m "docs: add enterprise capability map"
```

## Verification Checklist

Run these commands before calling the first upgrade slice complete:

```bash
npm ci
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

Expected result:

- Lint exits 0.
- Typecheck exits 0.
- Unit tests exit 0.
- Production build exits 0.

## Self-Review Notes

- Roadmap coverage: repository hygiene, request/auth/permission, server menu,
  Mock virtual data, Pro components, form designer schema, workflow designer,
  low-code page builder, data screen, report center, and documentation are
  represented.
- Completeness scan: no task uses unresolved draft markers or vague
  implementation gaps.
- Type consistency: `AccessRequirement`, `AccessUser`, `ApiResponse`, and
  `RequestClientOptions` are introduced before they are referenced.
