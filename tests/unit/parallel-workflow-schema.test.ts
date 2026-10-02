import { describe, it, expect } from 'vitest'
import { useWorkflowDesigner } from '@/components/workflow-designer/use-workflow-designer'
import { migrateWorkflowSchema } from '@/components/workflow-designer/schema'
import { serialWorkflow } from '@af-admin/contracts'

describe('explicit parallel schema authoring', () => {
  it('creates a paired fork and join using the actual end ID and preserves v3 while adding conditions', () => {
    const initial = serialWorkflow('a', 'b')
    initial.nodes.filter((n) => n.type === 'end')[0].id = 'finish'
    initial.edges.forEach((e) => {
      if (e.target === 'end') e.target = 'finish'
    })
    const { schema, addNode } = useWorkflowDesigner(initial, true)
    const fork = addNode('parallel')
    const join = schema.value.nodes.find((n) => n.id === fork.config.joinId)
    expect(schema.value.version).toBe(3)
    expect(join?.config.forkId).toBe(fork.id)
    expect(schema.value.edges.find((e) => e.source === join?.id)?.target).toBe(
      'finish'
    )
    const approvals = schema.value.nodes.filter(
      (node) => node.type === 'approval'
    )
    schema.value.edges.push(
      {
        id: 'branch-a',
        source: fork.id,
        target: approvals[0].id,
        label: '',
        channel: 'branch-1',
      },
      {
        id: 'branch-b',
        source: fork.id,
        target: approvals[1].id,
        label: '',
        channel: 'branch-2',
      }
    )
    addNode('condition')
    expect(schema.value.version).toBe(3)
    addNode('sign')
    expect(schema.value.nodes.some((n) => n.type === 'sign')).toBe(true)
    expect(
      migrateWorkflowSchema(schema.value).nodes.find(
        (n) => n.type === 'parallel'
      )?.config.joinId
    ).toBe(join?.id)
    expect(
      migrateWorkflowSchema(schema.value)
        .edges.filter((edge) => edge.source === fork.id)
        .map((edge) => edge.channel)
        .sort()
    ).toEqual(['branch-1', 'branch-2'])
    expect(() =>
      migrateWorkflowSchema({ ...schema.value, version: 4 })
    ).toThrow('版本')
  })
})
