# Report Center

真实模式使用 `src/components/reporting/index.vue`、`src/api/reporting.ts` 和 `src/api/reporting-exports.ts`。可以创建/保存/发布固定报表，查询真实应用记录的趋势、状态分布及明细，并创建耐久 CSV、XLSX、PDF 导出任务。下文原 `/api/reports` 和 `/api/report-export-tasks` 保留为独立 Mock 开发演示，不能作为真实文件或调度结果。

## 真实报表与文件

来源固定为选定应用的一个发布版，定义/字段映射及导出查询快照不可变；日期使用明确 IANA 时区、包含开始和结束日的有界区间，事实时间为 createdAt。新业务只影响下一次查询。查询、搜索/排序和导出使用服务端当前获准的记录及投影值，隐藏数据不能进入搜索或排序。来源升级不混入旧报告统计。

查询完成后可以导出全部匹配记录，最多 2000 条、2MiB 数据快照、10MiB 文件；超限明确报错，不截取当前页伪装全量。任务 queued/processing 只证明已创建或正在执行，只有实际文件和 ClamAV 扫描事实提交后才显示 completed。页面分别显示实际阶段、已处理条数、尝试次数、失败原因、扫描引擎与时间、字节数、SHA256 和到期时间。

```text
GET  /api/reporting/exports/capabilities
POST /api/reporting/exports
GET  /api/reporting/exports
GET  /api/reporting/exports/:id
POST /api/reporting/exports/:id/cancel
POST /api/reporting/exports/:id/retry
POST /api/reporting/exports/:id/archive
GET  /api/reporting/exports/:id/content
```

创建只提交 definitionVersionId、query、format，服务端采集实际数据；写操作使用 Idempotency-Key，取消/重试/归档还要求 expectedRevision。下载使用当前会话与租户的认证字节请求，不提供带 token 的 URL；浏览器下载前复查任务，并核对 MIME、字节数和 SHA256。普通附件接口不能读取报表制品。

任务、重试和下载重新检查原创建者与当前访问者的报告/来源/记录/字段权限。治理元数据权限不授权业务行；失权后筛选、行数、大小和摘要隐藏，保留安全状态与失败事实。服务端审计归类 export；审计读取只提供操作事实，业务数量和文件摘要通过专属授权任务接口读取。后台恢复按原主体复验，管理人重试不能借其权限替代原主体。

未归档的制品保留至创建后第 7 天，归档至创建后第 365 天；取消归档会恢复第 7 天截止时间，已过期制品不可复活。到期删除实际字节并保留任务、扫描、事件和审计事实。已完成/感染/取消的终态效果不可重写；失败最多执行 5 次，进程死亡后用租约和固定对象键恢复，同一计划只提交一个制品及完成事实。

CSV 是 UTF-8 BOM/RFC4180 文本并防止公式注入；XLSX 将合法数字/日期存为类型值、保留文字和闭合口径说明。毫秒以内数值日期时间按查询时区显示，超过毫秒的时间保留原始带时区文本以保持精度；PDF/CSV 保留源时间文本。PDF 嵌入固定许可中文字体。无法显示的字符、文本长度、行高或文件大小明确报错。生成器和文件摘要测试不等于所有原生 Excel 客户端兼容验收；完整视觉/容量/新部署/回退与正式交付仍属全产品后续门禁。

定时报表 FP-027 尚未接真实周期执行，不能由手动导出任务推断自动调度已完成。

## 独立 Mock 演示

无后端演示由 `src/components/report-center/index.vue`、`src/api/report.ts` 和 `src/mock/modules/report.ts` 组成。

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
