import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { migrateWorkflowSchema } from '@/components/workflow-designer/schema'
import { useWorkflowDesigner } from '@/components/workflow-designer/use-workflow-designer'
import { serialWorkflow } from '@af-admin/contracts'

describe('controlled workflow format boundary', () => {
  it('preserves structured predicates and branch tags across saved v2 migration and rejects unknown future formats', () => {
    const workflow = serialWorkflow('manager-1', 'manager-2')
    workflow.version = 2
    workflow.nodes.splice(1, 0, {
      id: 'condition',
      type: 'condition',
      name: '数量判断',
      config: {
        condition: {
          mode: 'all',
          predicates: [
            {
              field: 'quantity',
              valueType: 'integer',
              operator: 'gte',
              value: 2,
            },
          ],
        },
      },
    })
    workflow.edges[0].target = 'condition'
    workflow.edges.push({
      id: 'matched',
      source: 'condition',
      target: workflow.nodes.filter((node) => node.type === 'approval')[0].id,
      label: '匹配',
      branch: 'matched',
    })
    workflow.edges.push({
      id: 'fallback',
      source: 'condition',
      target: workflow.nodes.filter((node) => node.type === 'approval')[1].id,
      label: '默认',
      branch: 'fallback',
    })
    const migrated = migrateWorkflowSchema(reactive(workflow))
    expect(
      migrated.nodes.find((node) => node.id === 'condition')?.config.condition
    ).toEqual(workflow.nodes[1].config.condition)
    expect(migrated.edges.at(-1)?.branch).toBe('fallback')
    expect(() => migrateWorkflowSchema({ ...workflow, version: 3 })).toThrow(
      '版本'
    )
    expect(() =>
      migrateWorkflowSchema({
        ...workflow,
        nodes: workflow.nodes.map((node) =>
          node.type === 'condition'
            ? { ...node, config: { condition: 'quantity > 1' } }
            : node
        ),
      })
    ).toThrow()
  })
  it('adding a node preserves other branch connections and creates a structured condition only in the requested mode', () => {
    const { schema, addNode } = useWorkflowDesigner(
      serialWorkflow('manager-1', 'manager-2'),
      true
    )
    const conditional = addNode('condition')
    expect(schema.value.version).toBe(2)
    expect(typeof conditional.config.condition).toBe('object')
    const other = { id: 'other', source: 'start', target: 'end', label: '保留' }
    schema.value.edges.push(other)
    addNode('approval')
    expect(schema.value.edges).toContainEqual(other)
  })
})
