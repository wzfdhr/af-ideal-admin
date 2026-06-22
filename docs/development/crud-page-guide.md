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

提交前运行：

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```
