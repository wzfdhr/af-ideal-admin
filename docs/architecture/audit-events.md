# 操作审计与安全事件契约

本文档对应 `T-402 操作审计与安全事件` 和 `T-404 审计日志 Mock 闭环`。目标是在前端先建立审计事件契约、关键操作样例和查询页面，让登录、退出、权限资源变更、设计器发布、数据大屏发布、报表导出等行为在无后端环境下也能通过 Mock 形成审计闭环。

## 代码边界

- `src/api/audit.ts`：审计事件 API 类型、`/audit/events` 写入接口和查询接口。
- `src/services/audit.ts`：审计服务，负责补充操作者和发生时间，并保证审计失败不阻断主业务。
- `src/mock/modules/audit.ts`：Mock 审计事件写入和查询接口，负责脱敏、保存、筛选和分页。
- `src/views/audit/log-list/index.vue`：审计日志查询页面。
- `src/router/routes/modules/audit.ts`：审计中心路由入口。
- `src/store/modules/user.ts`：登录成功、登录失败、退出成功、退出失败的安全事件样例。
- `src/api/system/menu.ts`：菜单新增、修改、删除的操作/权限事件样例。
- `src/api/system/role.ts`：角色新增、修改、删除的权限事件样例。

## 事件结构

```ts
interface AuditEventPayload {
  module: string
  action: string
  eventType: 'operation' | 'security' | 'permission' | 'export'
  result: 'success' | 'failure'
  operator?: {
    id?: string
    name?: string
    role?: string
  }
  target: {
    type: string
    id?: string
    name?: string
  }
  occurredAt: string
  traceId?: string
  detail?: Record<string, unknown>
}
```

每条关键操作必须能定位：

- 操作者：`operator`。
- 操作时间：`occurredAt`。
- 操作对象：`target`。
- 操作结果：`result`。
- 业务动作：`module` + `action`。

## 当前事件样例

- `auth.login`：登录成功和失败，类型为 `security`。
- `auth.logout`：退出成功和失败，类型为 `security`。
- `system.user.update`：用户信息变更，类型为 `operation`。
- `system.menu.create`：菜单新增，类型为 `operation`。
- `system.menu.update`：菜单变更，类型为 `permission`。
- `system.menu.delete`：菜单删除，类型为 `permission`。
- `system.role.create`：角色新增，类型为 `permission`。
- `system.role.update`：角色变更，类型为 `permission`。
- `system.role.delete`：角色删除，类型为 `permission`。
- `workflow.publish`：流程发布，类型为 `operation`。
- `form.publish`：表单发布，类型为 `operation`。
- `data-screen.publish`：数据大屏发布，类型为 `operation`。
- `report.export`：报表导出，类型为 `export`。

## 查询接口

审计日志查询使用 `GET /audit/events`，返回分页结果：

```ts
interface AuditEventQuery {
  current: number
  pageSize: number
  operatorName?: string
  module?: string
  result?: 'success' | 'failure' | ''
  eventType?: 'operation' | 'security' | 'permission' | 'export' | ''
  dateRange?: string[]
}

interface AuditEventPageResult {
  list: AuditEventRecord[]
  total: number
}
```

Mock 查询支持：

- 按操作人模糊查询：`operatorName`。
- 按模块精确查询：`module`。
- 按结果精确查询：`result`。
- 按事件类型精确查询：`eventType`。
- 按时间范围查询：`dateRange`，日期字符串按整天闭区间处理。

当前 Mock 种子覆盖登录日志、普通操作日志、权限变更日志和导出日志，并包含流程发布、表单发布、大屏发布和报表导出样例。

## 页面展示安全

审计日志查询页面会在页面展示前二次脱敏。即使接口或 Mock 数据意外返回了原始 `token`、`password`、`Authorization`、`Bearer ...` 或身份证号，详情列也只能展示 `[redacted]` 或 `[redacted-id-card]`。这层兜底不替代前端提交前脱敏和后端二次校验，只用于防止列表展示泄露敏感字段。

## 失败处理

审计写入是旁路能力。`recordAuditEvent` 捕获审计接口异常，并通过 `observability` 的 `audit` 来源上报。审计失败不能影响登录、退出、菜单保存、角色保存等主业务结果。

审计与可观测性是双旁路：如果审计接口失败，主业务继续；如果审计失败后的 `reportAuditError` 也失败，主业务仍然继续。任何审计链路异常都不能替代原业务流程的成功或失败语义。

## 脱敏规则

审计 detail 不允许保存 token、密码、Authorization、访问 token 或身份证号。Mock 层会对 detail 递归脱敏；真实后端也必须再次脱敏和校验。

`recordAuditEvent` 在前端提交前脱敏，会递归处理 `detail`、`operator`、`target` 和其他上下文字段：

- 敏感 key：`token`、`password`、`authorization`、`X-Access-Token`、`access-token`。
- 敏感字符串：`token=...`、`password=...`、`Authorization=...`、`Bearer ...`。
- 身份证号：18 位身份证格式统一替换为 `[redacted-id-card]`。

## 前后端责任边界

前端负责：

- 在关键操作成功或失败后提交审计事件。
- 提供当前可见的操作者、对象、动作、结果和页面上下文。
- 提交前脱敏，不提交密码、token、Authorization、身份证号等敏感字段。
- 审计失败时不阻断主流程，并把失败交给可观测性服务。

后端负责：

- 以服务端身份、租户、IP、User-Agent、traceId 和真实权限上下文补强审计记录。
- 校验前端提交字段，拒绝非法 module/action/eventType/result。
- 对敏感字段做二次脱敏。
- 保证审计写入可追踪、可重试或进入可靠队列。
- 为 `T-404 审计日志 Mock 闭环` 和真实审计查询提供分页、筛选和权限控制接口。
