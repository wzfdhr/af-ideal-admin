# 主题中心

主题中心用于演示企业中后台的租户品牌和主题配置能力。当前 MVP 通过 Mock 模拟租户品牌、Logo、系统标题、登录背景、主题色、暗色模式、紧凑模式和 adapter token 预览，不写入真实后端。

## 页面入口

- 路由：`/theme/center`
- 页面：`src/views/theme/center/index.vue`
- API：`src/api/theme.ts`
- Mock：`src/mock/modules/theme.ts`

页面支持：

- 查询租户品牌主题列表。
- 预览当前租户主题。
- 修改系统标题、Logo、登录背景、主题色、暗色模式和紧凑模式。
- 生成 adapter token 预览，用于后续 Arco adapter 和 `aheart-ui` adapter 主题变量对齐。
- 应用某个租户主题。

## API 契约

主题品牌列表：

```ts
GET /themes/brands
```

主题预览：

```ts
GET /themes/brands/:tenantId
```

更新主题：

```ts
PUT /themes/brands/:tenantId
```

请求体：

```ts
interface ThemeUpdatePayload {
  appTitle?: string
  logoUrl?: string
  loginBackground?: string
  primaryColor?: string
  darkMode?: boolean
  compactMode?: boolean
}
```

应用主题：

```ts
POST /themes/brands/:tenantId/apply
```

## 权限码

权限码定义在 `src/constants/theme.ts`：

- `theme:view`：查看主题中心。
- `theme:update`：更新租户主题配置。
- `theme:apply`：应用租户主题。
- `theme:preview`：预览 adapter token。

当前路由入口使用 `theme:view` 控制。后续可把保存、应用、预览按钮分别接入 `PermissionButton`。

## Mock 场景

Mock 数据覆盖：

- 租户品牌：租户名称、品牌名、系统标题、Logo、登录背景。
- 主题变量：主题色、暗色模式、紧凑模式、adapter token。
- 保存成功：返回更新后的主题配置。
- 保存失败：主题色不是 6 位十六进制颜色时返回业务失败。
- 应用主题：返回应用时间和 adapter token。
- 异常租户：返回主题不存在。

## 后续增强

- 接入真实主题持久化 API。
- 把主题配置注入运行时 CSS 变量。
- 对齐 Arco adapter 和 `aheart-ui` adapter 的主题变量映射。
- 与租户中心联动，切换租户时自动切换品牌主题。
- 增加登录页背景、Logo 上传、主题模板和预览快照。
