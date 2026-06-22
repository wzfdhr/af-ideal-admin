# Form Designer Mock Loop

表单设计器 Mock 模块位于 `src/mock/modules/form-designer.ts`，用于在无后端环境下演示 schema 管理、运行时提交和远程选项加载。

## Schema 接口

```text
GET  /api/form-schemas
GET  /api/form-schemas/:id
POST /api/form-schemas
PUT  /api/form-schemas/:id
POST /api/form-schemas/:id/publish
POST /api/form-schemas/:id/rollback
```

默认种子表单：

```text
form-customer-registration
```

设计器默认使用该 ID，因此打开页面后可以直接编辑、保存、预览和发布。

## 运行时提交

```text
POST /api/form-runtime/:id/submit
```

提交数据会被保存到 Mock store 的 `submissions`，响应状态为 `submitted`。

## 远程选项场景

```text
GET /api/form-options/users
GET /api/form-options/empty
GET /api/form-options/failure
GET /api/form-options/timeout
```

场景说明：

- `users`：返回两条用户选项。
- `empty`：返回空数组。
- `failure`：返回 `远程选项加载失败`。
- `timeout`：返回 `远程选项加载超时`，并可配合低 `timeout` 配置模拟运行时超时。

Mock 种子 schema 已内置这些数据源，并通过 `responseAdapter.listPath = "data.data"` 适配 Mock 响应包装结构。
