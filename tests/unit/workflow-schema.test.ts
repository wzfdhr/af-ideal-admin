import { describe, expect, it } from 'vitest'
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  migrateWorkflowSchema,
  validateWorkflowSchema,
  type WorkflowSchema,
} from '@/components/workflow-designer/schema'

const validSchema = (): WorkflowSchema =>
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
      { id: 'end', type: 'end', name: '结束' },
    ],
    edges: [
      { id: 'edge-start-approval', source: 'start', target: 'approval' },
      { id: 'edge-approval-end', source: 'approval', target: 'end' },
    ],
  })

describe('workflow schema', () => {
  it('migrates legacy workflow schema to the current version', () => {
    const migrated = migrateWorkflowSchema({
      nodes: [
        { id: 'start', type: 'start', label: '发起' },
        { id: 'end', type: 'end', label: '完成' },
      ],
      edges: [{ source: 'start', target: 'end' }],
    })

    expect(migrated.version).toBe(CURRENT_WORKFLOW_SCHEMA_VERSION)
    expect(migrated.nodes).toEqual([
      {
        id: 'start',
        type: 'start',
        name: '发起',
        config: {},
      },
      {
        id: 'end',
        type: 'end',
        name: '完成',
        config: {},
      },
    ])
    expect(migrated.edges).toEqual([
      {
        id: 'start-end',
        source: 'start',
        target: 'end',
        label: '',
      },
    ])
  })

  it('accepts a valid process with start, approval and end nodes', () => {
    expect(validateWorkflowSchema(validSchema())).toEqual(validSchema())
  })

  it('rejects workflow schemas without required start or end nodes', () => {
    expect(() =>
      validateWorkflowSchema({
        nodes: [{ id: 'approval', type: 'approval', name: '审批' }],
        edges: [],
      })
    ).toThrow('非法流程 schema')
  })

  it('rejects unknown node types and edges pointing to missing nodes', () => {
    expect(() =>
      validateWorkflowSchema({
        nodes: [
          { id: 'start', type: 'start', name: '开始' },
          { id: 'robot', type: 'robot', name: '自动化' },
          { id: 'end', type: 'end', name: '结束' },
        ],
        edges: [
          { id: 'edge-start-robot', source: 'start', target: 'robot' },
          { id: 'edge-robot-missing', source: 'robot', target: 'missing' },
        ],
      })
    ).toThrow('非法流程 schema')
  })
})
