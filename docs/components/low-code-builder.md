# Low-Code Builder

低代码页面搭建器用于在无后端环境下生成可演示的企业级查询页面。当前 MVP 由 `src/components/low-code/builder/index.vue`、`src/components/low-code/schema`、`src/components/low-code/materials` 和 `src/mock/modules/low-code.ts` 组成。

## Schema 契约

低代码页面 schema 使用 `CURRENT_LOW_CODE_PAGE_SCHEMA_VERSION` 标识版本，并通过 `validateLowCodePageSchema` 进入保存、发布和 Mock 运行链路。

页面 schema 包含：

- `title`：页面标题。
- `permissionCode`：页面级权限码。
- `dataSources`：Mock 数据源配置。
- `materials`：页面区块物料。

校验规则：

- 物料类型必须来自物料注册表。
- 物料 ID 不能重复。
- `ProTable` 绑定的 `dataSourceKey` 必须存在。
- `query` 和 `refreshBlock` 按钮 action 的 `target` 必须指向已存在区块。
- 页面、区块、按钮均支持 `permissionCode`。

## 物料注册

物料注册表位于 `LOW_CODE_MATERIALS`，当前支持：

- `ProTable`：查询表格。
- `ProForm`：查询表单。
- `ChartCard`：图表卡片。
- `StatCard`：统计卡片。

左侧物料面板可点击添加物料，画布会即时渲染区块，右侧属性面板可编辑区块名称和区块权限码。

## 按钮 Action

按钮 action 支持：

- `query`：查询数据源。
- `submit`：提交动作占位。
- `navigate`：跳转目标占位。
- `openModal`：打开弹窗占位。
- `refreshBlock`：刷新指定区块。

运行 `query` 或 `refreshBlock` 时会触发 `previewLowCodeDataSource`，其他动作会显示动作名称和权限码，便于演示按钮权限治理。

## Mock 闭环

Mock 接口：

```text
GET  /api/low-code/pages
GET  /api/low-code/pages/:id
POST /api/low-code/pages
PUT  /api/low-code/pages/:id
POST /api/low-code/pages/:id/publish
POST /api/low-code/pages/:id/rollback
POST /api/low-code/data-source/preview
```

默认种子页面 `low-code-customer-query` 是一个客户查询表格页，包含 `ProForm`、`ProTable`、`StatCard` 和 `ChartCard`，并绑定 `customers` Mock 数据源。

数据源场景：

- `customers`：成功返回客户列表。
- `empty`：返回空数据。
- `failure`：返回 `低代码数据源预览失败`。

保存、发布、回滚和加载失败会写入 `actionError`，数据源预览失败会写入 `previewError`，页面保持可恢复。
