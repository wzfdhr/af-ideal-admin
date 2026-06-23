<template>
  <div class="workflow-designer">
    <a-layout class="workflow-layout">
      <a-layout-sider :width="248" class="workflow-panel">
        <div class="panel-section">
          <div class="panel-title">节点</div>
          <div class="node-palette">
            <a-button
              v-for="node in workflowPaletteNodes"
              :key="node.type"
              class="node-palette-item"
              :data-testid="`workflow-palette-${node.type}`"
              draggable="true"
              long
              @click="addNode(node.type)"
              @dragstart="handleDragStart($event, node.type)"
            >
              {{ node.label }}
            </a-button>
          </div>
        </div>
        <a-divider />
        <div class="panel-section">
          <div class="panel-title">操作</div>
          <a-space direction="vertical" class="w-full">
            <a-button long :loading="loading" @click="loadDraft()">
              加载示例流程
            </a-button>
            <a-button long :loading="creating" @click="createDraft()">
              创建草稿
            </a-button>
            <a-button
              long
              :loading="saving"
              data-testid="workflow-save"
              @click="saveDraft"
            >
              保存草稿
            </a-button>
            <a-button
              type="primary"
              long
              :loading="publishing"
              @click="publishCurrent"
            >
              发布流程
            </a-button>
            <a-button long :loading="disabling" @click="disableCurrent">
              停用流程
            </a-button>
            <a-button type="outline" long @click="showPreview">
              预览 schema
            </a-button>
            <div v-if="actionMessage" class="action-message">
              {{ actionMessage }}
            </div>
            <div v-if="actionError" class="action-error">
              {{ actionError }}
            </div>
          </a-space>
        </div>
      </a-layout-sider>

      <a-layout-content class="workflow-main">
        <div class="workflow-main-header">
          <div>
            <h2>流程设计器</h2>
            <p>
              {{ schema.nodes.length }} 个节点 /
              {{ schema.edges.length }} 条连线
            </p>
          </div>
          <span>流程 ID：{{ workflowId }}</span>
        </div>
        <workflow-canvas
          :schema="schema"
          :selected-node-id="selectedNodeId"
          @select-node="selectNode"
          @canvas-drop="handleCanvasDrop"
        />
        <a-textarea
          v-if="previewVisible"
          :model-value="schemaPreview"
          readonly
          class="schema-preview"
          data-testid="workflow-schema-preview"
          :auto-size="{ minRows: 8, maxRows: 12 }"
        />
      </a-layout-content>

      <a-layout-sider :width="292" class="workflow-panel">
        <div
          class="panel-section property-panel"
          data-testid="workflow-property-panel"
        >
          <div class="panel-title">属性</div>
          <template v-if="selectedNode">
            <div class="property-row">
              <span>类型</span>
              <strong data-testid="workflow-selected-node-type">
                {{ getWorkflowNodeTypeLabel(selectedNode.type) }}
              </strong>
            </div>
            <label class="field-label" for="workflow-node-name">节点名称</label>
            <a-input
              id="workflow-node-name"
              v-model="selectedNodeName"
              data-testid="workflow-node-name"
            />
            <label class="field-label" for="workflow-node-form">绑定表单</label>
            <a-input
              id="workflow-node-form"
              v-model="selectedFormId"
              placeholder="form-leave"
            />
            <label class="field-label" for="workflow-node-approvers">
              审批人
            </label>
            <a-input
              id="workflow-node-approvers"
              v-model="selectedApprovers"
              placeholder="u-1,u-2"
            />
            <label class="field-label" for="workflow-node-condition">
              条件表达式
            </label>
            <a-input
              id="workflow-node-condition"
              v-model="selectedCondition"
              placeholder="days > 3"
            />
          </template>
          <div v-else class="empty-state">请选择节点</div>
        </div>
      </a-layout-sider>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import WorkflowCanvas from './workflow-canvas.vue'
import {
  getWorkflowNodeTypeLabel,
  useWorkflowDesigner,
  useWorkflowDesignerActions,
  workflowPaletteNodes,
} from './use-workflow-designer'
import type { WorkflowNodeType } from './schema'

const {
  addNode,
  schema,
  selectNode,
  selectedNode,
  selectedNodeId,
  splitUserIds,
  updateSelectedNode,
  updateSelectedNodeConfig,
  workflowId,
} = useWorkflowDesigner()

const {
  actionError,
  actionMessage,
  createDraft,
  creating,
  disableCurrent,
  disabling,
  loadDraft,
  loading,
  previewVisible,
  publishCurrent,
  publishing,
  saveDraft,
  saving,
  showPreview,
} = useWorkflowDesignerActions(schema, workflowId)

onMounted(() => {
  loadDraft()
})

const selectedNodeName = computed({
  get: () => selectedNode.value?.name || '',
  set: (value: string) => updateSelectedNode({ name: value }),
})

const selectedFormId = computed({
  get: () => selectedNode.value?.config.formId || '',
  set: (value: string) => updateSelectedNodeConfig('formId', value),
})

const selectedApprovers = computed({
  get: () => selectedNode.value?.config.approvers?.join(',') || '',
  set: (value: string) =>
    updateSelectedNodeConfig('approvers', splitUserIds(value)),
})

const selectedCondition = computed({
  get: () => selectedNode.value?.config.condition || '',
  set: (value: string) => updateSelectedNodeConfig('condition', value),
})

const schemaPreview = computed(() => JSON.stringify(schema.value, null, 2))

const handleDragStart = (event: DragEvent, type: WorkflowNodeType) => {
  event.dataTransfer?.setData('workflow-node-type', type)
}

const handleCanvasDrop = ({
  type,
  x,
  y,
}: {
  type: WorkflowNodeType
  x: number
  y: number
}) => {
  addNode(type, { x, y })
}
</script>

<style scoped>
.workflow-designer {
  width: 100%;
  min-height: calc(100vh - 96px);
}

.workflow-layout {
  min-height: calc(100vh - 96px);
  background: #f7f8fa;
}

.workflow-panel {
  overflow: hidden;
  background: #ffffff;
  border-right: 1px solid #e5e6eb;
}

.workflow-panel:last-child {
  border-right: 0;
  border-left: 1px solid #e5e6eb;
}

.panel-section {
  padding: 16px;
}

.panel-title {
  margin-bottom: 12px;
  color: #1d2129;
  font-size: 14px;
  font-weight: 600;
}

.node-palette {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.node-palette-item {
  min-height: 34px;
}

.workflow-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
}

.workflow-main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #4e5969;
}

.workflow-main-header h2 {
  margin: 0 0 4px;
  color: #1d2129;
  font-size: 18px;
  font-weight: 600;
}

.workflow-main-header p {
  margin: 0;
  font-size: 13px;
}

.property-panel {
  height: 100%;
}

.property-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  color: #4e5969;
  font-size: 13px;
}

.field-label {
  display: block;
  margin: 14px 0 6px;
  color: #4e5969;
  font-size: 13px;
}

.action-message {
  color: #00b42a;
  font-size: 12px;
}

.action-error {
  color: #f53f3f;
  font-size: 12px;
}

.schema-preview {
  flex: none;
}

.empty-state {
  color: #86909c;
  font-size: 13px;
}
</style>
