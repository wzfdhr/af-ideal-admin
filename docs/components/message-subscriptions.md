# 消息订阅与推送模拟

消息订阅与推送模拟用于补齐消息中心的企业级增强能力。当前 MVP 已接入页面入口、API 契约、Mock 数据、权限码、跳转联动和基础测试，可在无后端环境下演示订阅保存、WebSocket 推送模拟和业务跳转目标。

## 页面入口

- 路由：`/message/subscriptions`
- 页面：`src/views/message/subscriptions/index.vue`
- 路由模块：`src/router/routes/modules/message.ts`
- 服务端菜单 Mock：`src/mock/seed.ts`

页面支持：

- 按消息通道筛选：公告、站内信、待办、告警。
- 按关键词查询通道说明和跳转地址。
- 配置是否订阅。
- 配置投递方式：站内、邮件、WebSocket。
- 展示通道跳转目标和最近推送时间。
- 保存订阅偏好。
- 使用 Mock 数据模拟消息推送。
- 推送成功后展示投递通道和跳转联动地址。

## API 契约

订阅列表：

```ts
GET /messages/subscriptions
```

查询参数：

```ts
interface MessageSubscriptionQuery {
  current: number
  pageSize: number
  channel?: 'notice' | 'message' | 'todo' | 'alert' | ''
  keyword?: string
}
```

订阅记录：

```ts
interface MessageSubscriptionRecord {
  id: string
  channel: 'notice' | 'message' | 'todo' | 'alert'
  channelName: string
  description: string
  subscribed: boolean
  deliveryModes: Array<'in-app' | 'email' | 'websocket'>
  jumpTarget: string
  lastPushedAt?: string
  updatedAt: string
}
```

更新订阅：

```ts
PUT /messages/subscriptions/:id
```

请求体：

```ts
interface MessageSubscriptionUpdatePayload {
  subscribed: boolean
  deliveryModes: Array<'in-app' | 'email' | 'websocket'>
}
```

推送模拟：

```ts
POST /messages/subscriptions/push-simulations
```

请求体：

```ts
interface MessagePushSimulationPayload {
  channel: 'notice' | 'message' | 'todo' | 'alert'
  title: string
  content: string
  jumpTarget: string
}
```

返回结构：

```ts
interface MessagePushSimulationResult {
  success: boolean
  deliveredTo: Array<'in-app' | 'email' | 'websocket'>
  notification?: MessageNotificationRecord
  reason?: string
}
```

## 权限码

权限码定义在 `src/constants/message.ts`：

- `message:subscribe`：查看并维护消息订阅配置。
- `message:push`：执行消息推送模拟，后续可绑定真实消息发送任务。

当前路由入口使用 `message:subscribe` 控制。`message:push` 暂作为推送模拟和后续消息发送任务的操作权限预留。

## Mock 场景

Mock 模块：`src/mock/modules/message-subscription.ts`。

已覆盖：

- 公告订阅：系统维护、版本发布和平台公告。
- 站内信订阅：权限策略、账号安全和协作消息。
- 待办订阅：流程审批、表单发布等任务提醒。
- 告警订阅：报表导出失败、权限异常和系统异常。
- 订阅开启与关闭。
- 站内、邮件和 WebSocket 投递方式。
- 订阅保存后的更新时间。
- 未订阅时的推送失败原因。
- 已订阅时生成 Mock 消息记录，并返回跳转联动地址。

## 验收标准

- `/message/subscriptions` 在本地路由和服务端菜单 Mock 中都有入口。
- 页面可在无后端环境下加载订阅列表。
- 页面可保存订阅状态和投递方式。
- 页面可模拟一次 WebSocket 推送，并展示投递通道。
- Mock 推送返回的消息记录必须包含业务跳转地址。
- 订阅配置、推送模拟和权限码必须有单元测试覆盖。

## 后续增强

- 接入真实 WebSocket 网关和前端连接状态。
- 消息模板、变量填充和发送任务管理见 `docs/components/message-template-tasks.md`。
- 增加接收人范围：用户、角色、部门、租户和数据权限范围。
- 与审计日志联动，记录订阅变更和推送任务。
- 与流程、报表、权限变更事件联动，形成统一事件中心。
