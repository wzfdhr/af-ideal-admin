# 定时报表与导出审计

定时报表与导出审计用于补齐报表中心的企业级调度链路。当前 MVP 已接入页面入口、API 契约、Mock 数据、权限码、接收范围、导出格式和审计记录，可在无后端环境下演示定时导出任务创建、启停和失败审计。

## 页面入口

- 路由：`/visualization/reportSchedules`
- 页面：`src/views/visualization/reportSchedules/index.vue`
- 路由模块：`src/router/routes/modules/visualization.ts`
- 服务端菜单 Mock：`src/mock/seed.ts`

页面支持：

- 按状态筛选：启用、停用。
- 按频率筛选：每日、每周、每月。
- 按关键词查询报表名称、接收目标和导出格式。
- 创建定时报表。
- 配置接收范围：角色、部门、租户。
- 配置导出格式：xlsx、csv、pdf。
- 启用和停用调度任务。
- 查看导出审计记录。

## API 契约

定时报表列表：

```ts
GET /report-schedules
```

查询参数：

```ts
interface ReportScheduleQuery {
  current: number
  pageSize: number
  status?: 'enabled' | 'disabled' | ''
  frequency?: 'daily' | 'weekly' | 'monthly' | ''
  keyword?: string
}
```

创建定时报表：

```ts
POST /report-schedules
```

请求体：

```ts
interface CreateReportSchedulePayload {
  reportId: string
  frequency: 'daily' | 'weekly' | 'monthly'
  recipientScope: 'role' | 'department' | 'tenant'
  recipientTarget: string
  exportFormat: 'xlsx' | 'csv' | 'pdf'
  enabled: boolean
}
```

启停定时报表：

```ts
POST /report-schedules/:id/toggle
```

导出审计列表：

```ts
GET /report-schedule-audits
```

审计记录：

```ts
interface ReportScheduleAuditRecord {
  id: string
  scheduleId: string
  reportName: string
  action: 'create' | 'toggle' | 'run'
  result: 'success' | 'failed'
  operator: string
  createdAt: string
  message: string
}
```

## 权限码

权限码定义在 `src/constants/report.ts`：

- `report:schedule`：查看并维护定时报表。
- `report:audit`：查看导出审计记录。
- `report:view`：查看报表中心。
- `report:export`：创建报表导出任务。

当前定时报表路由使用 `report:schedule` 控制。后续导出审计列表可接入 `report:audit` 做按钮或区块级权限控制。

## Mock 场景

Mock 模块：`src/mock/modules/report-schedule.ts`。

已覆盖：

- 每周销售趋势报表。
- 每月渠道分布报表。
- 每日订单明细报表创建。
- 角色、部门、租户接收范围。
- xlsx、csv、pdf 导出格式。
- 启用和停用状态。
- 创建、启停和运行审计记录。
- 无效调度任务的失败场景。

## 验收标准

- `/visualization/reportSchedules` 在本地路由和服务端菜单 Mock 中都有入口。
- 页面可在无后端环境下加载定时报表和导出审计。
- 页面可创建定时报表，并生成创建审计记录。
- 页面可启用和停用调度任务，并生成启停审计记录。
- Mock 必须覆盖成功和失败场景。
- API、Mock、路由、页面、文档和能力地图必须有单元测试覆盖。

## 后续增强

- 接入真实调度器和任务队列。
- 增加字段级脱敏、导出水印和文件访问审计。
- 增加失败重试、告警通知和消息中心联动。
- 增加导出文件生命周期、归档和过期清理。
- 增加接收人预览、排除名单和租户隔离校验。
