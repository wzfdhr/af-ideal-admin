<template>
  <div class="workflow-designer">
    <a-layout class="workflow-layout">
      <a-layout-sider :width="248" class="workflow-panel">
        <div class="panel-section">
          <div class="panel-title">节点</div>
          <div class="node-palette">
            <a-button
              v-for="node in palette"
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
        <div v-if="!embedded" class="panel-section">
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
          <label v-if="dataMode === 'reference'" class="field-label">
            选择流程节点
            <select
              :value="selectedNodeId"
              aria-label="选择流程节点"
              @change="selectFromList"
            >
              <option
                v-for="node in schema.nodes"
                :key="node.id"
                :value="node.id"
              >
                {{ node.name }} · {{ node.id }}
              </option>
            </select>
          </label>
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
            <label
              v-if="
                dataMode === 'reference' &&
                selectedNode.type !== 'condition' &&
                selectedNode.type !== 'parallel' &&
                selectedNode.type !== 'end'
              "
              class="field-label"
            >
              下一节点
              <select v-model="nextNodeId" aria-label="下一节点">
                <option value="">未连接</option>
                <option
                  v-for="target in schema.nodes.filter(
                    (item) =>
                      item.id !== selectedNodeId && item.type !== 'start'
                  )"
                  :key="target.id"
                  :value="target.id"
                >
                  {{ target.name }} · {{ target.id }}
                </option>
              </select>
            </label>
            <label
              v-if="!embedded"
              class="field-label"
              for="workflow-node-form"
            >
              绑定表单
            </label>
            <a-input
              v-if="!embedded"
              id="workflow-node-form"
              v-model="selectedFormId"
              placeholder="form-leave"
            />
            <label class="field-label" for="workflow-node-approvers">
              审批人
            </label>
            <a-input
              v-if="!embedded"
              id="workflow-node-approvers"
              v-model="selectedApprovers"
              placeholder="u-1,u-2"
            />
            <a-select
              v-if="embedded && selectedNode.type === 'approval'"
              id="workflow-node-approvers"
              v-model="selectedApprovers"
              data-testid="workflow-person-select"
              class="w-full"
            >
              <a-option
                v-for="person in members.filter((item) => item.canApprove)"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}
              </a-option>
            </a-select>
            <template v-if="embedded && selectedNode.type === 'copy'">
              <label class="field-label" for="workflow-copy-people">
                抄送人员
              </label>
              <a-select
                id="workflow-copy-people"
                v-model="selectedCopyPeople"
                multiple
                class="w-full"
              >
                <a-option
                  v-for="person in members"
                  :key="person.id"
                  :value="person.id"
                >
                  {{ person.name }}
                </a-option>
              </a-select>
            </template>
            <label
              v-if="!embedded && dataMode === 'mock'"
              class="field-label"
              for="workflow-node-condition"
            >
              条件表达式
            </label>
            <a-input
              v-if="!embedded && dataMode === 'mock'"
              id="workflow-node-condition"
              v-model="selectedCondition"
              placeholder="days > 3"
            />
            <ConditionNodeEditor
              v-if="
                dataMode === 'reference' && selectedNode.type === 'condition'
              "
              :node="selectedNode"
              :workflow="schema"
              :form-schema="formSchema"
              @update="schema = $event"
            />
            <ParallelNodeEditor
              v-if="
                dataMode === 'reference' && selectedNode.type === 'parallel'
              "
              :node="selectedNode"
              :workflow="schema"
              @update="schema = $event"
            />
            <section
              v-if="dataMode === 'reference' && selectedNode.type === 'sign'"
              aria-label="会签配置"
            >
              <label class="field-label">签署人</label>
              <a-select
                v-model="selectedSignPeople"
                multiple
                aria-label="会签签署人"
              >
                <a-option
                  v-for="person in members.filter((item) => item.canApprove)"
                  :key="person.id"
                  :value="person.id"
                >
                  {{ person.name }}
                </a-option>
              </a-select>
              <label class="field-label">
                通过规则
                <select v-model="signMode" aria-label="会签通过规则">
                  <option value="all">全部同意</option>
                  <option value="any">任一同意</option>
                  <option value="quorum">指定票数</option>
                </select>
              </label>
              <label v-if="signMode === 'quorum'" class="field-label">
                批准票数
                <input
                  v-model.number="signQuorum"
                  type="number"
                  min="1"
                  :max="selectedSignPeople.length"
                  aria-label="会签批准票数"
                />
              </label>
              <p>
                达到批准票数后取消其余签署；剩余可能批准数不足时驳回整个流程。
              </p>
            </section>
          </template>
          <div v-else class="empty-state">请选择节点</div>
        </div>
      </a-layout-sider>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { dataMode } from '../../../config/data-mode'
import WorkflowCanvas from './workflow-canvas.vue'
import ConditionNodeEditor from './condition-node-editor.vue'
import ParallelNodeEditor from './parallel-node-editor.vue'
import {
  getWorkflowNodeTypeLabel,
  useWorkflowDesigner,
  useWorkflowDesignerActions,
  workflowPaletteNodes,
} from './use-workflow-designer'
import type { WorkflowNodeType, WorkflowSchema } from './schema'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
    initialSchema?: object
    members?: { id: string; name: string; canApprove: boolean }[]
    formSchema?: object
  }>(),
  {
    embedded: false,
    initialSchema: undefined,
    members: () => [],
    formSchema: undefined,
  }
)
const emit = defineEmits<{
  (event: 'update:schema', schema: WorkflowSchema): void
}>()
const palette = computed(() => {
  if (props.embedded)
    return workflowPaletteNodes.filter(
      (item) =>
        item.type === 'approval' ||
        item.type === 'copy' ||
        item.type === 'condition' ||
        item.type === 'parallel' ||
        item.type === 'sign'
    )
  return dataMode === 'mock'
    ? workflowPaletteNodes.filter((item) => item.type !== 'sign')
    : workflowPaletteNodes
})

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
} = useWorkflowDesigner(props.initialSchema)

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
  if (!props.embedded) loadDraft()
})
watch(
  schema,
  (value) => {
    if (props.embedded) emit('update:schema', value)
  },
  { deep: true }
)

const selectedNodeName = computed({
  get: () => selectedNode.value?.name || '',
  set: (value: string) => updateSelectedNode({ name: value }),
})
const selectFromList = (event: Event) =>
  selectNode((event.target as HTMLSelectElement).value)
const nextNodeId = computed({
  get: () =>
    schema.value.edges.find((edge) => edge.source === selectedNodeId.value)
      ?.target || '',
  set: (target: string) => {
    const source = selectedNodeId.value
    schema.value = {
      ...schema.value,
      edges: [
        ...schema.value.edges.filter((edge) => edge.source !== source),
        ...(target
          ? [{ id: `next-${source}`, source, target, label: '' }]
          : []),
      ],
    }
  },
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
const selectedCopyPeople = computed({
  get: () => selectedNode.value?.config.ccUsers || [],
  set: (value: string[]) => updateSelectedNodeConfig('ccUsers', value),
})
const selectedSignPeople = computed({
  get: () => selectedNode.value?.config.approvers || [],
  set: (value: string[]) => updateSelectedNodeConfig('approvers', value),
})
const signMode = computed({
  get: () => selectedNode.value?.config.voting?.mode || 'all',
  set: (mode: 'all' | 'any' | 'quorum') =>
    updateSelectedNodeConfig('voting', {
      mode,
      ...(mode === 'quorum' ? { quorum: 1 } : {}),
    }),
})
const signQuorum = computed({
  get: () => selectedNode.value?.config.voting?.quorum ?? 1,
  set: (quorum: number) => {
    schema.value = {
      ...schema.value,
      nodes: schema.value.nodes.map((node) => {
        if (node.id !== selectedNodeId.value) return node
        return {
          ...node,
          config: { ...node.config, voting: { mode: 'quorum', quorum } },
        }
      }),
    }
  },
})

const selectedCondition = computed({
  get: () =>
    typeof selectedNode.value?.config.condition === 'string'
      ? selectedNode.value.config.condition
      : '',
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
  height: max(640px, calc(100vh - 96px));
  min-height: 0;
  background: #f7f8fa;
}

.workflow-panel {
  overflow-y: auto;
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
  min-height: 0;
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
  min-height: 100%;
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
