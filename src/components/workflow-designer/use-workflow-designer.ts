import { computed, ref, type Ref } from 'vue'
import {
  createWorkflowDefinition,
  disableWorkflowDefinition,
  getWorkflowDefinition,
  publishWorkflowDefinition,
  saveWorkflowDefinition,
} from '@/api/workflow'
import {
  WORKFLOW_NODE_TYPES,
  validateWorkflowSchema,
  type WorkflowNode,
  type WorkflowNodeConfig,
  type WorkflowNodeType,
  type WorkflowNodeTypeOption,
  type WorkflowSchema,
} from './schema'

type AddWorkflowNodePosition = {
  x?: number
  y?: number
}

export const workflowNodeTypeOptions: WorkflowNodeTypeOption[] = [
  {
    type: 'start',
    label: '开始',
    description: '流程入口',
  },
  {
    type: 'approval',
    label: '审批',
    description: '审批任务',
  },
  {
    type: 'copy',
    label: '抄送',
    description: '通知相关人员',
  },
  {
    type: 'condition',
    label: '条件',
    description: '条件分支',
  },
  {
    type: 'parallel',
    label: '并行',
    description: '并行处理',
  },
  {
    type: 'end',
    label: '结束',
    description: '流程出口',
  },
]

export const workflowPaletteNodes = workflowNodeTypeOptions.filter(
  (item) => item.type !== 'start' && item.type !== 'end'
)

export const getWorkflowNodeTypeLabel = (type: WorkflowNodeType) =>
  workflowNodeTypeOptions.find((item) => item.type === type)?.label || type

export const createInitialWorkflowSchema = (): WorkflowSchema =>
  validateWorkflowSchema({
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        x: 120,
        y: 180,
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        x: 620,
        y: 180,
      },
    ],
    edges: [
      {
        id: 'edge-start-end',
        source: 'start',
        target: 'end',
      },
    ],
  })

const createWorkflowNode = (
  type: WorkflowNodeType,
  sequence: number,
  position: AddWorkflowNodePosition = {}
): WorkflowNode => {
  const label = getWorkflowNodeTypeLabel(type)

  return {
    id: `${type}-${sequence}`,
    type,
    name: `${label}节点`,
    config: {},
    x: position.x ?? 340,
    y: position.y ?? 180 + (sequence - 3) * 24,
  }
}

const splitUserIds = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const useWorkflowDesigner = () => {
  const schema = ref<WorkflowSchema>(createInitialWorkflowSchema())
  const workflowId = ref('workflow-leave-approval')
  const selectedNodeId = ref('start')
  let nodeSequence = schema.value.nodes.length + 1

  const selectedNode = computed(() =>
    schema.value.nodes.find((node) => node.id === selectedNodeId.value)
  )

  const selectNode = (nodeId: string) => {
    if (schema.value.nodes.some((node) => node.id === nodeId)) {
      selectedNodeId.value = nodeId
    }
  }

  const addNode = (
    type: WorkflowNodeType,
    position: AddWorkflowNodePosition = {}
  ) => {
    if (!WORKFLOW_NODE_TYPES.includes(type)) {
      throw new Error('非法流程节点')
    }

    if (type === 'start' || type === 'end') {
      const existingNode = schema.value.nodes.find((node) => node.type === type)
      if (existingNode) {
        selectNode(existingNode.id)
        return existingNode
      }
    }

    const node = createWorkflowNode(type, nodeSequence, position)
    nodeSequence += 1

    const endNode = schema.value.nodes.find((item) => item.type === 'end')
    const edgeToEnd = schema.value.edges.find(
      (edge) => edge.target === endNode?.id
    )
    const previousNodeId = edgeToEnd?.source || 'start'
    const endNodeId = endNode?.id || 'end'
    const endIndex = schema.value.nodes.findIndex(
      (item) => item.id === endNodeId
    )
    const insertIndex = endIndex >= 0 ? endIndex : schema.value.nodes.length

    schema.value = validateWorkflowSchema({
      ...schema.value,
      nodes: [
        ...schema.value.nodes.slice(0, insertIndex),
        node,
        ...schema.value.nodes.slice(insertIndex),
      ],
      edges: [
        ...schema.value.edges.filter((edge) => edge.target !== endNodeId),
        {
          id: `edge-${previousNodeId}-${node.id}`,
          source: previousNodeId,
          target: node.id,
        },
        {
          id: `edge-${node.id}-${endNodeId}`,
          source: node.id,
          target: endNodeId,
        },
      ],
    })
    selectedNodeId.value = node.id

    return node
  }

  const updateSelectedNode = ({
    name,
    config,
  }: {
    name?: string
    config?: WorkflowNodeConfig
  }) => {
    if (!selectedNode.value) {
      return
    }

    schema.value = validateWorkflowSchema({
      ...schema.value,
      nodes: schema.value.nodes.map((node) =>
        node.id === selectedNodeId.value
          ? {
              ...node,
              name: name ?? node.name,
              config: config ?? node.config,
            }
          : node
      ),
    })
  }

  const updateSelectedNodeConfig = (
    key: keyof WorkflowNodeConfig,
    value: unknown
  ) => {
    const node = selectedNode.value
    if (!node) {
      return
    }

    updateSelectedNode({
      config: {
        ...node.config,
        [key]: value,
      },
    })
  }

  return {
    addNode,
    schema,
    selectNode,
    selectedNode,
    selectedNodeId,
    splitUserIds,
    updateSelectedNode,
    updateSelectedNodeConfig,
    workflowId,
  }
}

export const useWorkflowDesignerActions = (
  schema: Ref<WorkflowSchema>,
  workflowId: Ref<string>
) => {
  const actionMessage = ref('')
  const actionError = ref('')
  const creating = ref(false)
  const disabling = ref(false)
  const loading = ref(false)
  const previewVisible = ref(false)
  const publishing = ref(false)
  const saving = ref(false)

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback

  const loadDraft = async (id = workflowId.value) => {
    loading.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      const result = await getWorkflowDefinition(id)
      workflowId.value = result.id
      schema.value = validateWorkflowSchema(result.schema)
      actionMessage.value = '加载成功'
    } catch (error) {
      actionError.value = getErrorMessage(error, '加载失败')
    } finally {
      loading.value = false
    }
  }

  const createDraft = async (name = '未命名流程') => {
    creating.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      const result = await createWorkflowDefinition({
        name,
        schema: schema.value,
      })
      workflowId.value = result.id
      if (result.schema) {
        schema.value = result.schema
      }
      actionMessage.value = '创建成功'
    } finally {
      creating.value = false
    }
  }

  const saveDraft = async () => {
    saving.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      await saveWorkflowDefinition(workflowId.value, schema.value)
      actionMessage.value = '保存成功'
    } finally {
      saving.value = false
    }
  }

  const publishCurrent = async () => {
    publishing.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      const validatedSchema = validateWorkflowSchema(schema.value)
      schema.value = validatedSchema
      await publishWorkflowDefinition(workflowId.value, validatedSchema)
      actionMessage.value = '发布成功'
    } catch (error) {
      actionError.value = getErrorMessage(error, '发布失败')
    } finally {
      publishing.value = false
    }
  }

  const disableCurrent = async () => {
    disabling.value = true
    actionMessage.value = ''
    actionError.value = ''

    try {
      await disableWorkflowDefinition(workflowId.value)
      actionMessage.value = '停用成功'
    } finally {
      disabling.value = false
    }
  }

  const showPreview = () => {
    previewVisible.value = !previewVisible.value
  }

  return {
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
  }
}
