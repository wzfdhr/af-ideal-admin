# Report Center

报表中心用于在无后端环境下演示企业级报表查询、图表展示、字段权限和导出任务。当前 MVP 由 `src/components/report-center/index.vue`、`src/api/report.ts` 和 `src/mock/modules/report.ts` 组成。

## 报表类型

Mock 报表列表覆盖三类报表：

- `trend`：趋势报表，展示折线图趋势数据。
- `distribution`：分布报表，展示饼图分布数据。
- `detail`：明细报表，展示明细表格，同时可附带趋势和分布辅助数据。

接口：

```text
GET  /api/reports
GET  /api/reports/:id
POST /api/reports/:id/data
```

页面通过 `fetchReports` 加载报表列表，通过 `fetchReportData` 根据关键词和日期范围查询 Mock 数据。

## 权限控制

每个报表都有 `permissionCode`，每个字段都有字段级 `permissionCode`。页面会展示报表级权限码和字段级权限码，便于后续对接真实权限过滤。

示例：

- `report:sales-trend:view`
- `report:order-detail:customer`
- `report:order-detail:amount`

## 导出任务

导出接口：

```text
POST /api/report-export-tasks
GET  /api/report-export-tasks
```

Mock 支持四种导出任务状态：

- `created`
- `in-progress`
- `completed`
- `failed`

页面提供四种导出场景按钮，也保留主导出按钮默认创建 `in-progress` 任务。任务列表会展示创建、进行中、完成和失败状态。

## 错误态

报表列表、详情、查询数据、导出任务加载和导出任务创建失败时会写入 `errorMessage`，页面保持可恢复，不影响用户继续切换报表或再次查询。
