import Mock from 'mockjs'
import qs from 'query-string'
import requestSetupMock, {
  failedResponseWrap,
  responseWrap,
} from '@/utils/mock'
import { getRole, isAuthed } from '@/services/auth'
import {
  validateWorkflowSchema,
  type WorkflowNode,
  type WorkflowNodeTypeOption,
  type WorkflowSchema,
} from '@/components/workflow-designer/schema'
import type {
  StartWorkflowInstancePayload,
  WorkflowActionPayload,
  WorkflowDefinitionRecord,
  WorkflowDefinitionStatus,
  WorkflowHistoryRecord,
  WorkflowInstanceRecord,
  WorkflowPageResult,
  WorkflowTaskRecord,
  WorkflowTaskStatus,
  WorkflowTransferPayload,
} from '@/api/workflow'
import { mockUsers } from '../seed'
import type { MockParams } from '../types'

interface CreateWorkflowDefinitionInput {
  name: string
  schema: unknown
}

interface SaveWorkflowDefinitionInput {
  schema: unknown
}

interface PublishOptions {
  canPublish: boolean
}

interface StartInstanceInput extends StartWorkflowInstancePayload {
  workflowId: string
  starterId?: string
}

interface TaskActionInput extends WorkflowActionPayload {
  operatorId?: string
}

interface TransferTaskInput extends WorkflowTransferPayload {
  operatorId?: string
}

type WorkflowTaskPageQuery = {
  current?: number
  pageSize?: number
  assignee?: string
  operatorId?: string
  keyword?: string
}

const WORKFLOW_NODE_TYPES: WorkflowNodeTypeOption[] = [
  {
    type: 'start',
    label: '开始',
    description: '流程发起入口',
  },
  {
    type: 'approval',
    label: '审批',
    description: '由指定审批人处理任务',
  },
  {
    type: 'copy',
    label: '抄送',
    description: '将流程信息发送给关注人',
  },
  {
    type: 'condition',
    label: '条件',
    description: '按表达式控制流程走向',
  },
  {
    type: 'parallel',
    label: '并行',
    description: '同时创建多条处理分支',
  },
  {
    type: 'end',
    label: '结束',
    description: '流程完成节点',
  },
]

const getNow = () => '2026-06-22 00:00:00'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const createLeaveApprovalSchema = () =>
  validateWorkflowSchema({
    nodes: [
      { id: 'start', type: 'start', name: '开始' },
      {
        id: 'approval',
        type: 'approval',
        name: '部门审批',
        config: {
          approvers: ['3'],
          formId: 'form-leave',
        },
      },
      { id: 'copy', type: 'copy', name: '抄送行政' },
      { id: 'end', type: 'end', name: '结束' },
    ],
    edges: [
      { source: 'start', target: 'approval' },
      { source: 'approval', target: 'copy' },
      { source: 'copy', target: 'end' },
    ],
  })

const seedDefinitions = (): WorkflowDefinitionRecord[] => [
  {
    id: 'workflow-leave-approval',
    name: '请假审批',
    schema: createLeaveApprovalSchema(),
    status: 'published',
    version: 1,
    createdAt: getNow(),
    updatedAt: getNow(),
    publishedAt: getNow(),
  },
]

const parseBody = <T>(body: string): Partial<T> => {
  try {
    return JSON.parse(body || '{}') as Partial<T>
  } catch {
    return {}
  }
}

const getPathParts = (url: string) =>
  url
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

const getLastPathPart = (url: string) => {
  const parts = getPathParts(url)
  return parts[parts.length - 1] || ''
}

const getActionTargetId = (url: string) => {
  const parts = getPathParts(url)
  return parts[parts.length - 2] || ''
}

const toPositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const toQueryText = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }

  return typeof value === 'string' ? value : ''
}

const getCurrentMockUserId = () => {
  const role = getRole()
  return mockUsers.find((user) => user.role === role)?.id || '1'
}

const canCurrentUserPublish = () => {
  const role = getRole()
  const user = mockUsers.find((item) => item.role === role)
  return Boolean(
    user?.permissions.includes('*') ||
      user?.permissions.includes('workflow:publish')
  )
}

const paginate = <T>(
  list: T[],
  current = 1,
  pageSize = 10
): WorkflowPageResult<T> => ({
  list: list.slice((current - 1) * pageSize, current * pageSize),
  total: list.length,
})

const firstTaskNode = (schema: WorkflowSchema) => {
  const approvalNode = schema.nodes.find((node) => node.type === 'approval')
  if (approvalNode) {
    return approvalNode
  }

  return schema.nodes.find(
    (node) => node.type !== 'start' && node.type !== 'end'
  )
}

const getNodeAssignee = (node: WorkflowNode | undefined, fallback: string) => {
  const approver = node?.config.approvers?.[0]
  const parallelApprover = node?.config.parallelApprovers?.[0]
  return approver || parallelApprover || fallback
}

const getDefinitionStatusText = (
  status?: string
): WorkflowDefinitionStatus | '' =>
  status === 'draft' || status === 'published' || status === 'disabled'
    ? status
    : ''

export const getWorkflowNodeTypes = () => WORKFLOW_NODE_TYPES

export const createWorkflowMockStore = () => {
  let definitions = seedDefinitions()
  const instances: WorkflowInstanceRecord[] = []
  const tasks: WorkflowTaskRecord[] = []
  const history: WorkflowHistoryRecord[] = []

  const listDefinitions = ({
    current = 1,
    pageSize = 10,
    keyword = '',
    status = '',
  }: {
    current?: number
    pageSize?: number
    keyword?: string
    status?: WorkflowDefinitionStatus | ''
  }) => {
    const filtered = definitions.filter((item) => {
      const matchedKeyword = keyword ? item.name.includes(keyword) : true
      const matchedStatus = status ? item.status === status : true
      return matchedKeyword && matchedStatus
    })

    return paginate(filtered, current, pageSize)
  }

  const getDefinition = (id: string) => {
    const record = definitions.find((item) => item.id === id)
    if (!record) {
      throw new Error('流程定义不存在')
    }

    return record
  }

  const createDefinition = ({
    name,
    schema,
  }: CreateWorkflowDefinitionInput) => {
    const now = getNow()
    const record: WorkflowDefinitionRecord = {
      id: Mock.Random.guid(),
      name,
      schema: validateWorkflowSchema(schema),
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }
    definitions = [record, ...definitions]

    return record
  }

  const saveDefinition = (
    id: string,
    { schema }: SaveWorkflowDefinitionInput
  ) => {
    const index = definitions.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('流程定义不存在')
    }

    const record: WorkflowDefinitionRecord = {
      ...definitions[index],
      schema: validateWorkflowSchema(schema),
      status: 'draft',
      updatedAt: `${getNow()} saved`,
    }
    definitions[index] = record

    return record
  }

  const publishDefinition = (
    id: string,
    schema: unknown,
    { canPublish }: PublishOptions
  ) => {
    if (!canPublish) {
      throw new Error('没有流程发布权限')
    }

    const index = definitions.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('流程定义不存在')
    }

    const record: WorkflowDefinitionRecord = {
      ...definitions[index],
      schema: validateWorkflowSchema(schema),
      status: 'published',
      version: definitions[index].version + 1,
      publishedAt: getNow(),
      updatedAt: getNow(),
    }
    definitions[index] = record

    return record
  }

  const disableDefinition = (id: string) => {
    const index = definitions.findIndex((item) => item.id === id)
    if (index < 0) {
      throw new Error('流程定义不存在')
    }

    const record: WorkflowDefinitionRecord = {
      ...definitions[index],
      status: 'disabled',
      updatedAt: getNow(),
    }
    definitions[index] = record

    return record
  }

  const appendHistory = (
    item: Omit<WorkflowHistoryRecord, 'id' | 'createdAt'>
  ) => {
    const record: WorkflowHistoryRecord = {
      id: Mock.Random.guid(),
      createdAt: getNow(),
      ...item,
    }
    history.push(record)
    return record
  }

  const startInstance = ({
    workflowId,
    formId,
    businessKey,
    values = {},
    starterId = '1',
  }: StartInstanceInput) => {
    const definition = getDefinition(workflowId)
    if (definition.status !== 'published') {
      throw new Error('流程未发布')
    }

    const now = getNow()
    const instance: WorkflowInstanceRecord = {
      id: Mock.Random.guid(),
      workflowId,
      workflowName: definition.name,
      formId,
      businessKey,
      status: 'running',
      starterId,
      values,
      createdAt: now,
      updatedAt: now,
    }
    instances.push(instance)

    const taskNode = firstTaskNode(definition.schema)
    if (taskNode) {
      tasks.push({
        id: Mock.Random.guid(),
        instanceId: instance.id,
        workflowId,
        workflowName: definition.name,
        nodeId: taskNode.id,
        nodeName: taskNode.name,
        assignee: getNodeAssignee(taskNode, starterId),
        status: 'pending',
        businessKey,
        createdAt: now,
        updatedAt: now,
      })
    }

    appendHistory({
      instanceId: instance.id,
      action: 'start',
      operatorId: starterId,
      comment: '发起流程',
    })

    return instance
  }

  const getTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) {
      throw new Error('流程任务不存在')
    }

    return task
  }

  const updateTaskStatus = (
    taskId: string,
    status: WorkflowTaskStatus,
    { comment, operatorId = '1' }: TaskActionInput
  ) => {
    const task = getTask(taskId)
    task.status = status
    task.updatedAt = getNow()

    appendHistory({
      instanceId: task.instanceId,
      taskId: task.id,
      action: status === 'approved' ? 'approve' : 'reject',
      operatorId,
      comment,
    })

    return task
  }

  const approveTask = (taskId: string, input: TaskActionInput) =>
    updateTaskStatus(taskId, 'approved', input)

  const rejectTask = (taskId: string, input: TaskActionInput) =>
    updateTaskStatus(taskId, 'rejected', input)

  const transferTask = (
    taskId: string,
    { targetUserId, comment, operatorId = '1' }: TransferTaskInput
  ) => {
    const task = getTask(taskId)
    task.assignee = targetUserId
    task.updatedAt = getNow()

    appendHistory({
      instanceId: task.instanceId,
      taskId: task.id,
      action: 'transfer',
      operatorId,
      targetUserId,
      comment,
    })

    return task
  }

  const withdrawInstance = (
    instanceId: string,
    { comment, operatorId = '1' }: TaskActionInput
  ) => {
    const instance = instances.find((item) => item.id === instanceId)
    if (!instance) {
      throw new Error('流程实例不存在')
    }

    instance.status = 'withdrawn'
    instance.updatedAt = getNow()

    appendHistory({
      instanceId,
      action: 'withdraw',
      operatorId,
      comment,
    })

    return instance
  }

  const listTodos = ({
    assignee,
    current = 1,
    pageSize = 10,
    keyword = '',
  }: WorkflowTaskPageQuery) => {
    const filtered = tasks.filter((task) => {
      const matchedAssignee = assignee ? task.assignee === assignee : true
      const matchedStatus = task.status === 'pending'
      const matchedKeyword = keyword
        ? task.workflowName.includes(keyword) ||
          (task.businessKey || '').includes(keyword)
        : true
      return matchedAssignee && matchedStatus && matchedKeyword
    })

    return paginate(filtered, current, pageSize)
  }

  const listDone = ({
    operatorId,
    current = 1,
    pageSize = 10,
    keyword = '',
  }: WorkflowTaskPageQuery) => {
    const doneTaskIds = new Set(
      history
        .filter(
          (item) =>
            item.operatorId === operatorId &&
            (item.action === 'approve' || item.action === 'reject')
        )
        .map((item) => item.taskId)
        .filter((taskId): taskId is string => typeof taskId === 'string')
    )
    const filtered = tasks.filter((task) => {
      const matchedTask = doneTaskIds.has(task.id)
      const matchedKeyword = keyword
        ? task.workflowName.includes(keyword) ||
          (task.businessKey || '').includes(keyword)
        : true
      return matchedTask && matchedKeyword
    })

    return paginate(filtered, current, pageSize)
  }

  const getHistory = (instanceId: string) =>
    history.filter((item) => item.instanceId === instanceId)

  return {
    approveTask,
    createDefinition,
    definitions,
    disableDefinition,
    getDefinition,
    getHistory,
    instances,
    listDefinitions,
    listDone,
    listTodos,
    publishDefinition,
    rejectTask,
    saveDefinition,
    startInstance,
    tasks,
    transferTask,
    withdrawInstance,
  }
}

const store = createWorkflowMockStore()

const withWorkflowMockError = <T>(handler: () => T) => {
  if (!isAuthed()) {
    return failedResponseWrap(null, '未登录', 50008)
  }

  try {
    return responseWrap(handler())
  } catch (error) {
    return failedResponseWrap(
      null,
      error instanceof Error ? error.message : '流程 Mock 接口异常'
    )
  }
}

const setupWorkflowMock = () => {
  requestSetupMock({
    setup() {
      Mock.mock(new RegExp('/api/workflow-node-types$'), 'get', () =>
        responseWrap(getWorkflowNodeTypes())
      )

      Mock.mock(
        new RegExp('/api/workflows(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listDefinitions({
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
              status: getDefinitionStatusText(toQueryText(query.status)),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflows/[^/?]+$'),
        'get',
        (params: MockParams) =>
          withWorkflowMockError(() =>
            store.getDefinition(getLastPathPart(params.url))
          )
      )

      Mock.mock(new RegExp('/api/workflows$'), 'post', (params: MockParams) =>
        withWorkflowMockError(() => {
          const body = parseBody<CreateWorkflowDefinitionInput>(params.body)
          return store.createDefinition({
            name: typeof body.name === 'string' ? body.name : '未命名流程',
            schema: body.schema || {},
          })
        })
      )

      Mock.mock(
        new RegExp('/api/workflows/[^/?]+$'),
        'put',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<SaveWorkflowDefinitionInput>(params.body)
            return store.saveDefinition(getLastPathPart(params.url), {
              schema: body.schema || {},
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflows/[^/?]+/publish$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<SaveWorkflowDefinitionInput>(params.body)
            return store.publishDefinition(
              getActionTargetId(params.url),
              body.schema || {},
              {
                canPublish: canCurrentUserPublish(),
              }
            )
          })
      )

      Mock.mock(
        new RegExp('/api/workflows/[^/?]+/disable$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() =>
            store.disableDefinition(getActionTargetId(params.url))
          )
      )

      Mock.mock(
        new RegExp('/api/workflow-instances$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<StartInstanceInput>(params.body)
            return store.startInstance({
              workflowId:
                typeof body.workflowId === 'string' ? body.workflowId : '',
              formId: typeof body.formId === 'string' ? body.formId : undefined,
              businessKey:
                typeof body.businessKey === 'string'
                  ? body.businessKey
                  : undefined,
              values: isRecord(body.values) ? body.values : {},
              starterId: getCurrentMockUserId(),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-todos(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listTodos({
              assignee: getCurrentMockUserId(),
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-done(\\?.*)?$'),
        'get',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const { query } = qs.parseUrl(params.url)
            return store.listDone({
              operatorId: getCurrentMockUserId(),
              current: toPositiveNumber(query.current, 1),
              pageSize: toPositiveNumber(query.pageSize, 10),
              keyword: toQueryText(query.keyword),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-tasks/[^/?]+/approve$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<TaskActionInput>(params.body)
            return store.approveTask(getActionTargetId(params.url), {
              comment:
                typeof body.comment === 'string' ? body.comment : undefined,
              operatorId: getCurrentMockUserId(),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-tasks/[^/?]+/reject$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<TaskActionInput>(params.body)
            return store.rejectTask(getActionTargetId(params.url), {
              comment:
                typeof body.comment === 'string' ? body.comment : undefined,
              operatorId: getCurrentMockUserId(),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-tasks/[^/?]+/transfer$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<TransferTaskInput>(params.body)
            return store.transferTask(getActionTargetId(params.url), {
              targetUserId:
                typeof body.targetUserId === 'string'
                  ? body.targetUserId
                  : getCurrentMockUserId(),
              comment:
                typeof body.comment === 'string' ? body.comment : undefined,
              operatorId: getCurrentMockUserId(),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-instances/[^/?]+/withdraw$'),
        'post',
        (params: MockParams) =>
          withWorkflowMockError(() => {
            const body = parseBody<TaskActionInput>(params.body)
            return store.withdrawInstance(getActionTargetId(params.url), {
              comment:
                typeof body.comment === 'string' ? body.comment : undefined,
              operatorId: getCurrentMockUserId(),
            })
          })
      )

      Mock.mock(
        new RegExp('/api/workflow-instances/[^/?]+/history$'),
        'get',
        (params: MockParams) =>
          withWorkflowMockError(() =>
            store.getHistory(getActionTargetId(params.url))
          )
      )
    },
  })
}

export default setupWorkflowMock
