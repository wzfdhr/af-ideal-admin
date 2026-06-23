# Data Screen Designer

大屏设计器用于在无后端环境下演示企业运营可视化。当前 MVP 由 `src/components/data-screen/designer/index.vue`、`src/components/data-screen/schema` 和 `src/mock/modules/data-screen.ts` 组成。

## Schema 契约

大屏 schema 使用 `CURRENT_DATA_SCREEN_SCHEMA_VERSION` 标识版本，并通过 `validateDataScreenSchema` 进入保存、发布和实时数据渲染链路。

关键约束：

- 画布尺寸固定为 `1920x1080`。
- 主题支持 `dark` 和 `light`，默认暗色主题。
- `brandColor` 用于企业品牌色和画布边框。
- widget ID 不能重复。
- widget 的 `dataSourceKey` 必须指向已存在 Mock 数据源。
- 数据源 `refreshInterval` 必须为不小于 `1000` 的整数。

## 组件物料

当前支持六类大屏组件：

- `LineChart`：折线趋势。
- `BarChart`：柱状分布。
- `PieChart`：饼图占比。
- `RankingList`：排行列表。
- `MetricCard`：指标卡。
- `ScrollTable`：滚动表格。

默认种子大屏 `enterprise-ops-screen` 已覆盖全部物料，并绑定 `realtime` Mock 数据源。

## 实时数据与场景

实时数据接口：

```text
GET  /api/data-screens
GET  /api/data-screens/:id
PUT  /api/data-screens/:id
POST /api/data-screens/:id/publish
POST /api/data-screens/realtime
```

场景：

- `realtime`：返回指标、趋势、分布、排行、表格和告警数据。
- `empty`：返回空数据。
- `alert`：返回告警滚动数据。
- `failure`：返回 `大屏实时数据获取失败`。

页面可手动刷新实时数据，也可通过 schema 的 `refreshInterval` 对接后续定时刷新能力。

## 预览与错误态

设计器提供 `全屏预览`，切换后使用同一套 1920x1080 schema 渲染画布。加载、保存、发布和实时数据失败会写入 `errorMessage`，页面保持可恢复。保存和发布前会先执行 `validateDataScreenSchema`，非法 schema 不会调用接口。
