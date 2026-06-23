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

设计器默认使用该 ID。`src/components/form-designer/index.vue` 挂载后会调用 `loadDraft()`，通过 `getFormSchemaDetail` 读取 Mock 详情，因此打开页面后可以直接编辑、保存、预览和发布。左侧也提供“加载示例表单”动作，用于重新载入 Mock 种子表单。

## 运行时提交

```text
POST /api/form-runtime/:id/submit
```

提交数据会被保存到 Mock store 的 `submissions`，响应状态为 `submitted`。

设计器预览弹窗复用生产 `FormRenderer`，`submitPreview()` 会调用 renderer 暴露的 `validate()` 和 `getValues()`，再通过 `submitFormRuntime(formId, values)` 写入 Mock 提交记录。这样在无后端环境下也能演示运行时表单提交闭环。

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

## 验收闭环

- `createFormDesignerMockStore` 覆盖列表、详情、创建、保存、发布、回滚和提交存储。
- 设计器页面覆盖加载、创建、编辑、保存、预览、发布和预览提交。
- 远程选项覆盖 `users`、`empty`、`failure` 和 `timeout` 四类演示场景。
