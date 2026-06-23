# 消息中心

消息中心用于统一承载站内信、公告、待办和告警。当前 MVP 已接入页面入口、API 契约、Mock 数据、权限码和基础测试，可在无后端环境下完成演示和验收。

## 页面入口

- 路由：`/message/center`
- 订阅配置路由：`/message/subscriptions`
- 页面：`src/views/message/center/index.vue`
- 路由模块：`src/router/routes/modules/message.ts`
- 服务端菜单 Mock：`src/mock/seed.ts`

页面支持：

- 按类型筛选：公告、站内信、待办、告警。
- 按状态筛选：未读、已读。
- 按关键词查询标题、内容和来源。
- 单条标为已读。
- 当前筛选范围批量已读。
- 展示总数、未读总数和分类型未读数。
- 订阅配置、跳转联动和 Mock 推送模拟见 `docs/components/message-subscriptions.md`。

## API 契约

列表查询：

```ts
GET /messages/notifications
```

查询参数：

```ts
interface MessageNotificationQuery {
  current: number
  pageSize: number
  category?: 'notice' | 'message' | 'todo' | 'alert' | ''
  status?: 'read' | 'unread' | ''
  keyword?: string
}
```

返回结构：

```ts
interface MessageNotificationPageResult {
  list: MessageNotificationRecord[]
  total: number
  unreadTotal: number
  categoryUnread: {
    notice: number
    message: number
    todo: number
    alert: number
  }
}
```

单条已读：

```ts
POST /messages/notifications/:id/read
```

批量已读：

```ts
POST /messages/notifications/read-all
```

请求体：

```ts
interface MarkAllMessagesReadPayload {
  category?: 'notice' | 'message' | 'todo' | 'alert' | ''
}
```

## 权限码

权限码定义在 `src/constants/message.ts`：

- `message:list`：查看消息中心。
- `message:read`：单条消息标为已读。
- `message:batch-read`：批量已读。

当前路由入口使用 `message:list` 控制。后续如果要对单条已读和批量已读按钮做精细权限控制，可在页面操作按钮上接入 `PermissionButton`。

## Mock 场景

Mock 模块：`src/mock/modules/message.ts`。

已覆盖：

- 公告：系统维护公告。
- 站内信：安全策略更新提醒。
- 待办：合同审批、表单发布审批。
- 告警：报表导出失败。
- 未读和已读状态。
- 高、普通、低优先级。
- 分页、类型筛选、状态筛选和关键词查询。
- 单条已读和批量已读。

## 后续增强

- 与流程工作台联动，待办消息点击后进入具体流程实例。
- 与审计和报表导出联动，敏感操作和导出结果自动产生消息。
- 接入真实 WebSocket 网关、消息模板、发送任务和桌面通知。
- 增加多租户、组织范围和接收人维度。
- 增加消息模板和发送任务管理。
