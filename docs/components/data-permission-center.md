# 数据权限中心

数据权限中心用于演示企业权限模型中的数据范围治理。当前 MVP 通过 Mock 模拟角色数据权限规则、字段权限、数据预览和规则更新，帮助后续真实后端接入 SQL/ORM 数据权限注入。

## 页面入口

- 路由：`/permissions/backend/data-scope`
- 页面：`src/views/backendPermissions/data-scope/index.vue`
- API：`src/api/data-permission.ts`
- Mock：`src/mock/modules/data-permission.ts`

页面支持：

- 查询角色数据权限规则。
- 按角色、租户、数据范围筛选。
- 展示全部数据、本租户、本部门及下级、本部门、本人五类范围。
- 编辑角色数据权限范围。
- 编辑字段权限。
- 预览 Mock 业务数据可见行和隐藏行。

## API 契约

数据权限规则列表：

```ts
GET /permissions/data-scopes
```

更新角色数据权限：

```ts
PUT /permissions/data-scopes/:roleId
```

请求体：

```ts
interface DataPermissionUpdatePayload {
  dataScope: DataScopeType
  departmentIds: string[]
  ownerUserIds: string[]
  fieldPermissions: string[]
}
```

预览数据权限：

```ts
POST /permissions/data-scopes/preview
```

## 权限码

权限码定义在 `src/constants/data-permission.ts`：

- `data-permission:view`：查看数据权限中心。
- `data-permission:update`：更新数据权限规则。
- `data-permission:preview`：预览数据范围。

当前路由入口使用 `data-permission:view` 控制。后续可把保存和预览按钮分别接入 `PermissionButton`。

## Mock 场景

Mock 数据覆盖：

- 全部数据：平台管理员可见所有租户业务数据。
- 本租户：租户管理员只可见当前租户业务数据。
- 本部门及下级：角色可见指定部门和子部门数据。
- 本部门：角色只可见指定部门数据。
- 本人：角色只可见指定负责人数据。
- 字段权限：按字段 key 模拟可见字段集合。
- 规则更新：返回更新后的数据权限规则。
- 异常角色：返回数据权限规则不存在。

## 后续增强

- 接入真实后端数据权限 SQL/ORM 注入。
- 支持字段脱敏、导出字段权限和报表字段权限。
- 与租户切换、组织树、角色管理和审计日志联动。
- 记录数据权限变更审计并支持回滚。
