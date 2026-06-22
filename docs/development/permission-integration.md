# 权限接入指南

本文档说明新增模块如何接入路由、菜单、按钮和服务端菜单权限。新增功能必须优先使用权限码，而不是只依赖角色名。

## 权限码命名

权限码使用 `domain:action`：

- `system:user:list`
- `system:user:create`
- `system:user:update`
- `system:user:delete`
- `report:export`
- `audit:logs:view`

新增模块建议在 `src/constants/<domain>.ts` 统一导出：

```ts
export const DOMAIN_PERMISSIONS = {
  list: 'domain:list',
  create: 'domain:create',
  update: 'domain:update',
  delete: 'domain:delete',
}
```

## 路由权限

受保护路由必须声明 `requireAuth`。有权限码时使用 `meta.access`：

```ts
meta: {
  requireAuth: true,
  roles: ['*'],
  access: {
    permissions: ['domain:list'],
    mode: 'any'
  }
}
```

没有 `meta.access` 时，路由只按登录态和 `roles` 判断。

## 菜单权限

服务端菜单 Mock 在 `src/mock/seed.ts` 中维护。菜单项必须与本地路由保持一致：

```ts
{
  path: 'userSystem',
  name: 'userSystem',
  componentKey: 'SystemUserPage',
  meta: {
    locale: 'menu.system.user',
    requireAuth: true,
    access: {
      permissions: ['system:user:list']
    }
  }
}
```

`componentKey` 只能是前端认可的组件标识，不允许后端返回任意文件路径。

## 按钮权限

新增页面使用 `PermissionButton`：

```vue
<PermissionButton permission="domain:create">
  新增
</PermissionButton>
```

兼容旧页面时可以继续使用 `v-allow`：

```vue
<a-button v-allow="'domain:update'">编辑</a-button>
```

新页面优先使用 `PermissionButton`，因为它更容易统一 loading、disabled、提示和测试。

## Mock 用户权限

Mock 用户在 `src/mock/seed.ts` 中维护。新增权限后需要确认：

- `admin` 拥有 `*`。
- 普通角色只拥有完成场景所需的权限码。
- 受限角色不应看到受保护菜单和按钮。

## 测试要求

新增模块至少覆盖：

- 路由 `meta.access` 权限码。
- 服务端菜单和本地路由一致。
- `PermissionButton` 在有权限和无权限时行为正确。
- 直接访问受限路由时被拦截。

提交前运行：

```bash
npm run lint:check
npm run typecheck
npm run test
```
