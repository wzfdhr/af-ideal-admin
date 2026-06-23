# 插件中心

插件中心用于演示企业中后台框架的插件化扩展协议。当前 MVP 通过 Mock 模拟插件清单、manifest、启停生命周期、路由注册、菜单注册、权限注册、Mock 注册和物料注册预览，不执行真实远程插件代码。

## 页面入口

- 路由：`/plugin/center`
- 页面：`src/views/plugin/center/index.vue`
- API：`src/api/plugin.ts`
- Mock：`src/mock/modules/plugin.ts`

页面支持：

- 查询插件清单。
- 按插件名称、说明、作者关键词筛选。
- 按启停状态筛选。
- 按扩展类型筛选：路由、菜单、权限、Mock、物料。
- 查看插件 manifest。
- 模拟插件启用和停用。

## API 契约

插件列表：

```ts
GET /plugins
```

插件 manifest：

```ts
GET /plugins/:id/manifest
```

启停插件：

```ts
POST /plugins/:id/toggle
```

请求体：

```ts
interface PluginTogglePayload {
  enabled: boolean
}
```

## Manifest 协议

当前 MVP 的 manifest 字段包括：

- `id`：插件唯一标识。
- `name`：插件名称。
- `version`：插件版本。
- `routes`：路由注册预览。
- `menus`：菜单注册预览。
- `permissions`：权限注册预览。
- `mockModules`：Mock 注册预览。
- `materials`：物料注册预览。
- `lifecycle`：安装、启用、停用时间。

后续真实插件加载必须先做静态 manifest 校验，再进入运行时注册生命周期，不允许直接执行不可信插件代码。

## 权限码

权限码定义在 `src/constants/plugin.ts`：

- `plugin:view`：查看插件中心。
- `plugin:manifest`：查看插件 manifest。
- `plugin:toggle`：启用或停用插件。

当前路由入口使用 `plugin:view` 控制。后续可把 manifest 查看和启停按钮分别接入 `PermissionButton`。

## Mock 场景

Mock 数据覆盖：

- 插件清单：工作流、可视化、审计插件。
- 启停状态：启用和停用。
- 路由注册：插件声明路由 name 和 path。
- 菜单注册：插件声明菜单 name 和 locale。
- 权限注册：插件声明权限码。
- Mock 注册：插件声明 Mock 模块。
- 物料注册：插件声明低代码或大屏物料。
- 启停生命周期：模拟启用、停用和插件不存在。

## 后续增强

- 设计真实插件 manifest schema 和版本迁移。
- 建设真实插件加载隔离、运行时注册生命周期和卸载清理。
- 建设插件市场发布流程、签名校验和兼容性检测。
- 支持插件按租户、角色、环境灰度启停。
- 支持插件带来的路由、菜单、权限、Mock、物料统一审计。
