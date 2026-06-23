# 新增 CRUD 页面指南

本指南用于新增企业中后台标准资源页面。目标是在无后端环境下也能通过 Mock 完成查询、新增、编辑、删除、权限控制和测试闭环。

## 交付清单

一个标准 CRUD 模块至少包含：

- `src/api/<domain>.ts`：类型、查询、新增、编辑、删除、详情接口。
- `src/mock/modules/<domain>.ts`：同路径、同响应结构的 Mock 数据。
- `src/constants/<domain>.ts`：权限码常量。
- `src/router/routes/modules/<domain>.ts`：本地路由。
- `src/mock/seed.ts`：服务端菜单 Mock 入口。
- `src/views/<domain>/index.vue` 或 `src/components/<domain>/index.vue`：页面实现。
- `tests/unit/<domain>-api.test.ts`、`<domain>-mock.test.ts`、`<domain>-route.test.ts`、`<domain>-page.test.ts`。

## API 设计

API 模块使用资源路径，不重复 `/api` 前缀。分页查询保持统一结构：

```ts
export interface DomainQuery {
  current: number
  pageSize: number
  keyword?: string
}

export interface DomainPageResult {
  list: DomainRecord[]
  total: number
}
```

推荐函数命名：

- `fetchXxxList(query)`
- `getXxxDetail(id)`
- `createXxx(payload)`
- `updateXxx(id, payload)`
- `deleteXxx(id)`

现有 `src/api/system/user.ts` 是标准 CRUD API 契约样例，新模块可以按同形结构替换领域名和字段：

```ts
export interface SystemUserQuery {
  current: number
  pageSize: number
  username?: string
  phone?: string
  status?: SystemUserStatus
}

export interface SystemUserPayload {
  username: string
  name: string
  phone: string
  email: string
  dept: string
  status: SystemUserStatus
  role: string
}

export interface SystemUserPageResult {
  list: SystemUserRecord[]
  total: number
}

export const fetchSystemUsers = async (params: SystemUserQuery) => {
  const response = await request.get<SystemUserPageResult>('/system/users', {
    params,
  })
  return response.data
}

export const getSystemUserDetail = async (id: string) => {
  const response = await request.get<SystemUserRecord>(`/system/users/${id}`)
  return response.data
}

export const createSystemUser = async (payload: SystemUserPayload) => {
  const response = await request.post<SystemUserRecord>(
    '/system/users',
    payload
  )
  return response.data
}

export const updateSystemUser = async (
  id: string,
  payload: SystemUserPayload
) => {
  const response = await request.put<SystemUserRecord>(
    `/system/users/${id}`,
    payload
  )
  return response.data
}

export const deleteSystemUser = async (id: string) => {
  const response = await request.delete<null>(`/system/users/${id}`)
  return response.data
}
```

## Mock 要求

Mock 不是静态展示数据，必须支持页面核心交互：

- 查询和分页。
- 新增、编辑、删除。
- 错误态或空状态。
- 权限按钮展示差异。
- 与 API 类型一致的响应结构。

响应结构保持：

```ts
{
  code: 20000,
  msg: 'success',
  data: {
    list: [],
    total: 0
  }
}
```

## 页面实现

标准页面优先使用内部业务组件：

- `ProTable`：分页、查询结果、loading、空状态。
- `ProForm`：查询表单和编辑表单。
- `PermissionButton`：新增、编辑、删除、导入、导出等操作。
- `DictSelect`、`DictRadio`：状态、类型、枚举值。

页面必须保留可恢复状态：

- 请求失败时不静默吞掉错误。
- 删除等危险操作必须二次确认。
- 表单保存失败后保留用户已输入内容。
- loading、空数据、无权限、接口错误要有明确 UI 状态。

## 路由和菜单

新增页面需要同时维护：

- 本地路由：`src/router/routes/modules/<domain>.ts`。
- 菜单语言包：`src/router/locale/zh-CN.ts` 和 `src/router/locale/en-US.ts`。
- 服务端菜单 Mock：`src/mock/seed.ts`。

服务端菜单中的 `name`、`path`、`meta.locale` 应与本地路由保持一致。

## 测试要求

按 TDD 新增测试，至少覆盖：

- API 路径、参数和 payload。
- Mock 查询、新增、编辑、删除。
- 路由和服务端菜单一致。
- 页面初始加载和查询提交。
- `PermissionButton` 对权限码的展示控制。
- `detail modal`：详情按钮必须通过详情接口取数后打开详情弹窗。
- `editor modal`：新增/编辑按钮必须进入编辑弹窗，编辑时必须先拉取详情。
- `failure message`：列表、详情、保存、删除失败必须有明确错误提示。

提交前运行：

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

## 新成员执行检查表

Step 1: API 契约

- 在 `src/api/<domain>.ts` 定义 `Record`、`Query`、`Payload` 和 `PageResult` 类型。
- 查询函数返回 `{ list, total }`，详情、新增、编辑、删除函数使用资源路径。
- API 函数命名与当前系统 CRUD 保持同形，例如 `fetchSystemUsers`、`getSystemUserDetail`、`createSystemUser`、`updateSystemUser`、`deleteSystemUser`。
- 补 `tests/unit/<domain>-api.test.ts`，断言 URL、params、payload 和返回 data。

Step 2: Mock 闭环

- 在 `src/mock/modules/<domain>.ts` 使用同 URL、同响应结构实现查询、分页、新增、编辑、删除。
- Mock 必须覆盖空数据、接口错误或业务失败场景。
- 补 `tests/unit/<domain>-mock.test.ts`，用真实 Mock store 验证查询、写入、更新、删除和异常状态。

Step 3: 路由与菜单

- 在 `src/router/routes/modules/<domain>.ts` 增加本地路由和 `meta.access` 权限码。
- 在 `src/mock/seed.ts` 增加服务端菜单 Mock，`name`、`path`、`componentKey`、`meta.locale` 与本地路由一致。
- 补 `tests/unit/<domain>-route.test.ts`，验证本地路由、权限码和服务端菜单一致。

Step 4: 页面状态

- 页面优先使用 `ProTable`、`ProForm`、`PermissionButton` 和字典组件。
- 页面必须覆盖 loading、空状态、错误态、无权限态、详情弹窗、编辑弹窗和删除确认。
- 补 `tests/unit/<domain>-page.test.ts`，验证初始加载、查询、详情、编辑、删除、失败提示和权限按钮。

Step 5: 验证命令

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```
