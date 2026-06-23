# 租户中心

租户中心用于演示企业中后台的多租户、组织树和数据权限范围。当前 MVP 已提供页面入口、API 契约、Mock 数据、权限码和基础测试，支持无后端环境下的租户切换和组织数据权限演示。

## 页面入口

- 路由：`/tenant/center`
- 页面：`src/views/tenant/center/index.vue`
- 路由模块：`src/router/routes/modules/tenant.ts`
- Mock 模块：`src/mock/modules/tenant.ts`

页面支持：

- 查询租户列表。
- 按租户名称、编码、品牌关键词筛选。
- 按启用和停用状态筛选。
- 切换当前租户。
- 展示当前租户组织树。
- 展示角色数据权限范围。

## API 契约

租户列表：

```ts
GET /tenants
```

查询参数：

```ts
interface TenantQuery {
  current: number
  pageSize: number
  keyword?: string
  status?: 'enabled' | 'disabled' | ''
}
```

租户上下文：

```ts
GET /tenants/:tenantId/context
```

返回结构包含当前租户、组织树和角色数据权限：

```ts
interface TenantContext {
  currentTenant: TenantRecord
  orgTree: TenantOrgNode[]
  dataScopes: TenantRoleDataScope[]
}
```

租户切换：

```ts
POST /tenants/switch
```

请求体：

```ts
interface SwitchTenantPayload {
  tenantId: string
}
```

## 权限码

权限码定义在 `src/constants/tenant.ts`：

- `tenant:list`：查看租户中心。
- `tenant:switch`：切换租户。
- `tenant:org:view`：查看组织树和数据权限范围。

当前路由入口使用 `tenant:list` 控制。后续可把切换按钮和组织树区域分别接入 `tenant:switch` 与 `tenant:org:view`，满足更细颗粒度的租户治理。

## Mock 场景

Mock 数据覆盖：

- 多租户：`tenant-a`、`tenant-b`、停用租户 `tenant-c`。
- 租户品牌：品牌名、主题色、租户编码。
- 组织树：公司、部门、小组。
- 数据权限：全部数据、本租户、本部门及下级、本部门、本人。
- 租户切换：切换后当前租户上下文同步变化。
- 查询筛选：关键词、状态、分页。

## 后续增强

- 把当前租户上下文注入请求层，真实后端通过 header 或 query 识别租户。
- 把租户品牌接入主题中心和登录页品牌配置。
- 把数据权限范围接入系统角色、用户列表、报表字段和审计筛选。
- 支持字段级数据权限、部门树授权和租户管理员授权。
- 支持真实后端租户隔离、租户初始化和租户禁用后的菜单收敛。
