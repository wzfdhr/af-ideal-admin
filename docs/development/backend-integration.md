# 后端接入指南

本文档说明真实后端如何接入 AF-Ideal-Admin。接入目标是让真实服务和 Mock 保持同一套 URL、响应结构、认证头和错误处理语义。

## API 前缀

前端请求由 `VITE_API_BASE_URL` 控制浏览器可见前缀。业务 API 只写资源路径：

```ts
request.get('/system/users')
request.post('/user/login', payload)
```

当 `VITE_API_BASE_URL=/api` 时，浏览器请求会变成 `/api/system/users`。

生产环境可以用 `runtime-config.js` 覆盖构建时配置：

```js
window.AF_IDEAL_ADMIN_CONFIG = {
  API_BASE_URL: '/api',
  APP_TITLE: 'AF-Ideal-Admin',
}
```

## 认证头

登录成功后前端保存 token，并通过请求层自动注入：

```http
X-Access-Token: <token>
```

后端必须在以下场景返回明确状态：

- token 缺失或失效：`401`。
- 已登录但无权限：`403`。
- 业务校验失败：返回业务错误码和可读错误信息。

## 响应结构

Mock 和真实后端应保持一致结构：

```ts
{
  code: 20000,
  msg: 'success',
  data: {}
}
```

分页接口统一：

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

## 接入顺序

1. 先用 Mock 完成页面交互和单元测试。
2. 后端按 `src/api` 类型和文档实现同路径接口。
3. 本地通过 `VITE_API_BASE_URL` 或 `runtime-config.js` 指向真实后端。
4. 对比 Mock 和真实接口的字段、分页、错误码和权限行为。
5. 保留 Mock 作为回归测试和无后端演示能力。

## 菜单接口

当 `menuFromServer=true` 时，前端调用 `/user/menu` 获取服务端菜单。后端返回的菜单必须：

- 使用前端已知的 `name`。
- 使用前端白名单可识别的 `componentKey`。
- 在 `meta.access.permissions` 中返回权限码。
- 不返回可执行组件路径或脚本。

## 上线前验证

```bash
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
```

后端联调时还需要验证：

- 登录、刷新、退出。
- 服务端菜单加载。
- 权限不足跳转。
- 401 清理登录态。
- 关键 Mock 页面切换真实接口后字段不缺失。
