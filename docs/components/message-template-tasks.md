# 消息模板与发送任务

消息模板与发送任务用于把消息中心从通知展示推进到可运营的发送链路。当前 MVP 已接入页面入口、API 契约、Mock 数据、权限码、变量预览、接收人范围和发送任务模拟，可在无后端环境下演示模板填充、范围选择和发送任务排队。

## 页面入口

- 路由：`/message/templates`
- 页面：`src/views/message/templates/index.vue`
- 路由模块：`src/router/routes/modules/message.ts`
- 服务端菜单 Mock：`src/mock/seed.ts`

页面支持：

- 按消息通道筛选：公告、站内信、待办、告警。
- 按模板状态筛选：草稿、启用、停用。
- 按关键词查询模板名称、标题和内容。
- 选择消息模板并填写变量。
- 选择接收人范围：全部用户、角色、部门、租户。
- 生成变量预览并提示缺失变量。
- 选择站内、邮件和 WebSocket 投递方式。
- 创建 Mock 发送任务并返回审计记录 ID。

## API 契约

模板列表：

```ts
GET /messages/templates
```

查询参数：

```ts
interface MessageTemplateQuery {
  current: number
  pageSize: number
  channel?: 'notice' | 'message' | 'todo' | 'alert' | ''
  status?: 'draft' | 'enabled' | 'disabled' | ''
  keyword?: string
}
```

模板记录：

```ts
interface MessageTemplateRecord {
  id: string
  name: string
  channel: 'notice' | 'message' | 'todo' | 'alert'
  title: string
  content: string
  variables: MessageTemplateVariable[]
  status: 'draft' | 'enabled' | 'disabled'
  recipientScope: 'all' | 'role' | 'department' | 'tenant'
  recipientTarget: string
  deliveryModes?: Array<'in-app' | 'email' | 'websocket'>
  updatedAt: string
}
```

变量预览：

```ts
POST /messages/templates/:id/preview
```

请求体：

```ts
interface MessageTemplatePreviewPayload {
  variables: Record<string, string>
  recipientScope: 'all' | 'role' | 'department' | 'tenant'
  recipientTarget: string
}
```

发送任务：

```ts
POST /messages/send-tasks
```

请求体：

```ts
interface MessageSendTaskPayload {
  templateId: string
  title: string
  content: string
  recipientScope: 'all' | 'role' | 'department' | 'tenant'
  recipientTarget: string
  deliveryModes: Array<'in-app' | 'email' | 'websocket'>
  scheduledAt?: string
}
```

返回结构：

```ts
interface MessageSendTaskResult {
  success: boolean
  status: 'queued' | 'failed'
  taskId?: string
  recipientCount: number
  auditLogId?: string
  messageId?: string
  reason?: string
}
```

## 权限码

权限码定义在 `src/constants/message.ts`：

- `message:template`：查看消息模板与发送任务页面。
- `message:send`：创建消息发送任务，后续可绑定按钮级权限。

当前路由入口使用 `message:template` 控制。发送任务按钮后续可接入 `message:send` 做操作级控制。

## Mock 场景

Mock 模块：`src/mock/modules/message-template.ts`。

已覆盖：

- 流程待办提醒模板。
- 报表导出结果模板。
- 租户公告草稿模板。
- 权限异常告警停用模板。
- 通道、状态和关键词筛选。
- 必填变量缺失提示。
- 变量替换和预览内容生成。
- 全部用户、角色、部门、租户接收人范围。
- 发送任务排队成功，返回任务 ID、接收人数、消息 ID 和审计记录 ID。
- 停用模板发送失败。

## 验收标准

- `/message/templates` 在本地路由和服务端菜单 Mock 中都有入口。
- 页面可在无后端环境下加载消息模板。
- 页面可生成变量预览，并展示缺失变量。
- 页面可创建发送任务，并展示接收人数和审计记录 ID。
- Mock 发送任务必须校验模板启用状态。
- API、Mock、路由、页面、文档和能力地图必须有单元测试覆盖。

## 后续增强

- 接入真实消息队列、WebSocket 网关和发送状态回执。
- 增加模板审批、版本管理和灰度启用。
- 增加接收人明细预览、导入名单和排除名单。
- 与审计中心联动，归档模板变更和发送任务明细。
- 与流程、报表、权限变更和异常事件中心联动，形成统一消息编排能力。
