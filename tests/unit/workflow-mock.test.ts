import { describe, expect, it } from 'vitest'
import {
  createWorkflowMockStore,
  getWorkflowNodeTypes,
} from '@/mock/modules/workflow'
import { migrateWorkflowSchema } from '@/components/workflow-designer/schema'

const schema = () =>
  migrateWorkflowSchema({
    nodes: [
      { id: 'start', type: 'start', name: '开始' },
      {
        id: 'approval',
        type: 'approval',
        name: '部门审批',
        config: {
          approvers: ['u-1'],
          formId: 'form-leave',
        },
      },
      { id: 'copy', type: 'copy', name: '抄送人' },
      { id: 'condition', type: 'condition', name: '条件分支' },
      { id: 'parallel', type: 'parallel', name: '并行审批' },
      { id: 'end', type: 'end', name: '结束' },
    ],
    edges: [
      { source: 'start', target: 'approval' },
      { source: 'approval', target: 'copy' },
      { source: 'copy', target: 'condition' },
      { source: 'condition', target: 'parallel' },
      { source: 'parallel', target: 'end' },
    ],
  })

describe('workflow mock store', () => {
  it('exposes all workflow node types required by the designer', () => {
    expect(getWorkflowNodeTypes().map((item) => item.type)).toEqual([
      'start',
      'approval',
      'copy',
      'condition',
      'parallel',
      'end',
    ])
  })

  it('creates, saves, publishes and disables workflow definitions', () => {
    const store = createWorkflowMockStore()
    const created = store.createDefinition({
      name: '请假审批',
      schema: schema(),
    })

    expect(created.status).toBe('draft')
    expect(created.version).toBe(1)
    expect(store.getDefinition(created.id).name).toBe('请假审批')

    const saved = store.saveDefinition(created.id, {
      schema: schema(),
    })
    expect(saved.status).toBe('draft')

    const published = store.publishDefinition(created.id, schema(), {
      canPublish: true,
    })
    expect(published.status).toBe('published')
    expect(published.version).toBe(2)

    const disabled = store.disableDefinition(created.id)
    expect(disabled.status).toBe('disabled')
  })

  it('rejects publish actions when the user lacks workflow publish permission', () => {
    const store = createWorkflowMockStore()
    const created = store.createDefinition({
      name: '请假审批',
      schema: schema(),
    })

    expect(() =>
      store.publishDefinition(created.id, schema(), {
        canPublish: false,
      })
    ).toThrow('没有流程发布权限')
  })

  it('starts, approves, rejects, transfers and withdraws instances', () => {
    const store = createWorkflowMockStore()
    const definition = store.publishDefinition(
      store.createDefinition({
        name: '请假审批',
        schema: schema(),
      }).id,
      schema(),
      {
        canPublish: true,
      }
    )

    const instance = store.startInstance({
      workflowId: definition.id,
      formId: 'form-leave',
      businessKey: 'leave-1',
      values: {
        days: 2,
      },
      starterId: 'u-1',
    })

    expect(instance.status).toBe('running')
    expect(
      store.listTodos({ assignee: 'u-1', current: 1, pageSize: 10 }).total
    ).toBeGreaterThan(0)

    const todo = store.listTodos({
      assignee: 'u-1',
      current: 1,
      pageSize: 10,
    }).list[0]
    const approved = store.approveTask(todo.id, {
      comment: '同意',
      operatorId: 'u-1',
    })
    expect(approved.status).toBe('approved')
    expect(
      store.listDone({ operatorId: 'u-1', current: 1, pageSize: 10 }).total
    ).toBe(1)

    const rejected = store.rejectTask(todo.id, {
      comment: '资料不完整',
      operatorId: 'u-1',
    })
    expect(rejected.status).toBe('rejected')

    const transferred = store.transferTask(todo.id, {
      targetUserId: 'u-2',
      comment: '转交',
      operatorId: 'u-1',
    })
    expect(transferred.assignee).toBe('u-2')

    const withdrawn = store.withdrawInstance(instance.id, {
      comment: '撤回',
      operatorId: 'u-1',
    })
    expect(withdrawn.status).toBe('withdrawn')
    expect(store.getHistory(instance.id).map((item) => item.action)).toEqual([
      'start',
      'approve',
      'reject',
      'transfer',
      'withdraw',
    ])
  })
})
