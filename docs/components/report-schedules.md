# 定时报表与导出审计

本文保留原定时报表与导出审计 Mock 的使用说明，并区分全产品真实调度实现。原 MVP 的列表、创建、启停及运行审计只证明 Mock 演示；真实实现的验收证据以 `docs/quality/full-product-delivery-tasks.md` 为准。

## 真实模式接入

真实模式复用同一页面入口，采用 `packages/contracts/src/report-schedules.ts` 的闭合 v1 契约。规则固定已发布报表版本、IANA 时区、每日/每周/每月本地时刻、自然周期数据窗、真实角色/部门/租户接收范围及 CSV/XLSX/PDF 格式。目录和预览来自当前服务端授权，不接收自由文本人员或客户端执行时间。

| 路径（均位于 `/api`） | 行为 |
| --- | --- |
| `GET/POST /reporting/schedules` | 分页读取规则、创建不可变初版 |
| `GET/PUT /reporting/schedules/:id` | 读取历史版本、保存新规则版本 |
| `POST /reporting/schedules/:id/enabled` | 按 revision 启用或关闭启用区间 |
| `GET /reporting/schedules/recipient-options` | 当前授权的角色和部门目录 |
| `POST /reporting/schedules/preview` | 新规则预览 |
| `POST /reporting/schedules/:id/preview` | 固定规则预览 |
| `GET /reporting/schedules/runs` | 当前授权的运行事实 |
| `GET /reporting/schedules/runs/:id` | 运行及逐收件事实 |
| `POST /reporting/schedules/runs/:id/retry` | 保持原主体、查询及已固定接收集合重试 |
| `POST /reporting/schedules/runs/:id/cancel` | 显式取消尚未完成的运行 |

写入使用 `Idempotency-Key`；编辑、启停、重试和取消使用 `expectedRevision`。真实权限按规则读取/创建/更新/启停和运行读取/重试/取消分别控制，使用 `report:schedule:list/create/update/toggle/run:read/run:retry/run:cancel` 对应权限码。旧 `report:schedule` 只属于下文 Mock。

worker 将周期运行、接收集合、导出绑定及通知事实保存到 PostgreSQL。停用关闭启用区间，保留已经到期和已经创建的事实；显式取消是独立操作。重启后补跑已启用区间的到期周期，不补停用期间的周期。文件按发起者与收件人的当前行和字段权限交集生成，扫描成功且真实通知提交后才显示完成；撤权、成员退出范围或来源停用会限制后续访问。通知跳转到 `/visualization/reportCenter?exportJobId=...`，页面重新读取授权，链接本身不携带文件读取权。

规则、日历、恢复、扫描、通知和限制的完整决策见 `docs/architecture/full-product-report-scheduling-design.md`。模块仍在实施验证中；此说明不作为真实执行、部署、恢复或正式交付完成的证据。

## 原 Mock 说明

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
