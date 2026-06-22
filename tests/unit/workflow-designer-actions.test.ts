import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import {
  createInitialWorkflowSchema,
  useWorkflowDesigner,
  useWorkflowDesignerActions,
} from '@/components/workflow-designer/use-workflow-designer'
import type { WorkflowSchema } from '@/components/workflow-designer/schema'

const apiMocks = vi.hoisted(() => ({
  createWorkflowDefinition: vi.fn(),
  disableWorkflowDefinition: vi.fn(),
  publishWorkflowDefinition: vi.fn(),
  saveWorkflowDefinition: vi.fn(),
}))

vi.mock('@/api/workflow', () => ({
  createWorkflowDefinition: apiMocks.createWorkflowDefinition,
  disableWorkflowDefinition: apiMocks.disableWorkflowDefinition,
  publishWorkflowDefinition: apiMocks.publishWorkflowDefinition,
  saveWorkflowDefinition: apiMocks.saveWorkflowDefinition,
}))

describe('useWorkflowDesigner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with a valid start-to-end workflow schema', () => {
    const schema = createInitialWorkflowSchema()

    expect(schema.version).toBe(1)
    expect(schema.nodes.map((node) => node.type)).toEqual(['start', 'end'])
    expect(schema.edges).toEqual([
      {
        id: 'edge-start-end',
        source: 'start',
        target: 'end',
        label: '',
      },
    ])
  })

  it('adds workflow nodes and updates selected node properties', () => {
    const designer = useWorkflowDesigner()

    const approval = designer.addNode('approval')
    designer.updateSelectedNode({
      name: '主管审批',
      config: {
        approvers: ['u-1', 'u-2'],
        condition: 'days > 3',
        formId: 'form-leave',
      },
    })

    expect(approval.type).toBe('approval')
    expect(designer.selectedNode.value?.name).toBe('主管审批')
    expect(designer.selectedNode.value?.config).toEqual({
      approvers: ['u-1', 'u-2'],
      condition: 'days > 3',
      formId: 'form-leave',
    })
    expect(designer.schema.value.edges).toEqual([
      {
        id: `edge-start-${approval.id}`,
        source: 'start',
        target: approval.id,
        label: '',
      },
      {
        id: `edge-${approval.id}-end`,
        source: approval.id,
        target: 'end',
        label: '',
      },
    ])
  })

  it('creates, saves, publishes and disables workflow definitions', async () => {
    const schema = ref<WorkflowSchema>(createInitialWorkflowSchema())
    const workflowId = ref('workflow-leave-approval')
    const actions = useWorkflowDesignerActions(schema, workflowId)

    apiMocks.createWorkflowDefinition.mockResolvedValueOnce({
      id: 'workflow-new',
      schema: schema.value,
    })
    apiMocks.saveWorkflowDefinition.mockResolvedValueOnce({
      id: 'workflow-new',
      schema: schema.value,
    })
    apiMocks.publishWorkflowDefinition.mockResolvedValueOnce({
      id: 'workflow-new',
      status: 'published',
    })
    apiMocks.disableWorkflowDefinition.mockResolvedValueOnce({
      id: 'workflow-new',
      status: 'disabled',
    })

    await actions.createDraft('采购审批')
    expect(workflowId.value).toBe('workflow-new')
    expect(apiMocks.createWorkflowDefinition).toHaveBeenCalledWith({
      name: '采购审批',
      schema: schema.value,
    })
    expect(actions.actionMessage.value).toBe('创建成功')

    await actions.saveDraft()
    expect(apiMocks.saveWorkflowDefinition).toHaveBeenCalledWith(
      'workflow-new',
      schema.value
    )
    expect(actions.actionMessage.value).toBe('保存成功')

    await actions.publishCurrent()
    expect(apiMocks.publishWorkflowDefinition).toHaveBeenCalledWith(
      'workflow-new',
      schema.value
    )
    expect(actions.actionMessage.value).toBe('发布成功')

    await actions.disableCurrent()
    expect(apiMocks.disableWorkflowDefinition).toHaveBeenCalledWith(
      'workflow-new'
    )
    expect(actions.actionMessage.value).toBe('停用成功')
  })
})
