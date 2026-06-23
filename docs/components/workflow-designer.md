# Workflow Designer

流程设计器用于审批流、工单流和业务办理流的 Mock-first 演示。当前 MVP 由 `src/components/workflow-designer/index.vue`、`workflow-canvas.vue`、`use-workflow-designer.ts` 和 `src/mock/modules/workflow.ts` 组成。

## 画布与节点

设计器画布基于 AntV X6。节点类型固定为：

- `start`：开始节点。
- `approval`：审批节点。
- `copy`：抄送节点。
- `condition`：条件节点。
- `parallel`：并行节点。
- `end`：结束节点。

左侧节点面板支持点击添加，也支持拖拽到画布创建节点。右侧属性面板支持配置节点名称、审批人、条件表达式和绑定表单 `formId`。

## Schema 契约

流程 schema 由 `CURRENT_WORKFLOW_SCHEMA_VERSION` 标识版本，并通过 `validateWorkflowSchema` 进入保存、发布和运行时接口。

校验规则：

- 必须包含 `start` 和 `end` 节点。
- 节点类型必须属于固定节点集合。
- 节点 ID 不能重复。
- 连线的 `source` 和 `target` 必须指向已存在节点。

发布前会先执行本地 schema 校验。校验失败时写入 `actionError`，不得调用发布 API。

## Mock 定义闭环

设计器默认流程 ID 是 `workflow-leave-approval`。页面挂载后会调用 `loadDraft()`，通过 `getWorkflowDefinition` 读取 Mock 流程详情，因此可以在无后端环境完成加载、编辑、保存、预览、发布和停用。

接口：

```text
GET  /api/workflows
GET  /api/workflows/:id
POST /api/workflows
PUT  /api/workflows/:id
POST /api/workflows/:id/publish
POST /api/workflows/:id/disable
```

无权限用户发布时，Mock 会返回 `没有流程发布权限`，页面动作会把错误保存在 `actionError`，并恢复按钮 loading 状态。

## Mock 运行闭环

流程工作台通过 Mock 完成实例流转：

```text
POST /api/workflow-instances
GET  /api/workflow-todos
GET  /api/workflow-done
POST /api/workflow-tasks/:id/approve
POST /api/workflow-tasks/:id/reject
POST /api/workflow-tasks/:id/transfer
POST /api/workflow-instances/:id/withdraw
GET  /api/workflow-instances/:id/history
```

Mock store 覆盖发起流程、审批、驳回、转交、撤回、待办、已办和审批记录，可用于无后端演示完整流程生命周期。
