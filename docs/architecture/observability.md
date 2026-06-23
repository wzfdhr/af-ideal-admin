# 前端可观测性与错误上报

本文档对应 `T-401 前端错误边界和异常上报`。目标是在不绑定具体后端日志平台的前提下，建立统一的前端错误报告契约，覆盖 Vue 运行时异常、路由异常、请求异常和白屏检测。

## 代码边界

- `src/services/observability.ts`：生成标准错误报告、脱敏敏感字段、维护当前激活的 monitor。
- `src/plugins/observability.ts`：接入 `app.config.errorHandler`、`router.onError`、全局异常提示和白屏检测。
- `src/api/request-client.ts`：通过 `onError` 回调把请求错误上下文交给可观测性服务。
- `src/main.ts`：安装可观测性插件，并注入当前路由、用户和版本号。

## 错误来源

标准错误报告的 `source` 包含：

- `vue`：Vue 运行时异常，例如渲染、生命周期或组件事件异常。
- `router`：路由解析、懒加载、导航过程异常。
- `request`：请求层统一错误，包括业务错误、401、403、404、500 和网络错误。
- `audit`：审计事件写入失败，作为旁路告警上报，不阻断业务流程。
- `white-screen`：应用根节点在启动延迟后仍没有可见内容。

## 报告字段

每条错误报告至少包含：

- `source`：错误来源。
- `severity`：`warning`、`error` 或 `fatal`。
- `message`：脱敏后的错误信息。
- `timestamp`：ISO 时间。
- `version`：当前前端版本。
- `route`：当前路由快照。
- `user`：当前用户基础标识。
- `traceId`：后端返回的链路追踪 ID，主要来自请求错误。
- `metadata`：组件名、路由错误目标、请求错误类型等上下文。

## 运行时兜底提示

`installObservability` 会在 Vue 运行时异常和路由异常出现时渲染一个固定的全局提示节点：

- 节点 ID：`af-global-error-notice`。
- 测试标识：`global-error-notice`。
- Vue 异常提示：页面运行异常，请刷新后重试或联系管理员。
- 路由异常提示：页面加载异常，请刷新后重试或返回上一页。

提示内容只使用固定文案，不展示原始错误消息，避免 token、密码、Authorization、身份证号等敏感内容被显示到页面。错误详情只进入脱敏后的上报报告。

## 白屏检测

默认白屏检测会在启动延迟后检查 `#app` 是否有可见内容。检测命中时会：

- 上报 `white-screen`、`fatal` 级别错误。
- 写入 `rootSelector` metadata。
- 调用 `WhiteScreenOptions.onDetected`，用于业务方追加监控埋点。
- 渲染 `af-global-error-notice`，提示应用启动异常。

`onDetected` 是受保护回调；即使回调自身抛错，也不能阻断白屏错误上报。

## 请求错误旁路隔离

请求层的 `onError`、`onUnauthorized`、`onForbidden` 都是旁路能力。上报服务、跳转逻辑或提示组件异常时，不能覆盖原始 `ApiRequestError`，业务代码仍然收到统一的请求错误上下文。

## 脱敏规则

错误上报不得包含 token、密码、Authorization 请求头、访问 token、身份证号等敏感信息。当前实现会在消息、路由、用户和 metadata 中递归脱敏：

- `token=...`
- `password=...`
- `authorization=...`
- `X-Access-Token=...`
- `Bearer ...`
- 18 位身份证号

后续接入真实日志平台时，必须保留这层前端脱敏，并在服务端再次做二次脱敏。

## 后端或第三方平台接入

默认 reporter 会派发浏览器事件 `af:observability-error`，方便开发工具或临时监听器观察错误报告，且不会产生控制台噪音。生产接入时不需要修改业务页面，只需要在安装插件时替换 `reporter`：

```ts
installObservability(app, {
  router,
  reporter: (report) => request.post('/observability/errors', report),
})
```

推荐后端保存字段：应用版本、用户标识、租户标识、路由、traceId、错误来源、错误级别、错误消息、堆栈和 metadata。后端写入失败不得阻断主业务。
